import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { planOf } from '../clubs/club-plans';
import { PrizeAwardsService } from '../prizes/prize-awards.service';
import { CloudinaryService } from '../profiles/cloudinary.service';
import { AVATAR_TYPES } from '../profiles/profiles.service';
import {
  announceCompetition, assertClubCanHost, canManageTable, ChallengeTemplate, checkClubPrizes, createFromTemplate, nextStart, openTable, prizeColumns, savePrizes,
  templateOf, UNPUBLISHED,
} from './club-challenges';
import { retotal } from './competition-credits';
import { CompetitionTable } from './competition-table.entity';
import { CreateSeriesDto, EditDraftDto, UpdateSeriesDto } from './dto/club-challenge.dto';
import { RANK_ORDER } from './scoring-engine';

type Series = {
  id: string; clubId: string; title: string; cadence: 'weekly' | 'monthly'; template: ChallengeTemplate; autoPublish: boolean;
  leadDays: number; nextStartsAt: Date; lastEdition: number; active: boolean; createdByUserId: string | null;
};

/**
 * Everything a club does to run its own challenges without the Jump team: drafts, scheduling and
 * publishing, copying a challenge, weekly or monthly series, prize photos and fulfilment, and the club
 * dashboard. The scheduled job (ClubChallengesProcessor) opens scheduled challenges and makes each
 * series' next edition.
 */
@Injectable()
export class ChallengeStudioService {
  private readonly logger = new Logger(ChallengeStudioService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cloudinary: CloudinaryService,
    private readonly awards: PrizeAwardsService,
  ) {}

  private async managed(manager: EntityManager, tableId: string, userId: string) {
    const table = await manager.findOne(CompetitionTable, { where: { id: tableId }, lock: { mode: 'pessimistic_write' } });
    if (!table) throw new NotFoundException('Competition not found');
    if (!(await canManageTable(manager, table, userId))) throw new ForbiddenException('Only the host or the club’s managers can do that');
    return table;
  }

  private async clubId(clubRef: string) {
    const [club] = await this.dataSource.query(`SELECT "id" FROM "clubs" WHERE "slug" = lower($1) OR "id"::text = lower($1)`, [clubRef.trim()]) as Array<{ id: string }>;
    if (!club) throw new NotFoundException('Club not found');
    return club.id;
  }

  /** Before it opens, a draft or scheduled challenge can change its name, dates, places, countries and prizes. */
  async editDraft(tableId: string, userId: string, input: EditDraftDto) {
    return this.dataSource.transaction(async (manager) => {
      const table = await this.managed(manager, tableId, userId);
      if (!UNPUBLISHED.includes(table.status)) throw new ConflictException('It’s already open. Use Edit on its page to change the name or end date.');
      if (input.title !== undefined) table.title = input.title.trim();
      if (input.description !== undefined) table.description = input.description?.trim() || null;
      if (input.capacity !== undefined) table.capacity = input.capacity;
      if (input.eligibleCountries !== undefined) table.eligibleCountries = [...new Set(input.eligibleCountries)];
      if (input.startsAt !== undefined || input.scoringClosesAt !== undefined) {
        const start = input.startsAt ? new Date(input.startsAt) : table.startsAt!;
        const end = input.scoringClosesAt ? new Date(input.scoringClosesAt) : table.scoringClosesAt;
        if (!end || end <= start) throw new BadRequestException('The end has to be after the start');
        if (end <= new Date()) throw new BadRequestException('The end has to be in the future');
        const entryOffset = (table.entryClosesAt?.getTime() ?? end.getTime()) - (table.startsAt?.getTime() ?? start.getTime());
        table.startsAt = start;
        table.scoringClosesAt = end;
        table.entryClosesAt = new Date(Math.min(end.getTime(), start.getTime() + Math.max(0, entryOffset)));
        if (table.entryClosesAt <= start) table.entryClosesAt = end;
        if (table.publishAt && table.publishAt >= end) throw new BadRequestException('It’s scheduled to open after it would end. Change the schedule first.');
      }
      if (input.clubPrizes !== undefined) {
        if (input.clubPrizes && (!table.communityId || table.type === 'free')) throw new BadRequestException('Club prizes are for funded and paid club competitions');
        if (input.clubPrizes) checkClubPrizes(input.clubPrizes, table.capacity, table.communityId!, this.cloudinary);
        Object.assign(table, prizeColumns(input.clubPrizes));
        await savePrizes(manager, table.id, input.clubPrizes?.prizes ?? [], { replace: true });
      }
      const prizeCount = await manager.query(`SELECT COALESCE(sum("quantity"),0)::integer AS n FROM "competition_prizes" WHERE "tableId" = $1`, [table.id]) as Array<{ n: number }>;
      if (table.capacity !== null && prizeCount[0].n > table.capacity) throw new BadRequestException(`There are ${prizeCount[0].n} prizes but only ${table.capacity} places`);
      await manager.save(table);
      await retotal(manager, [table.id]);
      return table;
    });
  }

