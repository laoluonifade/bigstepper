import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { prizeReminderEmail, prizeShippedEmail, prizeWonEmail } from '../mail/templates';
import { rescore } from '../tables/competition-credits';
import { METRICS, ScoringMethod } from '../tables/competition-rules';
import { RANK_ORDER } from '../tables/scoring-engine';
import { PrizeKind, WinnerDetailsDto } from './dto/prizes.dto';

/** Late Strava uploads and flagged activities get this long after a competition closes before winners are decided. */
const GRACE_HOURS = 24;
/** If reviews are still pending this long after close, decide anyway (pending activities don't count). */
const MAX_WAIT_DAYS = 7;

type Standing = { userId: string; rank: number; score: number | null; qualified: boolean; countryCode: string | null; clubManager: boolean };
type Table = {
  id: string; code: string; title: string; communityId: string; scoringMethod: ScoringMethod; prizeDeliveryCountries: string[];
  prizeClaimDays: number; prizeFulfilment: 'club' | 'jump'; prizeSelection: 'top' | 'draw'; prizesFinalizedAt: Date | null;
};
type Prize = { id: string; position: number; productName: string; quantity: number; kind: PrizeKind };

export const AWARD_STATUSES = ['AWAITING_DETAILS', 'DETAILS_SUBMITTED', 'READY_FOR_DISPATCH', 'SHIPPED', 'DELIVERED', 'FORFEITED', 'ISSUE'] as const;
export type AwardStatus = (typeof AWARD_STATUSES)[number];

/** What a club sees of a winner's claim: only what that kind of prize needs, and only until it's delivered. */
const CLAIM_FOR_CLUB = `CASE WHEN t."prizeFulfilment" = 'club' AND a."status" IN ('DETAILS_SUBMITTED','READY_FOR_DISPATCH','SHIPPED','ISSUE') THEN
  CASE pr."kind"
    WHEN 'product' THEN json_build_object('fullName', a."fullName", 'phone', a."phone", 'address', a."address", 'city', a."city", 'region', a."region", 'country', a."country", 'deliveryNotes', a."deliveryNotes")
    WHEN 'experience' THEN json_build_object('fullName', a."fullName", 'phone', a."phone", 'deliveryNotes', a."deliveryNotes")
    ELSE json_build_object('fullName', a."fullName") END END`;

/**
 * Club prizes after a challenge: who wins what, the winner's claim, reminders, and passing a prize on
 * when a winner can't claim it.
 *
 * The published rule, applied the same way everywhere: winners are entrants who scored, met the
 * minimums, live in one of the delivery countries and don't manage the club. With "top", prizes go down
 * the final standings, tier by tier, each tier to as many winners as its quantity. With "draw", the same
 * people are put in a random order fixed by the challenge and the moment winners were decided, so anyone
 * can check it. A forfeited prize goes to the next such person who hasn't already won here.
 */
