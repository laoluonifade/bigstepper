import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { prizeReminderEmail, prizeShippedEmail, prizeWonEmail } from '../mail/templates';
import { rescore } from '../tables/competition-credits';
import { METRICS, ScoringMethod } from '../tables/competition-rules';
import { RANK_ORDER } from '../tables/scoring-engine';
import { WinnerDetailsDto } from './dto/sponsor.dto';

/** Late Strava uploads and flagged activities get this long after a competition closes before winners are decided. */
const GRACE_HOURS = 24;
/** If reviews are still pending this long after close, decide anyway (pending activities don't count). */
const MAX_WAIT_DAYS = 7;

type Standing = { userId: string; rank: number; score: number | null; qualified: boolean; countryCode: string | null; sponsorTeam: boolean };
type Table = { id: string; code: string; title: string; sponsorId: string; scoringMethod: ScoringMethod; prizeDeliveryCountries: string[]; prizeClaimDays: number; prizeFulfilment: 'sponsor' | 'jump' };

export const AWARD_STATUSES = ['AWAITING_DETAILS', 'DETAILS_SUBMITTED', 'READY_FOR_DISPATCH', 'SHIPPED', 'DELIVERED', 'FORFEITED', 'ISSUE'] as const;
export type AwardStatus = (typeof AWARD_STATUSES)[number];