  /** Opens a draft now, or schedules it (or reschedules a scheduled one). */
  async publish(tableId: string, userId: string, at?: string) {
    return this.dataSource.transaction(async (manager) => {
      const table = await this.managed(manager, tableId, userId);
      if (!UNPUBLISHED.includes(table.status)) throw new ConflictException('It’s already published');
      if (table.communityId) await assertClubCanHost(manager, table.communityId, userId, { adding: table.status === 'DRAFT' });
      if (table.scoringClosesAt && table.scoringClosesAt <= new Date()) throw new ConflictException('Its end date has passed. Change the dates first.');
      if (at) {
        const when = new Date(at);
        if (when <= new Date()) throw new BadRequestException('Schedule it for a time in the future');
        if (table.scoringClosesAt && when >= table.scoringClosesAt) throw new BadRequestException('Schedule it to open before it ends');
        table.status = 'SCHEDULED';
        table.publishAt = when;
        await manager.save(table);
        return table;
      }
      return openTable(manager, table);
    });
  }

  /** Scheduled: open every challenge whose publish time has come. */
  async publishDue() {
    const due = await this.dataSource.query(`SELECT "id" FROM "competition_tables" WHERE "status" = 'SCHEDULED' AND "publishAt" <= now() ORDER BY "publishAt" LIMIT 100`) as Array<{ id: string }>;
    for (const { id } of due) {
      try {
        await this.dataSource.transaction(async (manager) => {
          const table = await manager.findOne(CompetitionTable, { where: { id, status: 'SCHEDULED' }, lock: { mode: 'pessimistic_write' } });
          if (table) await openTable(manager, table);
        });
      } catch (error) {
        this.logger.error(`Could not publish ${id}`, error instanceof Error ? error.stack : String(error));
      }
    }
    return due.length;
  }

  /** A new draft with the same rules, branding and prizes, starting a week after the original unless told otherwise. */
  async duplicate(tableId: string, userId: string, startsAt?: string) {
    return this.dataSource.transaction(async (manager) => {
      const table = await this.managed(manager, tableId, userId);
      if (!table.communityId) throw new BadRequestException('Copying is for club competitions');
      await assertClubCanHost(manager, table.communityId, userId, { adding: false });
      const template = await templateOf(manager, table);
      let start = startsAt ? new Date(startsAt) : new Date(table.startsAt!.getTime() + 7 * 86_400_000);
      if (start.getTime() + template.durationMs <= Date.now()) start = new Date(Date.now() + 86_400_000);
      return createFromTemplate(manager, template, { creatorId: userId, communityId: table.communityId, startsAt: start, status: 'DRAFT' });
    });
  }

  /* ───────── Series ───────── */

  /** Repeats a club challenge every week or month. It becomes edition 1 and the template for the rest. */
  async createSeries(clubRef: string, userId: string, input: CreateSeriesDto) {
    const clubId = await this.clubId(clubRef);
    return this.dataSource.transaction(async (manager) => {
      const club = await assertClubCanHost(manager, clubId, userId, { adding: false });
      const table = await manager.findOne(CompetitionTable, { where: { code: input.fromCode.toUpperCase(), communityId: clubId }, lock: { mode: 'pessimistic_write' } });
      if (!table) throw new NotFoundException('That competition isn’t one of this club’s');
      if (table.seriesId) throw new ConflictException('It’s already part of a series');
      const plan = planOf(club.plan, club.planRenewsAt);
      const [{ active }] = await manager.query(`SELECT count(*)::integer AS "active" FROM "challenge_series" WHERE "clubId" = $1 AND "active"`, [clubId]) as Array<{ active: number }>;
      if (active >= plan.activeSeries) throw new ConflictException(`Your club can run ${plan.activeSeries} series at a time on the ${plan.label} plan. Pause one first.`);
      const template = await templateOf(manager, table);
      let next = nextStart(table.startsAt!, input.cadence);
      while (next.getTime() + template.durationMs <= Date.now()) next = nextStart(next, input.cadence);
      const [series] = await manager.query(
        `INSERT INTO "challenge_series" ("clubId","title","cadence","template","autoPublish","nextStartsAt","lastEdition","createdByUserId")
         VALUES ($1,$2,$3,$4,$5,$6,1,$7) RETURNING *`,
        [clubId, table.title, input.cadence, JSON.stringify(template), input.autoPublish, next, userId],
      ) as Series[];
      await manager.update(CompetitionTable, { id: table.id }, { seriesId: series.id, edition: 1 });
      return series;
    });
  }

