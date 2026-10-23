import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AmlSettings } from './aml-settings';
import { AmlService, NewFlag } from './aml.service';

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`;

/** Paid challenges in the monitoring window, with the host left out of the entrants. */
const PAID_ENTRIES = `
  SELECT r."tableId", r."userId", r."joinedAt", r."creditedDistanceMetres", r."creditedSteps", t."entryFeeKobo", t."scoringClosesAt"
  FROM "table_registrations" r JOIN "competition_tables" t ON t."id"=r."tableId"
  WHERE t."type"='paid' AND r."userId"<>t."creatorId" AND t."createdAt" >= now() - make_interval(days => $1)`;

/**
 * Looks for the patterns of money being moved through challenges rather than raced for. Each finding
 * becomes a risk flag with its reason and evidence; flags drive the risk score and payout holds.
 */
@Injectable()
export class AmlMonitorService {
  private readonly logger = new Logger(AmlMonitorService.name);
  constructor(private readonly dataSource: DataSource, private readonly aml: AmlService) {}

  async scan() {
    const settings = await this.aml.settings();
    const rules: Array<[string, (settings: AmlSettings) => Promise<NewFlag[]>]> = [
      ['pairs', (s) => this.repeatedPairs(s)],
      ['same winner', (s) => this.sameWinner(s)],
      ['rotation', (s) => this.winRotation(s)],
      ['fast', (s) => this.fastChallenges(s)],
      ['spikes', (s) => this.spikes(s)],
      ['shared identifiers', (s) => this.sharedIdentifiers(s)],
      ['no-show entries', (s) => this.noShowEntries(s)],
      ['deposit cycling', (s) => this.depositCycling(s)],
    ];
    let raised = 0;
    for (const [name, rule] of rules) {
      try {
        for (const flag of await rule(settings)) if (await this.aml.raiseFlag(flag)) raised += 1;
      } catch (error) {
        this.logger.error(`AML rule "${name}" failed`, error instanceof Error ? error.stack : String(error));
      }
    }
    return { raised };
  }

  /** The same two people in many paid challenges together, worse when prizes went between them. */
  private async repeatedPairs(s: AmlSettings): Promise<NewFlag[]> {
    const rows = await this.dataSource.query(
      `WITH e AS (${PAID_ENTRIES}),
       pairs AS (
         SELECT a."userId" a, b."userId" b, count(*)::integer shared, array_agg(a."tableId") tables
         FROM e a JOIN e b ON b."tableId"=a."tableId" AND a."userId" < b."userId"
         GROUP BY 1, 2 HAVING count(*) >= $2)
       SELECT p.*, (SELECT count(*)::integer FROM "prize_awards" w WHERE w."tableId" = ANY(p.tables) AND w."winnerUserId" IN (p.a, p.b)) wins FROM pairs p`,
      [s.windowDays, s.pairRepeatCount],
    ) as Array<{ a: string; b: string; shared: number; tables: string[]; wins: number }>;
    return rows.map((row) => ({
      rule: 'REPEATED_PAIR', severity: row.wins >= 2 ? 2 : 1, userId: row.a, relatedUserIds: [row.b],
      reason: `Entered ${row.shared} paid competitions with the same person in ${s.windowDays} days${row.wins ? `; one of them won ${row.wins}` : ''}`,
      evidence: { shared: row.shared, wins: row.wins, tableIds: row.tables },
      fingerprint: `REPEATED_PAIR:${row.a}:${row.b}:${Math.floor(row.shared / s.pairRepeatCount)}`,
    }));
  }

  /** One person keeps beating the same person for money: entry fees flowing one way. */
  private async sameWinner(s: AmlSettings): Promise<NewFlag[]> {
    const rows = await this.dataSource.query(
      `SELECT w."winnerUserId" winner, r."userId" loser, count(DISTINCT w."tableId")::integer times,
              sum(w."amountKobo")::bigint amount, array_agg(DISTINCT w."tableId") tables
       FROM "prize_awards" w JOIN "competition_tables" t ON t."id"=w."tableId" AND t."type"='paid'
       JOIN "table_registrations" r ON r."tableId"=w."tableId" AND r."userId"<>w."winnerUserId" AND r."userId"<>t."creatorId"
       WHERE w."createdAt" >= now() - make_interval(days => $1)
         AND NOT EXISTS (SELECT 1 FROM "prize_awards" w2 WHERE w2."tableId"=w."tableId" AND w2."winnerUserId"=r."userId")
       GROUP BY 1, 2 HAVING count(DISTINCT w."tableId") >= $2`,
      [s.windowDays, s.sameWinnerCount],
    ) as Array<{ winner: string; loser: string; times: number; amount: string; tables: string[] }>;
    return rows.map((row) => ({
      rule: 'SAME_WINNER', severity: 2, userId: row.winner, relatedUserIds: [row.loser],
      reason: `Beat the same person in ${row.times} paid competitions in ${s.windowDays} days, winning ${naira(Number(row.amount))}`,
      evidence: { times: row.times, amountKobo: Number(row.amount), tableIds: row.tables },
      fingerprint: `SAME_WINNER:${row.winner}:${row.loser}:${Math.floor(row.times / s.sameWinnerCount)}`,
    }));
  }

  /** Two people in small paid challenges who take turns winning: wins rotated between them. */
  private async winRotation(s: AmlSettings): Promise<NewFlag[]> {
    const rows = await this.dataSource.query(
      `WITH e AS (${PAID_ENTRIES}),
       sizes AS (SELECT "tableId", count(*)::integer n FROM e GROUP BY 1),
       pairs AS (
         SELECT a."userId" a, b."userId" b, array_agg(a."tableId") tables, count(*)::integer shared, avg(z.n) "avgSize"
         FROM e a JOIN e b ON b."tableId"=a."tableId" AND a."userId" < b."userId" JOIN sizes z ON z."tableId"=a."tableId"
         GROUP BY 1, 2 HAVING count(*) >= $2)
       SELECT p.*, (SELECT count(*)::integer FROM "prize_awards" w WHERE w."tableId"=ANY(p.tables) AND w."place"=1 AND w."winnerUserId"=p.a) "winsA",
                   (SELECT count(*)::integer FROM "prize_awards" w WHERE w."tableId"=ANY(p.tables) AND w."place"=1 AND w."winnerUserId"=p.b) "winsB"
       FROM pairs p WHERE p."avgSize" <= 6`,
      [s.windowDays, s.rotationSharedCount],
    ) as Array<{ a: string; b: string; tables: string[]; shared: number; avgSize: number; winsA: number; winsB: number }>;
    return rows.filter((row) => row.winsA >= 1 && row.winsB >= 1 && row.winsA + row.winsB >= row.shared * 0.75).map((row) => ({
      rule: 'WIN_ROTATION', severity: 3, userId: row.a, relatedUserIds: [row.b],
      reason: `Took turns winning: ${row.winsA} and ${row.winsB} wins across ${row.shared} small paid competitions together. Possible coordinated laundering.`,
      evidence: { shared: row.shared, winsA: row.winsA, winsB: row.winsB, averageEntrants: Number(row.avgSize), tableIds: row.tables },
      fingerprint: `WIN_ROTATION:${row.a}:${row.b}:${Math.floor(row.shared / s.rotationSharedCount)}`,
    }));
  }

  /** Paid challenges that open and close (or settle) very quickly, so nobody really races. */
  private async fastChallenges(s: AmlSettings): Promise<NewFlag[]> {
    const rows = await this.dataSource.query(
      `SELECT t."id", t."creatorId", t."code", t."guaranteedPrizeKobo" pot,
              round(extract(epoch FROM (LEAST(t."scoringClosesAt", COALESCE(st."at", 'infinity')) - t."createdAt")) / 60)::integer minutes,
              COALESCE((SELECT json_agg(r."userId") FROM "table_registrations" r WHERE r."tableId"=t."id" AND r."userId"<>t."creatorId"), '[]') entrants
       FROM "competition_tables" t
       LEFT JOIN LATERAL (SELECT min("settledAt") "at" FROM "table_settlements" WHERE "tableId"=t."id") st ON true
       WHERE t."type"='paid' AND t."createdAt" >= now() - make_interval(days => $1)
         AND LEAST(t."scoringClosesAt", COALESCE(st."at", 'infinity')) - t."createdAt" < make_interval(mins => $2)`,
      [s.windowDays, s.fastChallengeMinutes],
    ) as Array<{ id: string; creatorId: string; code: string; pot: string | null; minutes: number; entrants: string[] }>;
    return rows.map((row) => ({
      rule: 'FAST_CHALLENGE', severity: Number(row.pot ?? 0) >= s.payoutReviewThresholdKobo ? 2 : 1, userId: row.creatorId, relatedUserIds: row.entrants, tableId: row.id,
      reason: `Paid competition ${row.code} ran ${row.minutes} minutes from creation to close, under the ${s.fastChallengeMinutes}-minute minimum`,
      evidence: { minutes: row.minutes, potKobo: Number(row.pot ?? 0) },
      fingerprint: `FAST_CHALLENGE:${row.id}`,
    }));
  }

  /** A sudden jump in stakes or payouts against the account's own recent weeks. */
  private async spikes(s: AmlSettings): Promise<NewFlag[]> {
    const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    const rows = await this.dataSource.query(
      `WITH money AS (
         SELECT 'stakes' kind, r."userId", t."entryFeeKobo"::bigint amount, r."joinedAt" at
         FROM "table_registrations" r JOIN "competition_tables" t ON t."id"=r."tableId"
         WHERE t."type"='paid' AND r."userId"<>t."creatorId" AND r."joinedAt" >= now() - interval '63 days'
         UNION ALL
         SELECT 'payouts', rc."userId", COALESCE(a."amountKobo", e."amountKobo")::bigint, p."createdAt"
         FROM "payout_requests" p JOIN "payout_recipients" rc ON rc."id"=p."recipientId"
         LEFT JOIN "prize_awards" a ON a."id"=p."awardId" LEFT JOIN "creator_earnings" e ON e."id"=p."creatorEarningId"
         WHERE p."createdAt" >= now() - interval '63 days')
       SELECT kind, "userId",
              COALESCE(sum(amount) FILTER (WHERE at >= now() - interval '7 days'),0)::bigint recent,
              count(*) FILTER (WHERE at >= now() - interval '7 days')::integer "recentCount",
              (COALESCE(sum(amount) FILTER (WHERE at < now() - interval '7 days'),0) / 8.0)::float weekly,
              (count(*) FILTER (WHERE at < now() - interval '7 days') / 8.0)::float "weeklyCount"
       FROM money GROUP BY 1, 2`,
    ) as Array<{ kind: 'stakes' | 'payouts'; userId: string; recent: string; recentCount: number; weekly: number; weeklyCount: number }>;
    return rows.filter((row) => Number(row.recent) >= Math.max(s.spikeMinKobo, row.weekly * s.spikeMultiplier)).map((row) => ({
      rule: row.kind === 'stakes' ? 'STAKE_SPIKE' : 'PAYOUT_SPIKE', severity: 1, userId: row.userId,
      reason: `${row.kind === 'stakes' ? 'Paid entries' : 'Payout requests'} jumped to ${naira(Number(row.recent))} (${row.recentCount}) this week, against ${naira(Math.round(row.weekly))} (${row.weeklyCount.toFixed(1)}) a week before`,
      evidence: { recentKobo: Number(row.recent), recentCount: row.recentCount, weeklyAverageKobo: Math.round(row.weekly), weeklyAverageCount: row.weeklyCount },
      fingerprint: `${row.kind === 'stakes' ? 'STAKE_SPIKE' : 'PAYOUT_SPIKE'}:${row.userId}:${week}`,
    }));
  }

  /** Several accounts behind one device, bank account or IP: a way round per-person limits. */
  private async sharedIdentifiers(s: AmlSettings): Promise<NewFlag[]> {
    const flags: NewFlag[] = [];
    const paidUsers = `SELECT DISTINCT "userId" FROM "payment_intents" WHERE "status"='SUCCEEDED' UNION SELECT DISTINCT r."userId" FROM "payout_recipients" r`;
    const devices = await this.dataSource.query(
      `SELECT d."deviceId" id, array_agg(DISTINCT d."userId"::text) users, array_agg(DISTINCT d."userId"::text) FILTER (WHERE d."userId" IN (${paidUsers})) paid
       FROM "user_devices" d GROUP BY 1 HAVING count(DISTINCT d."userId") > 1`,
    ) as Array<{ id: string; users: string[]; paid: string[] | null }>;
    const together = async (users: string[]) => {
      const rows = await this.dataSource.query(
        `WITH e AS (${PAID_ENTRIES}) SELECT 1 FROM e WHERE e."userId"::text = ANY($2) GROUP BY e."tableId" HAVING count(DISTINCT e."userId") > 1 LIMIT 1`,
        [s.windowDays, users],
      ) as unknown[];
      return rows.length > 0;
    };
    for (const device of devices) {
      const paid = device.paid ?? [];
      const severity = paid.length >= 2 ? (await together(paid) ? 3 : 2) : 1;
      if (severity === 1) continue;
      for (const userId of paid) {
        flags.push({
          rule: 'SHARED_DEVICE', severity: severity as 2 | 3, userId, relatedUserIds: device.users.filter((id) => id !== userId),
          reason: `Uses the same device as ${device.users.length - 1} other account${device.users.length > 2 ? 's' : ''} with paid activity${severity === 3 ? ', and they entered the same paid competition' : ''}`,
          evidence: { accounts: device.users.length }, fingerprint: `SHARED_DEVICE:${device.id}:${userId}`,
        });
      }
    }
    const banks = await this.dataSource.query(
      `SELECT h hash, array_agg(DISTINCT u::text) users FROM (
         SELECT "accountHash" h, "userId" u FROM "payout_recipients" WHERE "accountHash" IS NOT NULL
         UNION SELECT "accountHash", "userId" FROM "kyc_verifications" WHERE "accountHash" IS NOT NULL AND "status" IN ('VERIFIED','PENDING')) x
       GROUP BY 1 HAVING count(DISTINCT u) > 1`,
    ) as Array<{ hash: string; users: string[] }>;
    for (const bank of banks) for (const userId of bank.users) {
      flags.push({
        rule: 'SHARED_BANK_ACCOUNT', severity: 3, userId, relatedUserIds: bank.users.filter((id) => id !== userId),
        reason: `Shares a payout bank account with ${bank.users.length - 1} other account${bank.users.length > 2 ? 's' : ''}`,
        evidence: { accounts: bank.users.length }, fingerprint: `SHARED_BANK_ACCOUNT:${bank.hash.slice(0, 24)}:${userId}`,
      });
    }
    // Many people share mobile-network IPs, so an IP only counts when the accounts met in a paid challenge.
    const ips = await this.dataSource.query(
      `WITH e AS (${PAID_ENTRIES})
       SELECT d1."lastIp" ip, a."tableId", array_agg(DISTINCT a."userId"::text) users
       FROM e a JOIN e b ON b."tableId"=a."tableId" AND b."userId"<>a."userId"
       JOIN "user_devices" d1 ON d1."userId"=a."userId" JOIN "user_devices" d2 ON d2."userId"=b."userId" AND d2."lastIp"=d1."lastIp"
       WHERE d1."lastIp" IS NOT NULL AND d1."lastSeenAt" >= now() - make_interval(days => $1)
       GROUP BY 1, 2`,
      [s.windowDays],
    ) as Array<{ ip: string; tableId: string; users: string[] }>;
    for (const row of ips) for (const userId of row.users) {
      flags.push({
        rule: 'SHARED_IP', severity: 1, userId, relatedUserIds: row.users.filter((id) => id !== userId), tableId: row.tableId,
        reason: `Entered a paid competition with ${row.users.length - 1} account${row.users.length > 2 ? 's' : ''} on the same IP address`,
        evidence: { accounts: row.users.length }, fingerprint: `SHARED_IP:${row.tableId}:${userId}`,
      });
    }
    return flags;
  }

  /** Paying into challenges and never running: entries that look like transfers to whoever wins. */
  private async noShowEntries(s: AmlSettings): Promise<NewFlag[]> {
    const rows = await this.dataSource.query(
      `WITH e AS (${PAID_ENTRIES}),
       idle AS (
         SELECT e."userId", count(*)::integer entries, sum(e."entryFeeKobo")::bigint paid, array_agg(e."tableId") tables
         FROM e WHERE e."scoringClosesAt" < now() AND e."creditedDistanceMetres" = 0 AND e."creditedSteps" = 0
         GROUP BY 1 HAVING count(*) >= $2)
       SELECT i.*, COALESCE((SELECT json_agg(DISTINCT w."winnerUserId") FROM "prize_awards" w WHERE w."tableId" = ANY(i.tables)), '[]') winners FROM idle i`,
      [s.windowDays, s.noShowEntries],
    ) as Array<{ userId: string; entries: number; paid: string; tables: string[]; winners: string[] }>;
    return rows.map((row) => ({
      rule: 'NO_SHOW_ENTRIES', severity: 2, userId: row.userId, relatedUserIds: row.winners,
      reason: `Paid ${naira(Number(row.paid))} into ${row.entries} competitions without recording any activity`,
      evidence: { entries: row.entries, paidKobo: Number(row.paid), tableIds: row.tables },
      fingerprint: `NO_SHOW_ENTRIES:${row.userId}:${Math.floor(row.entries / s.noShowEntries)}`,
    }));
  }

  /** Money in and straight back out: a payout requested soon after funding the wallet. */
  private async depositCycling(s: AmlSettings): Promise<NewFlag[]> {
    const rows = await this.dataSource.query(
      `SELECT p."id", rc."userId", COALESCE(a."amountKobo", e."amountKobo")::bigint amount, f.total funded
       FROM "payout_requests" p JOIN "payout_recipients" rc ON rc."id"=p."recipientId"
       LEFT JOIN "prize_awards" a ON a."id"=p."awardId" LEFT JOIN "creator_earnings" e ON e."id"=p."creatorEarningId"
       JOIN LATERAL (SELECT COALESCE(sum(i."amountKobo"),0)::bigint total FROM "payment_intents" i
                     WHERE i."userId"=rc."userId" AND i."purpose" IN ('WALLET_FUNDING','CHALLENGE_ENTRY') AND i."status"='SUCCEEDED'
                       AND i."createdAt" BETWEEN p."createdAt" - make_interval(hours => $2) AND p."createdAt") f ON true
       WHERE p."createdAt" >= now() - make_interval(days => $1) AND f.total >= $3`,
      [s.windowDays, s.cycleHours, s.cycleMinKobo],
    ) as Array<{ id: string; userId: string; amount: string; funded: string }>;
    return rows.map((row) => ({
      rule: 'DEPOSIT_CYCLE', severity: 1, userId: row.userId, payoutRequestId: row.id,
      reason: `Requested a ${naira(Number(row.amount))} payout within ${s.cycleHours} hours of paying in ${naira(Number(row.funded))}`,
      evidence: { payoutKobo: Number(row.amount), paidInKobo: Number(row.funded) },
      fingerprint: `DEPOSIT_CYCLE:${row.id}`,
    }));
  }
}