@Injectable()
export class PrizeAwardsService {
  private readonly logger = new Logger(PrizeAwardsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private url(path: string) {
    return `${this.config.getOrThrow<string>('WEB_ORIGIN')}${path}`;
  }

  /** Scheduled: decide winners for prize challenges that closed long enough ago. */
  async finalizeDue() {
    const due = await this.dataSource.query(
      `SELECT t."id" FROM "competition_tables" t
       WHERE t."prizeFulfilment" IS NOT NULL AND t."prizesFinalizedAt" IS NULL
         AND t."status" IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED')
         AND t."scoringClosesAt" IS NOT NULL AND t."scoringClosesAt" <= now() - ($1 || ' hours')::interval
         AND (t."scoringClosesAt" <= now() - ($2 || ' days')::interval OR NOT EXISTS (
           SELECT 1 FROM "activities" a JOIN "table_registrations" r ON r."userId" = a."userId"
           WHERE r."tableId" = t."id" AND a."verificationStatus" IN ('PENDING_VERIFICATION','FLAGGED')
             AND a."startedAt" >= COALESCE(t."startsAt", '-infinity'::timestamptz) AND a."finishedAt" <= t."scoringClosesAt"))`,
      [String(GRACE_HOURS), String(MAX_WAIT_DAYS)],
    ) as Array<{ id: string }>;
    for (const { id } of due) {
      try { await this.finalize(id); }
      catch (error) { this.logger.error(`Could not finalize prizes for ${id}`, error instanceof Error ? error.stack : String(error)); }
    }
    return due.length;
  }

  private tableColumns = `"id","code","title","communityId","scoringMethod","prizeDeliveryCountries","prizeClaimDays","prizeFulfilment","prizeSelection","prizesFinalizedAt"`;

  /** Locks the board, gives each prize tier to the next eligible people, and tells the winners. */
  async finalize(tableId: string) {
    const winners = await this.dataSource.transaction(async (manager) => {
      const [table] = await manager.query(`SELECT ${this.tableColumns} FROM "competition_tables" WHERE "id" = $1 FOR UPDATE`, [tableId]) as Table[];
      if (!table?.prizeFulfilment || table.prizesFinalizedAt) return [];
      await rescore(manager, [tableId]);
      const decidedAt = new Date();
      const standings = await this.standings(manager, table);
      const order = this.winnerOrder({ ...table, prizesFinalizedAt: decidedAt }, standings);
      await manager.query(
        `INSERT INTO "table_leaderboard_snapshots" ("tableId","version","algorithmVersion","standings")
         SELECT $1, COALESCE(MAX("version"),0) + 1, $3, $2 FROM "table_leaderboard_snapshots" WHERE "tableId" = $1`,
        [tableId, JSON.stringify({ standings, winnerOrder: order.map((row) => row.userId) }), table.prizeSelection === 'draw' ? 'jump-club-prizes-draw-v1' : 'jump-club-prizes-top-v1'],
      );
      const prizes = await manager.query(`SELECT "id","position","productName","quantity","kind" FROM "competition_prizes" WHERE "tableId" = $1 ORDER BY "position"`, [tableId]) as Prize[];
      const made: string[] = [];
      let next = 0;
      for (const prize of prizes) {
        for (let copy = 0; copy < prize.quantity && next < order.length; copy += 1, next += 1) {
          const [award] = await manager.query(
            `INSERT INTO "product_awards" ("tableId","prizeId","position","userId","standingRank","detailsDueAt")
             VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval) RETURNING "id"`,
            [tableId, prize.id, prize.position, order[next].userId, order[next].rank, String(table.prizeClaimDays)],
          ) as Array<{ id: string }>;
          made.push(award.id);
        }
      }
      await manager.query(`UPDATE "competition_tables" SET "status" = 'SETTLED', "prizesFinalizedAt" = $2 WHERE "id" = $1`, [tableId, decidedAt]);
      await this.notifyClub(manager, table.communityId, `Winners decided for ${table.title}`, `${made.length} ${made.length === 1 ? 'winner has' : 'winners have'} been asked to claim their prizes.`);
      return made;
    });
    for (const awardId of winners) await this.tellWinner(awardId);
    return winners.length;
  }

  private isEligible(table: Pick<Table, 'scoringMethod' | 'prizeDeliveryCountries'>, row: Standing) {
    const scored = row.score !== null && (METRICS[table.scoringMethod]?.better === 'lower' || Number(row.score) > 0);
    return scored && row.qualified && !row.clubManager && Boolean(row.countryCode) && table.prizeDeliveryCountries.includes(row.countryCode!);
  }

  /** Eligible people in the order prizes go to them: the standings, or the recorded draw. */
  private winnerOrder(table: Table, standings: Standing[]) {
    const eligible = standings.filter((row) => this.isEligible(table, row));
    if (table.prizeSelection !== 'draw') return eligible;
    const seed = `${table.id}:${new Date(table.prizesFinalizedAt!).toISOString()}`;
    const key = (userId: string) => createHash('sha256').update(`${seed}:${userId}`).digest('hex');
    return [...eligible].sort((a, b) => key(a.userId).localeCompare(key(b.userId)));
  }

  private async standings(manager: EntityManager, table: Pick<Table, 'id' | 'communityId'>): Promise<Standing[]> {
    return manager.query(
      `SELECT r."userId", row_number() OVER (ORDER BY ${RANK_ORDER})::integer AS "rank", r."score", r."qualified", p."countryCode",
              EXISTS (SELECT 1 FROM "club_memberships" m WHERE m."clubId" = $2 AND m."userId" = r."userId" AND m."role" IN ('owner','admin')) AS "clubManager"
       FROM "table_registrations" r LEFT JOIN "profiles" p ON p."userId" = r."userId"
       WHERE r."tableId" = $1 ORDER BY ${RANK_ORDER}`,
      [table.id, table.communityId],
    );
  }

  /** In-app and email: you won, here's what, claim it by this date. */
  private async tellWinner(awardId: string) {
    const [award] = await this.dataSource.query(
      `SELECT a."id", a."userId", a."detailsDueAt", pr."productName", t."title", u."email", u."displayName"
       FROM "product_awards" a JOIN "competition_prizes" pr ON pr."id" = a."prizeId" JOIN "competition_tables" t ON t."id" = a."tableId"
       JOIN "users" u ON u."id" = a."userId" WHERE a."id" = $1`, [awardId],
    ) as Array<{ id: string; userId: string; detailsDueAt: Date; productName: string; title: string; email: string; displayName: string }>;
    if (!award) return;
    const due = award.detailsDueAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
    await this.dataSource.query(
      `INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,'PRIZE_WON',$2,$3,'/prizes')`,
      [award.userId, `You won ${award.productName}!`, `From ${award.title}. Claim it by ${due}.`],
    );
    this.mail.sendInBackground(prizeWonEmail({ address: award.email, name: award.displayName }, award.productName, award.title, due, this.url('/prizes')));
  }

  /** The club's owner and managers. */
  private async notifyClub(manager: EntityManager, clubId: string, title: string, body: string) {
    await manager.query(
      `INSERT INTO "notifications" ("userId","type","title","body","link")
       SELECT m."userId",'CLUB_PRIZES',$2,$3,'/clubs/' || c."slug" || '/dashboard' FROM "club_memberships" m JOIN "clubs" c ON c."id" = m."clubId"
       WHERE m."clubId" = $1 AND m."role" IN ('owner','admin')`,
      [clubId, title, body],
    );
  }

  /** Scheduled: remind winners who haven't claimed, and pass on prizes whose deadline passed. */
  async remindAndForfeit() {
    const reminders = await this.dataSource.query(
      `UPDATE "product_awards" a SET "lastReminderAt" = now()
       FROM "competition_prizes" pr, "users" u
       WHERE pr."id" = a."prizeId" AND u."id" = a."userId" AND a."status" = 'AWAITING_DETAILS'
         AND a."detailsDueAt" > now() AND a."detailsDueAt" <= now() + interval '3 days'
         AND (a."lastReminderAt" IS NULL OR a."lastReminderAt" < now() - interval '1 day')
       RETURNING a."userId", a."detailsDueAt", pr."productName", u."email"`,
    ) as [Array<{ userId: string; detailsDueAt: Date; productName: string; email: string }>, number];
    for (const row of reminders[0] ?? []) {
      const due = new Date(row.detailsDueAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
      await this.dataSource.query(
        `INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,'PRIZE_REMINDER',$2,$3,'/prizes')`,
        [row.userId, `Claim your ${row.productName}`, `Claim it by ${due} or it passes to the next finisher.`],
      );
      this.mail.sendInBackground(prizeReminderEmail({ address: row.email }, row.productName, due, this.url('/prizes')));
    }
    const expired = await this.dataSource.query(
      `SELECT "id" FROM "product_awards" WHERE "status" = 'AWAITING_DETAILS' AND "detailsDueAt" <= now()`,
    ) as Array<{ id: string }>;
    for (const { id } of expired) await this.forfeit(id, 'The prize wasn’t claimed in time');
    return { reminded: reminders[0]?.length ?? 0, forfeited: expired.length };
  }

  /**
   * A winner can't take the prize (missed the deadline, can't be delivered to): it passes to the next
   * eligible person, in the same order, who hasn't already won here.
   */
  async forfeit(awardId: string, reason: string) {
    const next = await this.dataSource.transaction(async (manager) => {
      const [award] = await manager.query(
        `SELECT a.*, pr."productName" FROM "product_awards" a JOIN "competition_prizes" pr ON pr."id" = a."prizeId" WHERE a."id" = $1 FOR UPDATE OF a`, [awardId],
      ) as Array<{ id: string; tableId: string; prizeId: string; position: number; userId: string; status: AwardStatus; productName: string }>;
      if (!award) throw new NotFoundException('Award not found');
      if (['SHIPPED', 'DELIVERED', 'FORFEITED'].includes(award.status)) throw new ConflictException('This prize can no longer be passed on');
      await manager.query(`UPDATE "product_awards" SET "status" = 'FORFEITED', "forfeitReason" = $2, "updatedAt" = now() WHERE "id" = $1`, [awardId, reason.slice(0, 200)]);
      await manager.query(
        `INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,'PRIZE_FORFEITED',$2,$3,'/prizes')`,
        [award.userId, `Your ${award.productName} passed to the next finisher`, reason],
      );
      const [table] = await manager.query(`SELECT ${this.tableColumns} FROM "competition_tables" WHERE "id" = $1`, [award.tableId]) as Table[];
      const awarded = new Set((await manager.query(`SELECT "userId" FROM "product_awards" WHERE "tableId" = $1`, [award.tableId]) as Array<{ userId: string }>).map((row) => row.userId));
      const candidate = this.winnerOrder(table, await this.standings(manager, table)).find((row) => !awarded.has(row.userId));
      if (!candidate) {
        await this.notifyClub(manager, table.communityId, `${award.productName} has no eligible winner`, 'Nobody else eligible is left. The prize stays with the club.');
        return null;
      }
      const [created] = await manager.query(
        `INSERT INTO "product_awards" ("tableId","prizeId","position","userId","standingRank","detailsDueAt")
         VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval) RETURNING "id"`,
        [award.tableId, award.prizeId, award.position, candidate.userId, candidate.rank, String(table.prizeClaimDays)],
      ) as Array<{ id: string }>;
      await this.notifyClub(manager, table.communityId, `${award.productName} passed to the next finisher`, reason);
      return created.id;
    });
    if (next) await this.tellWinner(next);
    return { forfeited: true, passedTo: next };
  }

  /** A winner's prizes, with what they can still do. Redemption instructions appear once claimed. */
  async mine(userId: string) {
    return this.dataSource.query(
      `SELECT a."id", a."position", a."status", a."detailsDueAt", a."fullName", a."phone", a."address", a."city", a."region", a."country",
              a."deliveryNotes", a."trackingNote", a."submittedAt", a."shippedAt", a."deliveredAt", a."forfeitReason", a."createdAt",
              pr."productName", pr."description", pr."imageUrl", pr."kind",
              CASE WHEN a."status" NOT IN ('AWAITING_DETAILS','FORFEITED') THEN pr."redeemInstructions" END AS "redeemInstructions",
              t."code", t."title", t."prizeDeliveryCountries" AS "deliveryCountries", t."prizeShipping" AS "shipping", t."prizeShippingNote" AS "shippingNote",
              t."prizeFulfilment" AS "fulfilment", c."name" AS "clubName", c."slug" AS "clubSlug", c."logoUrl" AS "clubLogoUrl"
       FROM "product_awards" a JOIN "competition_prizes" pr ON pr."id" = a."prizeId"
       JOIN "competition_tables" t ON t."id" = a."tableId" JOIN "clubs" c ON c."id" = t."communityId"
       WHERE a."userId" = $1 ORDER BY a."createdAt" DESC`, [userId],
    );
  }

  /** The winner claims: the details the prize needs, and for products a country the club delivers to. */
  async submitDetails(userId: string, awardId: string, input: WinnerDetailsDto) {
    return this.dataSource.transaction(async (manager) => {
      const [award] = await manager.query(
        `SELECT a."id", a."status", a."detailsDueAt", t."prizeDeliveryCountries", t."communityId", t."title", t."code", t."prizeFulfilment", pr."productName", pr."kind"
         FROM "product_awards" a JOIN "competition_tables" t ON t."id" = a."tableId" JOIN "competition_prizes" pr ON pr."id" = a."prizeId"
         WHERE a."id" = $1 AND a."userId" = $2 FOR UPDATE OF a`, [awardId, userId],
      ) as Array<{ id: string; status: AwardStatus; detailsDueAt: Date; prizeDeliveryCountries: string[]; communityId: string; title: string; code: string; prizeFulfilment: string; productName: string; kind: PrizeKind }>;
      if (!award) throw new NotFoundException('Prize not found');
      if (!['AWAITING_DETAILS', 'DETAILS_SUBMITTED'].includes(award.status)) throw new ConflictException('This prize is already on its way, so your details can’t change. Contact the club or Jump.');
      if (award.status === 'AWAITING_DETAILS' && award.detailsDueAt <= new Date()) throw new ConflictException('The deadline to claim this prize has passed');
      if (award.kind === 'product') {
        if (!input.phone || !input.address || !input.city || !input.region || !input.country) throw new BadRequestException('Add your phone number and full delivery address');
        if (!award.prizeDeliveryCountries.includes(input.country)) throw new BadRequestException('This prize can only be delivered to one of the countries listed for the competition');
      }
      if (award.kind === 'experience' && !input.phone) throw new BadRequestException('Add a phone number so the club can arrange it with you');
      const product = award.kind === 'product';
      await manager.query(
        `UPDATE "product_awards" SET "fullName"=$2,"phone"=$3,"address"=$4,"city"=$5,"region"=$6,"country"=$7,"deliveryNotes"=$8,
                "status"='DETAILS_SUBMITTED',"submittedAt"=now(),"updatedAt"=now() WHERE "id"=$1`,
        [awardId, input.fullName.trim(), award.kind === 'discount' ? null : input.phone?.trim() ?? null, product ? input.address!.trim() : null,
          product ? input.city!.trim() : null, product ? input.region!.trim() : null, product ? input.country! : null, input.deliveryNotes?.trim() || null],
      );
      await this.notifyClub(manager, award.communityId, `${award.productName} claimed`, `A winner of ${award.title} claimed their prize.${award.prizeFulfilment === 'jump' ? ' Jump is handling delivery.' : ' It’s ready for you in the dashboard.'}`);
      return { submitted: true };
    });
  }

  /** Every claim on a club's prizes, for its dashboard, with only the details each needs. */
  clubClaims(clubId: string) {
    return this.dataSource.query(
      `SELECT a."id", a."status", a."position", a."detailsDueAt", a."submittedAt", a."shippedAt", a."deliveredAt", a."trackingNote", a."issueNote", a."createdAt",
              pr."productName", pr."kind", t."code", t."title", t."prizeFulfilment" AS "fulfilment",
              COALESCE(p."displayName", u."displayName", 'Winner') AS "winnerName", p."username" AS "winnerUsername",
              ${CLAIM_FOR_CLUB} AS "claim"
       FROM "product_awards" a JOIN "competition_tables" t ON t."id" = a."tableId" JOIN "competition_prizes" pr ON pr."id" = a."prizeId"
       JOIN "users" u ON u."id" = a."userId" LEFT JOIN "profiles" p ON p."userId" = a."userId"
       WHERE t."communityId" = $1
       ORDER BY CASE a."status" WHEN 'ISSUE' THEN 0 WHEN 'DETAILS_SUBMITTED' THEN 1 WHEN 'READY_FOR_DISPATCH' THEN 2 WHEN 'AWAITING_DETAILS' THEN 3 ELSE 4 END, a."createdAt" DESC
       LIMIT 500`,
      [clubId],
    );
  }

  /**
   * Fulfilment moves forward: ready → shipped → delivered (or an issue). The club's managers move the
   * prizes they deliver; Jump admins can move any.
   */
  async updateStatus(awardId: string, status: 'READY_FOR_DISPATCH' | 'SHIPPED' | 'DELIVERED' | 'ISSUE', notes: { trackingNote?: string; issueNote?: string }, access: { clubUserId?: string; admin?: boolean }) {
    const [award] = await this.dataSource.query(
      `SELECT a."id", a."status", a."userId", t."communityId", t."prizeFulfilment", pr."productName", u."email"
       FROM "product_awards" a JOIN "competition_tables" t ON t."id" = a."tableId" JOIN "competition_prizes" pr ON pr."id" = a."prizeId"
       JOIN "users" u ON u."id" = a."userId" WHERE a."id" = $1`, [awardId],
    ) as Array<{ id: string; status: AwardStatus; userId: string; communityId: string; prizeFulfilment: string; productName: string; email: string }>;
    if (!award) throw new NotFoundException('Award not found');
    if (!access.admin) {
      const [manager] = await this.dataSource.query(`SELECT 1 FROM "club_memberships" WHERE "clubId" = $1 AND "userId" = $2 AND "role" IN ('owner','admin')`, [award.communityId, access.clubUserId]) as unknown[];
      if (!manager) throw new ForbiddenException('Only the club’s owner or managers can update this prize');
      if (award.prizeFulfilment === 'jump') throw new ForbiddenException('Jump is delivering this prize');
    }
    const order: AwardStatus[] = ['DETAILS_SUBMITTED', 'READY_FOR_DISPATCH', 'SHIPPED', 'DELIVERED'];
    if (status !== 'ISSUE') {
      const from = order.indexOf(award.status === 'ISSUE' ? 'DETAILS_SUBMITTED' : award.status);
      if (from < 0) throw new ConflictException('The winner hasn’t claimed it yet');
      if (order.indexOf(status) <= from && !access.admin) throw new ConflictException('That step is already done');
    }
    await this.dataSource.query(
      `UPDATE "product_awards" SET "status"=$2::varchar,"trackingNote"=COALESCE($3::varchar,"trackingNote"),"issueNote"=CASE WHEN $2::varchar='ISSUE' THEN $4::varchar ELSE "issueNote" END,
              "shippedAt"=CASE WHEN $2::varchar='SHIPPED' THEN now() ELSE "shippedAt" END,"deliveredAt"=CASE WHEN $2::varchar='DELIVERED' THEN now() ELSE "deliveredAt" END,"updatedAt"=now()
       WHERE "id"=$1`,
      [awardId, status, notes.trackingNote?.trim() || null, notes.issueNote?.trim() || null],
    );
    if (status === 'SHIPPED' || status === 'DELIVERED') {
      await this.dataSource.query(
        `INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,'PRIZE_UPDATE',$2,$3,'/prizes')`,
        [award.userId, status === 'SHIPPED' ? `Your ${award.productName} is on its way` : `Your ${award.productName} was delivered`, notes.trackingNote?.trim() || 'Open Jump to see the details.'],
      );
      this.mail.sendInBackground(prizeShippedEmail({ address: award.email }, award.productName, status, notes.trackingNote?.trim() || null, this.url('/prizes')));
    }
    return { status };
  }
}