  async updateSeries(seriesId: string, userId: string, input: UpdateSeriesDto) {
    return this.dataSource.transaction(async (manager) => {
      const [series] = await manager.query(`SELECT * FROM "challenge_series" WHERE "id" = $1 FOR UPDATE`, [seriesId]) as Series[];
      if (!series) throw new NotFoundException('Series not found');
      const club = await assertClubCanHost(manager, series.clubId, userId, { adding: false });
      if (input.active && !series.active) {
        const plan = planOf(club.plan, club.planRenewsAt);
        const [{ active }] = await manager.query(`SELECT count(*)::integer AS "active" FROM "challenge_series" WHERE "clubId" = $1 AND "active"`, [series.clubId]) as Array<{ active: number }>;
        if (active >= plan.activeSeries) throw new ConflictException(`Your club can run ${plan.activeSeries} series at a time on the ${plan.label} plan`);
        // Resuming picks up from the next date that hasn't passed.
        let next = new Date(series.nextStartsAt);
        while (next.getTime() + series.template.durationMs <= Date.now()) next = nextStart(next, series.cadence);
        series.nextStartsAt = next;
      }
      if (input.templateFromCode) {
        const table = await manager.findOne(CompetitionTable, { where: { code: input.templateFromCode.toUpperCase(), seriesId } });
        if (!table) throw new NotFoundException('That competition isn’t an edition of this series');
        series.template = await templateOf(manager, table);
      }
      const [updated] = await manager.query(
        `UPDATE "challenge_series" SET "title"=$2,"autoPublish"=$3,"active"=$4,"leadDays"=$5,"template"=$6,"nextStartsAt"=$7,"updatedAt"=now() WHERE "id"=$1 RETURNING *`,
        [seriesId, input.title?.trim() ?? series.title, input.autoPublish ?? series.autoPublish, input.active ?? series.active, input.leadDays ?? series.leadDays,
          JSON.stringify(series.template), series.nextStartsAt],
      ) as [Series[], number];
      return updated[0];
    });
  }

  /** Makes the next edition now instead of waiting for its lead time. */
  async nextEditionNow(seriesId: string, userId: string) {
    const [series] = await this.dataSource.query(`SELECT "clubId" FROM "challenge_series" WHERE "id" = $1`, [seriesId]) as Array<{ clubId: string }>;
    if (!series) throw new NotFoundException('Series not found');
    await assertClubCanHost(this.dataSource.manager, series.clubId, userId, { adding: false });
    return this.makeEdition(seriesId, { force: true });
  }

  /** Scheduled: every active series whose next edition is within its lead time gets that edition. */
  async generateDue() {
    const due = await this.dataSource.query(
      `SELECT "id" FROM "challenge_series" WHERE "active" AND "nextStartsAt" - make_interval(days => "leadDays") <= now() ORDER BY "nextStartsAt" LIMIT 50`,
    ) as Array<{ id: string }>;
    let made = 0;
    for (const { id } of due) {
      try { if (await this.makeEdition(id)) made += 1; }
      catch (error) { this.logger.error(`Could not make the next edition of series ${id}`, error instanceof Error ? error.stack : String(error)); }
    }
    return made;
  }