/**
 * Product prizes after a competition: who wins what, collecting winners' delivery details, reminders,
 * and passing a prize on when a winner can't claim it.
 *
 * The published rule, applied the same way everywhere: prizes go down the final standings in order to
 * entrants who scored, met the minimums, live in one of the delivery countries, and aren't on the
 * sponsor's team. A forfeited prize goes to the next such finisher who hasn't already been awarded.
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

  /** Scheduled: decide winners for product-prize competitions that closed long enough ago. */
  async finalizeDue() {
    const due = await this.dataSource.query(
      `SELECT t."id" FROM "competition_tables" t
       WHERE t."sponsorId" IS NOT NULL AND t."prizesFinalizedAt" IS NULL
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

  /** Locks the board, assigns each prize position to the next eligible finisher, and tells the winners. */
  async finalize(tableId: string) {
    const winners = await this.dataSource.transaction(async (manager) => {
      const [table] = await manager.query(
        `SELECT "id","code","title","sponsorId","scoringMethod","prizeDeliveryCountries","prizeClaimDays","prizeFulfilment","prizesFinalizedAt"
         FROM "competition_tables" WHERE "id" = $1 FOR UPDATE`, [tableId],
      ) as Array<Table & { prizesFinalizedAt: Date | null }>;
      if (!table?.sponsorId || table.prizesFinalizedAt) return [];
      await rescore(manager, [tableId]);
      const standings = await this.standings(manager, table);
      await manager.query(
        `INSERT INTO "table_leaderboard_snapshots" ("tableId","version","algorithmVersion","standings")
         SELECT $1, COALESCE(MAX("version"),0) + 1, 'jump-product-prizes-v1', $2 FROM "table_leaderboard_snapshots" WHERE "tableId" = $1`,
        [tableId, JSON.stringify(standings)],
      );
      const prizes = await manager.query(`SELECT "id","position","productName" FROM "competition_prizes" WHERE "tableId" = $1 ORDER BY "position"`, [tableId]) as Array<{ id: string; position: number; productName: string }>;
      const eligible = standings.filter((row) => this.isEligible(table, row));
      const made: Array<{ awardId: string; userId: string; prize: string }> = [];
      prizes.forEach((prize, index) => {
        const winner = eligible[index];
        if (winner) made.push({ awardId: '', userId: winner.userId, prize: prize.productName });
      });
      for (let index = 0; index < prizes.length && index < eligible.length; index += 1) {
        const [award] = await manager.query(
          `INSERT INTO "product_awards" ("tableId","prizeId","position","userId","standingRank","detailsDueAt")
           VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval) RETURNING "id","detailsDueAt"`,
          [tableId, prizes[index].id, prizes[index].position, eligible[index].userId, eligible[index].rank, String(table.prizeClaimDays)],
        ) as Array<{ id: string; detailsDueAt: Date }>;
        made[index].awardId = award.id;
      }
      await manager.query(`UPDATE "competition_tables" SET "status" = 'SETTLED', "prizesFinalizedAt" = now() WHERE "id" = $1`, [tableId]);
      await this.notifySponsor(manager, table.sponsorId, `Winners decided for ${table.title}`, `${made.length} ${made.length === 1 ? 'winner has' : 'winners have'} been asked for delivery details.`, '/sponsor');
      return made;
    });
    for (const winner of winners) await this.tellWinner(winner.awardId);
    return winners.length;
  }

  private isEligible(table: Pick<Table, 'scoringMethod' | 'prizeDeliveryCountries'>, row: Standing) {
    const scored = row.score !== null && (METRICS[table.scoringMethod]?.better === 'lower' || Number(row.score) > 0);
    return scored && row.qualified && !row.sponsorTeam && Boolean(row.countryCode) && table.prizeDeliveryCountries.includes(row.countryCode!);
  }

  private async standings(manager: EntityManager, table: Table): Promise<Standing[]> {
    return manager.query(
      `SELECT r."userId", row_number() OVER (ORDER BY ${RANK_ORDER})::integer AS "rank", r."score", r."qualified", p."countryCode",
              EXISTS (SELECT 1 FROM "sponsor_members" sm WHERE sm."sponsorId" = $2 AND sm."userId" = r."userId") AS "sponsorTeam"
       FROM "table_registrations" r LEFT JOIN "profiles" p ON p."userId" = r."userId"
       WHERE r."tableId" = $1 ORDER BY ${RANK_ORDER}`,
      [table.id, table.sponsorId],
    );
  }

  /** In-app and email: you won, here's what, send your details by this date. */
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
      [award.userId, `You won ${award.productName}!`, `From ${award.title}. Send your delivery details by ${due}.`],
    );
    this.mail.sendInBackground(prizeWonEmail({ address: award.email, name: award.displayName }, award.productName, award.title, due, this.url('/prizes')));
  }

  private async notifySponsor(manager: EntityManager, sponsorId: string, title: string, body: string, link: string) {
    await manager.query(
      `INSERT INTO "notifications" ("userId","type","title","body","link") SELECT "userId",'SPONSOR_UPDATE',$2,$3,$4 FROM "sponsor_members" WHERE "sponsorId" = $1`,
      [sponsorId, title, body, link],
    );
  }

  /** Scheduled: remind winners who haven't sent details, and pass on prizes whose deadline passed. */
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
        [row.userId, `Claim your ${row.productName}`, `Send your delivery details by ${due} or it passes to the next finisher.`],
      );
      this.mail.sendInBackground(prizeReminderEmail({ address: row.email }, row.productName, due, this.url('/prizes')));
    }
    const expired = await this.dataSource.query(
      `SELECT "id" FROM "product_awards" WHERE "status" = 'AWAITING_DETAILS' AND "detailsDueAt" <= now()`,
    ) as Array<{ id: string }>;
    for (const { id } of expired) await this.forfeit(id, 'Delivery details weren’t sent in time');
    return { reminded: reminders[0]?.length ?? 0, forfeited: expired.length };
  }

  /**
   * A winner can't take the prize (missed the deadline, can't be delivered to): it passes to the next
   * eligible finisher who hasn't already had an award here.
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
      const [table] = await manager.query(
        `SELECT "id","code","title","sponsorId","scoringMethod","prizeDeliveryCountries","prizeClaimDays","prizeFulfilment" FROM "competition_tables" WHERE "id" = $1`, [award.tableId],
      ) as Table[];
      const awarded = new Set((await manager.query(`SELECT "userId" FROM "product_awards" WHERE "tableId" = $1`, [award.tableId]) as Array<{ userId: string }>).map((row) => row.userId));
      const candidate = (await this.standings(manager, table)).find((row) => this.isEligible(table, row) && !awarded.has(row.userId));
      if (!candidate) {
        await this.notifySponsor(manager, table.sponsorId, `${award.productName} has no eligible winner`, 'Nobody else eligible is left on the board. Jump will be in touch.', '/sponsor');
        return null;
      }
      const [created] = await manager.query(
        `INSERT INTO "product_awards" ("tableId","prizeId","position","userId","standingRank","detailsDueAt")
         VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval) RETURNING "id"`,
        [award.tableId, award.prizeId, award.position, candidate.userId, candidate.rank, String(table.prizeClaimDays)],
      ) as Array<{ id: string }>;
      await this.notifySponsor(manager, table.sponsorId, `${award.productName} passed to the next finisher`, reason, '/sponsor');
      return created.id;
    });
    if (next) await this.tellWinner(next);
    return { forfeited: true, passedTo: next };
  }

  /** A winner's prizes, with what they can still do. */
  async mine(userId: string) {
    return this.dataSource.query(
      `SELECT a."id", a."position", a."status", a."detailsDueAt", a."fullName", a."phone", a."address", a."city", a."region", a."country",
              a."deliveryNotes", a."trackingNote", a."submittedAt", a."shippedAt", a."deliveredAt", a."forfeitReason", a."createdAt",
              pr."productName", pr."description", pr."imageUrl", pr."quantity",
              t."code", t."title", t."prizeDeliveryCountries" AS "deliveryCountries", t."prizeShipping" AS "shipping", t."prizeShippingNote" AS "shippingNote",
              s."name" AS "sponsorName", s."logoUrl" AS "sponsorLogoUrl"
       FROM "product_awards" a JOIN "competition_prizes" pr ON pr."id" = a."prizeId"
       JOIN "competition_tables" t ON t."id" = a."tableId" JOIN "sponsors" s ON s."id" = t."sponsorId"
       WHERE a."userId" = $1 ORDER BY a."createdAt" DESC`, [userId],
    );
  }

  /** The winner's delivery details. The country has to be one the sponsor delivers to. */
  async submitDetails(userId: string, awardId: string, input: WinnerDetailsDto) {
    const result = await this.dataSource.transaction(async (manager) => {
      const [award] = await manager.query(
        `SELECT a."id", a."status", a."detailsDueAt", t."prizeDeliveryCountries", t."sponsorId", t."title", t."prizeFulfilment", pr."productName"
         FROM "product_awards" a JOIN "competition_tables" t ON t."id" = a."tableId" JOIN "competition_prizes" pr ON pr."id" = a."prizeId"
         WHERE a."id" = $1 AND a."userId" = $2 FOR UPDATE OF a`, [awardId, userId],
      ) as Array<{ id: string; status: AwardStatus; detailsDueAt: Date; prizeDeliveryCountries: string[]; sponsorId: string; title: string; prizeFulfilment: string; productName: string }>;
      if (!award) throw new NotFoundException('Prize not found');
      if (!['AWAITING_DETAILS', 'DETAILS_SUBMITTED'].includes(award.status)) throw new ConflictException('This prize is already on its way, so details can’t change. Contact the sponsor or Jump.');
      if (award.status === 'AWAITING_DETAILS' && award.detailsDueAt <= new Date()) throw new ConflictException('The deadline for this prize has passed');
      if (!award.prizeDeliveryCountries.includes(input.country)) {
        throw new BadRequestException('This prize can only be delivered to one of the countries listed for this competition');
      }
      await manager.query(
        `UPDATE "product_awards" SET "fullName"=$2,"phone"=$3,"address"=$4,"city"=$5,"region"=$6,"country"=$7,"deliveryNotes"=$8,
                "status"='DETAILS_SUBMITTED',"submittedAt"=now(),"updatedAt"=now() WHERE "id"=$1`,
        [awardId, input.fullName.trim(), input.phone.trim(), input.address.trim(), input.city.trim(), input.region.trim(), input.country, input.deliveryNotes?.trim() || null],
      );
      await this.notifySponsor(manager, award.sponsorId, `Delivery details in for ${award.productName}`, `A winner of ${award.title} sent their details.${award.prizeFulfilment === 'jump' ? ' Jump is handling delivery.' : ' Ready for you to dispatch.'}`, '/sponsor');
      return { submitted: true };
    });
    return result;
  }

  /**
   * Fulfilment moves forward: ready → shipped → delivered (or an issue). Sponsors move their own prizes
   * when they deliver; Jump admins can move any.
   */
  async updateStatus(awardId: string, status: 'READY_FOR_DISPATCH' | 'SHIPPED' | 'DELIVERED' | 'ISSUE', notes: { trackingNote?: string; issueNote?: string }, access: { sponsorUserId?: string; admin?: boolean }) {
    const [award] = await this.dataSource.query(
      `SELECT a."id", a."status", a."userId", t."sponsorId", t."prizeFulfilment", pr."productName", u."email"
       FROM "product_awards" a JOIN "competition_tables" t ON t."id" = a."tableId" JOIN "competition_prizes" pr ON pr."id" = a."prizeId"
       JOIN "users" u ON u."id" = a."userId" WHERE a."id" = $1`, [awardId],
    ) as Array<{ id: string; status: AwardStatus; userId: string; sponsorId: string; prizeFulfilment: string; productName: string; email: string }>;
    if (!award) throw new NotFoundException('Award not found');
    if (!access.admin) {
      const [member] = await this.dataSource.query(`SELECT 1 FROM "sponsor_members" WHERE "sponsorId" = $1 AND "userId" = $2`, [award.sponsorId, access.sponsorUserId]) as unknown[];
      if (!member) throw new ForbiddenException('Only the sponsor’s team can update this prize');
      if (award.prizeFulfilment === 'jump') throw new ForbiddenException('Jump is delivering this prize');
    }
    const order: AwardStatus[] = ['DETAILS_SUBMITTED', 'READY_FOR_DISPATCH', 'SHIPPED', 'DELIVERED'];
    if (status !== 'ISSUE') {
      const from = order.indexOf(award.status === 'ISSUE' ? 'DETAILS_SUBMITTED' : award.status);
      if (from < 0) throw new ConflictException('The winner hasn’t sent delivery details yet');
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
        [award.userId, status === 'SHIPPED' ? `Your ${award.productName} has shipped` : `Your ${award.productName} was delivered`, notes.trackingNote?.trim() || 'Open Jump to see the details.'],
      );
      this.mail.sendInBackground(prizeShippedEmail({ address: award.email }, award.productName, status, notes.trackingNote?.trim() || null, this.url('/prizes')));
    }
    return { status };
  }
}