  /**
   * The next edition: the template with its own dates, numbered on from the last. It opens now when the
   * series publishes on its own (so people can join before it starts), or waits as a draft for a manager.
   * A series whose club was suspended, or that has hit its plan's limit, makes a draft instead.
   */
  private async makeEdition(seriesId: string, { force = false } = {}) {
    const result = await this.dataSource.transaction(async (manager) => {
      const [series] = await manager.query(`SELECT * FROM "challenge_series" WHERE "id" = $1 FOR UPDATE`, [seriesId]) as Series[];
      if (!series?.active) return null;
      if (!force && new Date(series.nextStartsAt).getTime() - series.leadDays * 86_400_000 > Date.now()) return null;
      const [club] = await manager.query(`SELECT "ownerUserId","suspendedAt","plan","planRenewsAt","slug","name" FROM "clubs" WHERE "id" = $1`, [series.clubId]) as Array<{ ownerUserId: string; suspendedAt: Date | null; plan: string; planRenewsAt: Date | null; slug: string; name: string }>;
      const creatorId = series.createdByUserId && (await manager.query(`SELECT 1 FROM "club_memberships" WHERE "clubId"=$1 AND "userId"=$2 AND "role" IN ('owner','admin')`, [series.clubId, series.createdByUserId]) as unknown[]).length
        ? series.createdByUserId : club.ownerUserId;
      const [{ live }] = await manager.query(
        `SELECT count(*)::integer AS "live" FROM "competition_tables" WHERE "communityId" = $1 AND "status" IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED','SCHEDULED') AND ("scoringClosesAt" IS NULL OR "scoringClosesAt" > now())`,
        [series.clubId],
      ) as Array<{ live: number }>;
      const canOpen = series.autoPublish && !club.suspendedAt && live < planOf(club.plan, club.planRenewsAt).liveChallenges;
      const edition = series.lastEdition + 1;
      const startsAt = new Date(series.nextStartsAt);
      const table = await createFromTemplate(manager, series.template, {
        creatorId, communityId: series.clubId, startsAt, status: canOpen ? 'OPEN_FOR_ENTRY' : 'DRAFT', seriesId, edition, title: `${series.title} #${edition}`,
      });
      if (canOpen) await announceCompetition(manager, table);
      await manager.query(`UPDATE "challenge_series" SET "lastEdition" = $2, "nextStartsAt" = $3, "updatedAt" = now() WHERE "id" = $1`, [seriesId, edition, nextStart(startsAt, series.cadence)]);
      await manager.query(
        `INSERT INTO "notifications" ("userId","type","title","body","link")
         SELECT "userId",'CLUB_SERIES',$2,$3,$4 FROM "club_memberships" WHERE "clubId" = $1 AND "role" IN ('owner','admin')`,
        [series.clubId, canOpen ? `${table.title} is live` : `${table.title} is ready to review`,
          canOpen ? 'The next edition of your series opened. Share it with your community.' : 'The next edition of your series is saved as a draft. Check its theme and prizes, then publish it.',
          `/clubs/${club.slug}/dashboard`],
      );
      return table;
    });
    return result;
  }

  /* ───────── Prizes ───────── */

  async uploadPrizeImage(clubRef: string, userId: string, file: { buffer: Buffer; mimetype: string } | undefined) {
    const clubId = await this.clubId(clubRef);
    await assertClubCanHost(this.dataSource.manager, clubId, userId, { adding: false });
    if (!file) throw new BadRequestException('Choose an image');
    if (!AVATAR_TYPES.includes(file.mimetype)) throw new BadRequestException('Use a JPG, PNG, WebP or HEIC image');
    return { url: await this.cloudinary.uploadClubPrizeImage(clubId, file) };
  }

  updateAward(userId: string, awardId: string, status: 'READY_FOR_DISPATCH' | 'SHIPPED' | 'DELIVERED' | 'ISSUE', notes: { trackingNote?: string; issueNote?: string }) {
    return this.awards.updateStatus(awardId, status, notes, { clubUserId: userId });
  }

  /* ───────── Dashboard ───────── */

  /**
   * The club's own numbers: challenges in every state, followers and members, participation and
   * completion, repeat participants, past winners, prize claims, series and month-by-month performance.
   * "Completed" means reaching the target, or for challenges without one, scoring and meeting the minimums.
   * The host and club managers aren't counted as participants.
   */
  async dashboard(clubRef: string, userId: string) {
    const clubId = await this.clubId(clubRef);
    const club = await assertClubCanHost(this.dataSource.manager, clubId, userId, { adding: false }).catch((error) => {
      // A suspended club's managers still see their dashboard.
      if (error instanceof ForbiddenException && /suspended/.test(error.message)) return null;
      throw error;
    });
    const [info] = await this.dataSource.query(`SELECT "slug","name","plan","planRenewsAt","suspendedAt","suspendedReason" FROM "clubs" WHERE "id" = $1`, [clubId]) as Array<{ slug: string; name: string; plan: string; planRenewsAt: Date | null; suspendedAt: Date | null; suspendedReason: string | null }>;
    if (!club && !info.suspendedAt) throw new ForbiddenException('Only the club owner or a manager can see the dashboard');
    const entrants = `
      SELECT r."tableId", r."userId", r."joinedAt",
             (r."targetReachedAt" IS NOT NULL OR (t."targetDistanceMetres" IS NULL AND t."targetSteps" IS NULL AND t."targetSeconds" IS NULL AND t."targetSessions" IS NULL
               AND r."qualified" AND COALESCE(r."score", 0) > 0)) AS "completed"
      FROM "table_registrations" r JOIN "competition_tables" t ON t."id" = r."tableId"
      WHERE t."communityId" = $1 AND t."status" NOT IN ('DRAFT','SCHEDULED','CANCELLED') AND r."userId" <> t."creatorId"
        AND NOT EXISTS (SELECT 1 FROM "club_memberships" m WHERE m."clubId" = $1 AND m."userId" = r."userId" AND m."role" IN ('owner','admin'))`;
    const [totals] = await this.dataSource.query(
      `WITH e AS (${entrants})
       SELECT (SELECT count(*) FROM "club_follows" WHERE "clubId" = $1)::integer AS "followers",
              (SELECT count(*) FROM "club_memberships" WHERE "clubId" = $1)::integer AS "members",
              (SELECT count(*) FROM "club_follows" WHERE "clubId" = $1 AND "createdAt" > now() - interval '30 days')::integer AS "newFollowers30d",
              (SELECT count(DISTINCT "userId") FROM e)::integer AS "participants",
              (SELECT count(*) FROM (SELECT "userId" FROM e GROUP BY "userId" HAVING count(DISTINCT "tableId") > 1) x)::integer AS "repeatParticipants",
              (SELECT count(*) FROM e)::integer AS "entries",
              (SELECT count(*) FILTER (WHERE "completed") FROM e)::integer AS "completions",
              (SELECT count(*) FROM "competition_tables" WHERE "communityId" = $1 AND "status" NOT IN ('DRAFT','SCHEDULED','CANCELLED'))::integer AS "competitions"`,
      [clubId],
    );
    const challenges = await this.dataSource.query(
      `WITH e AS (${entrants})
       SELECT t."id", t."code", t."title", t."status", t."type", t."challengeType", t."publishAt", t."startsAt", t."scoringClosesAt", t."capacity",
              t."seriesId", t."edition", t."prizeFulfilment" IS NOT NULL AS "hasPrizes", t."prizesFinalizedAt", t."archivedAt", t."promotedUntil",
              CASE WHEN t."status" = 'DRAFT' THEN 'draft' WHEN t."status" = 'SCHEDULED' THEN 'scheduled'
                   WHEN t."status" = 'SETTLED' OR (t."scoringClosesAt" IS NOT NULL AND t."scoringClosesAt" <= now()) THEN 'finished'
                   WHEN t."startsAt" > now() THEN 'upcoming' ELSE 'live' END AS "phase",
              (SELECT count(*) FROM e WHERE e."tableId" = t."id")::integer AS "entrants",
              (SELECT count(*) FROM e WHERE e."tableId" = t."id" AND e."completed")::integer AS "completed"
       FROM "competition_tables" t
       WHERE t."communityId" = $1 AND t."status" <> 'CANCELLED'
       ORDER BY CASE WHEN t."status" IN ('DRAFT','SCHEDULED') THEN 0 WHEN t."scoringClosesAt" IS NULL OR t."scoringClosesAt" > now() THEN 1 ELSE 2 END,
                CASE WHEN t."scoringClosesAt" IS NULL OR t."scoringClosesAt" > now() THEN t."startsAt" END ASC,
                t."scoringClosesAt" DESC NULLS LAST
       LIMIT 200`,
      [clubId],
    );
    const winners = await this.dataSource.query(
      `SELECT t."id", t."code", t."title", t."scoringClosesAt",
              (SELECT json_agg(x ORDER BY x."rank") FROM (
                 SELECT row_number() OVER (ORDER BY ${RANK_ORDER})::integer AS "rank", COALESCE(p."displayName", u."displayName", 'Runner') AS "displayName", p."username"
                 FROM "table_registrations" r JOIN "users" u ON u."id" = r."userId" LEFT JOIN "profiles" p ON p."userId" = r."userId"
                 WHERE r."tableId" = t."id" AND r."userId" <> t."creatorId" AND r."score" IS NOT NULL ORDER BY ${RANK_ORDER} LIMIT 3) x) AS "podium"
       FROM "competition_tables" t
       WHERE t."communityId" = $1 AND t."status" NOT IN ('DRAFT','SCHEDULED','CANCELLED') AND t."scoringClosesAt" <= now()
       ORDER BY t."scoringClosesAt" DESC LIMIT 12`,
      [clubId],
    );
    const series = await this.dataSource.query(
      `SELECT s."id", s."title", s."cadence", s."autoPublish", s."leadDays", s."nextStartsAt", s."lastEdition", s."active", s."createdAt"
       FROM "challenge_series" s WHERE s."clubId" = $1 ORDER BY s."active" DESC, s."createdAt" DESC`,
      [clubId],
    );
    const monthly = await this.dataSource.query(
      `WITH e AS (${entrants}),
       months AS (SELECT generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') AS "month")
       SELECT to_char(m."month", 'YYYY-MM') AS "month",
              (SELECT count(*) FROM "competition_tables" t WHERE t."communityId" = $1 AND t."status" NOT IN ('DRAFT','SCHEDULED','CANCELLED')
                 AND date_trunc('month', COALESCE(t."startsAt", t."createdAt")) = m."month")::integer AS "competitions",
              (SELECT count(*) FROM e WHERE date_trunc('month', e."joinedAt") = m."month")::integer AS "entries",
              (SELECT count(DISTINCT e."userId") FROM e WHERE date_trunc('month', e."joinedAt") = m."month")::integer AS "participants",
              (SELECT count(*) FROM e WHERE date_trunc('month', e."joinedAt") = m."month" AND e."completed")::integer AS "completions",
              (SELECT count(*) FROM "club_follows" f WHERE f."clubId" = $1 AND date_trunc('month', f."createdAt") = m."month")::integer AS "newFollowers"
       FROM months m ORDER BY m."month"`,
      [clubId],
    );
    const claims = await this.awards.clubClaims(clubId);
    return {
      club: { slug: info.slug, name: info.name, suspendedAt: info.suspendedAt, suspendedReason: info.suspendedReason, ...planOf(info.plan, info.planRenewsAt) },
      totals,
      challenges,
      winners,
      series,
      monthly,
      claims,
    };
  }

  /** A series' editions, newest first, with each one's entrants, completions and winner. */
  async seriesEditions(seriesId: string, userId: string) {
    const [series] = await this.dataSource.query(`SELECT "clubId" FROM "challenge_series" WHERE "id" = $1`, [seriesId]) as Array<{ clubId: string }>;
    if (!series) throw new NotFoundException('Series not found');
    const role = await this.dataSource.query(`SELECT 1 FROM "club_memberships" WHERE "clubId"=$1 AND "userId"=$2 AND "role" IN ('owner','admin')`, [series.clubId, userId]) as unknown[];
    if (!role.length) throw new ForbiddenException('Only the club owner or a manager can see this');
    return this.dataSource.query(
      `SELECT t."id", t."code", t."title", t."edition", t."status", t."startsAt", t."scoringClosesAt",
              (SELECT count(*) FROM "table_registrations" r WHERE r."tableId" = t."id" AND r."userId" <> t."creatorId")::integer AS "entrants",
              (SELECT count(*) FROM "table_registrations" r WHERE r."tableId" = t."id" AND r."userId" <> t."creatorId" AND r."targetReachedAt" IS NOT NULL)::integer AS "reachedTarget",
              (SELECT COALESCE(p."displayName", u."displayName") FROM "table_registrations" r JOIN "users" u ON u."id" = r."userId" LEFT JOIN "profiles" p ON p."userId" = r."userId"
                 WHERE r."tableId" = t."id" AND r."userId" <> t."creatorId" AND r."score" IS NOT NULL AND (t."scoringClosesAt" <= now() OR t."status" = 'SETTLED')
                 ORDER BY ${RANK_ORDER} LIMIT 1) AS "winner"
       FROM "competition_tables" t WHERE t."seriesId" = $1 AND t."status" <> 'CANCELLED' ORDER BY t."edition" DESC NULLS LAST LIMIT 100`,
      [seriesId],
    );
  }
}
