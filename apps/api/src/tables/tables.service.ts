import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { creditActivities, retotal } from './competition-credits';
import { enrolClubMembers } from './club-competitions';
import { AmlService } from '../aml/aml.service';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { DataSource, EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { CompetitionTable } from './competition-table.entity';
import { CreateTableDto } from './dto/create-table.dto';
import { TableRegistration } from './table-registration.entity';
import { ACTIVITY_RULES, METRICS, ScoringMethod } from './competition-rules';
import { scoringColumns } from './scoring-columns';
import { CloudinaryService } from '../profiles/cloudinary.service';
import { AVATAR_TYPES } from '../profiles/profiles.service';
import { announceToFollowers, assertClubCanHost, assertCountryEligible, canManageTable, checkClubPrizes, nextStart, prizeColumns, savePrizes, templateOf, UNPUBLISHED } from './club-challenges';
import { RANK_ORDER } from './scoring-engine';
import { CreateCreatorPaidChallengeDto } from '../admin/paid-table.dto';
import { allocatePrizes, assertPrizeSplit } from './prize-split';
import { paidPrizePot } from './paid-prize';
import { MailService } from '../mail/mail.service';
import { challengeInviteEmail } from '../mail/templates';
import { ConfigService } from '@nestjs/config';
import { calculatePrizeBreakdown } from '../payments/financial-policy';
import { reminderConfig } from './reminder-config';

type Invites = { inviteEmails?: string[]; invitePhones?: string[]; inviteClubMembers?: true; communityId?: string };

@Injectable()
export class TablesService {
  constructor(
    @InjectRepository(CompetitionTable)
    private readonly tables: Repository<CompetitionTable>,
    @InjectRepository(TableRegistration)
    private readonly registrations: Repository<TableRegistration>,
    private readonly dataSource: DataSource,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly cloudinary: CloudinaryService,
    private readonly aml: AmlService,
  ) {}

  async list(sort = 'popular', type = 'all', activity = 'all') {
    if (!['popular', 'newest'].includes(sort) || !['all', 'free', 'sponsored', 'paid'].includes(type) ||
        !['all', 'WALK', 'RUN', 'DISTANCE', 'STEP', 'TIMED', 'CYCLING'].includes(activity)) {
      throw new BadRequestException('Invalid competition filter');
    }
    const ranked = (await this.dataSource.query(
      `SELECT t."id", COUNT(r."id")::integer AS n
       FROM "competition_tables" t LEFT JOIN "table_registrations" r ON r."tableId"=t."id"
       WHERE t."status"='OPEN_FOR_ENTRY' AND t."visibility"='public' AND ($1='all' OR t."type"=$1) AND ($2='all' OR t."challengeType"=$2)
       GROUP BY t."id" ORDER BY ${sort === 'newest' ? 't."createdAt" DESC' : 'n DESC, t."createdAt" DESC'} LIMIT 50`,
      [type, activity],
    )) as Array<{ id: string; n: number }>;
    if (!ranked.length) return [];
    const tables = await this.tables.find({
      where: { id: In(ranked.map((row) => row.id)) },
      relations: { creator: true },
    });
    const byId = new Map(tables.map((table) => [table.id, table]));
    return this.present(ranked.flatMap((row) => {
      const table = byId.get(row.id);
      return table ? [table] : [];
    }), ranked.map((row) => ({ tableId: row.id, n: row.n })));
  }

  /**
   * Discovery feed for open, public competitions, 20 a page.
   * - for-you: your own live competitions first (hosted or joined, public or private), then ones you
   *   haven't joined, ranked by your usual activity, friends involved, free entry, then popularity
   * - trending: most joined · starting: soonest upcoming · newest · friends: ones your follows or clubs are in
   * - created: everything you host (public or private, live or finished; drafts live in their own sheet)
   */
  async discover(viewerId: string | null, view = 'trending', type = 'all', activity = 'all', page = '0') {
    if (!['for-you', 'trending', 'starting', 'newest', 'friends', 'created', 'archived'].includes(view) || !['all', 'free', 'sponsored', 'paid'].includes(type) ||
        !['all', 'WALK', 'RUN', 'DISTANCE', 'STEP', 'TIMED', 'CYCLING'].includes(activity) || !/^(0|[1-9]\d{0,3})$/.test(page)) {
      throw new BadRequestException('Invalid competition filter');
    }
    if ((view === 'for-you' || view === 'friends' || view === 'created' || view === 'archived') && !viewerId) view = 'trending';
    // Only bind the viewer when the view uses it: Postgres can't type a parameter nothing references.
    const params: unknown[] = [type, activity, Number(page) * 20];
    const personal = view === 'for-you' || view === 'friends' || view === 'created' || view === 'archived';
    if (personal) params.push(viewerId);
    const me = '$4::uuid';
    const joinedCount = 'COUNT(r."id")';
    const friendsInvolved = `(EXISTS (
      SELECT 1 FROM "follows" f WHERE f."followerId" = ${me} AND (f."followingId" = t."creatorId"
        OR EXISTS (SELECT 1 FROM "table_registrations" fr WHERE fr."tableId" = t."id" AND fr."userId" = f."followingId")))
      OR (t."communityId" IS NOT NULL AND EXISTS (SELECT 1 FROM "club_memberships" cm WHERE cm."clubId" = t."communityId" AND cm."userId" = ${me})))`;
    // The activity this runner does most decides which competition types suit them.
    const habits = `(SELECT a."activityType" FROM "activities" a WHERE a."userId" = ${me} AND a."verificationStatus" <> 'REJECTED'
                     GROUP BY a."activityType" ORDER BY count(*) DESC LIMIT 1)`;
    const fits = `COALESCE(t."eligibleActivities" ? ${habits}, false)`;
    const joinedByMe = `EXISTS (SELECT 1 FROM "table_registrations" mine WHERE mine."tableId" = t."id" AND mine."userId" = ${me})`;
    // Yours and still running: shown on For you even when private, full or closed to new entries.
    const mineLive = `((t."creatorId" = ${me} OR ${joinedByMe}) AND t."status" IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED')
                       AND (t."scoringClosesAt" IS NULL OR t."scoringClosesAt" > now()))`;
    const discoverable = `(t."status" = 'OPEN_FOR_ENTRY' AND t."visibility" = 'public' AND (t."entryClosesAt" IS NULL OR t."entryClosesAt" > now()))`;
    const hosted = `(t."creatorId" = ${me} AND t."status" NOT IN ('CANCELLED','PENDING_FUNDING','PENDING_APPROVAL','DRAFT','SCHEDULED'))`;
    // Premium placement: promoted challenges lead the public lists while their promotion runs.
    const promoted = `(CASE WHEN t."promotedUntil" > now() THEN 0 ELSE 1 END), `;
    const where = [
      view === 'for-you' ? `((${discoverable} AND NOT ${joinedByMe}) OR ${mineLive})` : view === 'created' || view === 'archived' ? hosted : discoverable,
      // Archived competitions only show in the host's Archived list; their link still works.
      view === 'archived' ? `t."archivedAt" IS NOT NULL` : `t."archivedAt" IS NULL`,
      `($1 = 'all' OR t."type" = $1)`, `($2 = 'all' OR t."challengeType" = $2)`,
      ...(view === 'starting' ? [`t."startsAt" > now()`] : []),
      ...(view === 'friends' ? [friendsInvolved] : []),
    ].join(' AND ');
    const order = view === 'archived' ? 't."archivedAt" DESC' : view === 'created' ? `(CASE WHEN ${mineLive} THEN 0 ELSE 1 END), t."createdAt" DESC`
      : view === 'starting' ? `${promoted}t."startsAt" ASC`
      : view === 'newest' ? `${promoted}t."createdAt" DESC`
      : view === 'for-you' ? `(CASE WHEN ${mineLive} THEN 1 ELSE 0 END) DESC, (CASE WHEN ${mineLive} THEN t."scoringClosesAt" END) ASC NULLS LAST,
                              ((CASE WHEN ${fits} THEN 3 ELSE 0 END) + (CASE WHEN ${friendsInvolved} THEN 2 ELSE 0 END)
                              + (CASE WHEN t."type" <> 'paid' THEN 1 ELSE 0 END) + ln(1 + ${joinedCount})) DESC, t."createdAt" DESC`
      : `${promoted}${joinedCount} DESC, t."createdAt" DESC`;
    const ranked = (await this.dataSource.query(
      `SELECT t."id", ${joinedCount}::integer AS n
       FROM "competition_tables" t LEFT JOIN "table_registrations" r ON r."tableId" = t."id"
       WHERE ${where}
       GROUP BY t."id" HAVING ${view === 'created' || view === 'archived' ? 'true' : `t."capacity" IS NULL OR ${joinedCount} < t."capacity"${view === 'for-you' ? ` OR ${mineLive}` : ''}`}
       ORDER BY ${order} LIMIT 21 OFFSET $3`,
      params,
    )) as Array<{ id: string; n: number }>;
    const pageRows = ranked.slice(0, 20);
    if (!pageRows.length) return { items: [], hasMore: false };
    const tables = await this.tables.find({ where: { id: In(pageRows.map((row) => row.id)) }, relations: { creator: true } });
    const byId = new Map(tables.map((table) => [table.id, table]));
    const items = await this.present(pageRows.flatMap((row) => byId.get(row.id) ?? []), pageRows.map((row) => ({ tableId: row.id, n: row.n })));
    const podiums = await this.podiums(pageRows.map((row) => row.id), viewerId);
    return { items: items.map((item) => ({ ...item, ...(podiums.get(item.id) ?? { leaders: [], faces: [], myRank: null }) })), hasMore: ranked.length > 20 };
  }

  /**
   * A glimpse of each board for cards: the top three who have scored (same order as the standings), and
   * a few faces of who's in, for boards nobody has scored on yet.
   */
  private async podiums(tableIds: string[], viewerId: string | null = null) {
    const out = new Map<string, { leaders: Array<{ rank: number; displayName: string; username: string | null; avatarUrl: string | null; avatarStyle: string; verified: boolean; score: number }>; faces: Array<{ displayName: string; avatarUrl: string | null; avatarStyle: string }>; myRank: number | null }>();
    if (!tableIds.length) return out;
    const rows = (await this.dataSource.query(
      `SELECT * FROM (
         SELECT r."tableId", r."joinedAt", r."userId",
                COALESCE(p."displayName", u."displayName", 'Runner') AS "displayName", p."username", p."avatarUrl",
                CASE WHEN p."gender"='male' THEN 'masculine' WHEN p."gender"='female' THEN 'feminine' ELSE 'neutral' END "avatarStyle", p."verifiedAt" IS NOT NULL AS "verified",
                r."score", t."scoringMethod",
                row_number() OVER (PARTITION BY r."tableId" ORDER BY ${RANK_ORDER})::integer AS "rank"
         FROM "table_registrations" r
         JOIN "competition_tables" t ON t."id" = r."tableId"
         JOIN "users" u ON u."id" = r."userId" LEFT JOIN "profiles" p ON p."userId" = r."userId"
         WHERE r."tableId" = ANY($1::uuid[])
       ) ranked WHERE ranked."rank" <= 5 OR ranked."userId" = $2`,
      [tableIds, viewerId],
    )) as Array<{ tableId: string; userId: string; rank: number; displayName: string; username: string | null; avatarUrl: string | null; avatarStyle: string; verified: boolean; score: number | null; scoringMethod: ScoringMethod }>;
    for (const row of rows) {
      const entry = out.get(row.tableId) ?? { leaders: [], faces: [], myRank: null };
      if (viewerId && row.userId === viewerId) entry.myRank = row.rank;
      if (row.rank > 5) { out.set(row.tableId, entry); continue; }
      // Lower-is-better scores (times, variation) count from zero; totals only once there's something.
      const scored = row.score !== null && (METRICS[row.scoringMethod]?.better === 'lower' || Number(row.score) > 0);
      if (scored && row.rank <= 3) entry.leaders.push({ rank: row.rank, displayName: row.displayName, username: row.username, avatarUrl: row.avatarUrl, avatarStyle: row.avatarStyle, verified: row.verified, score: Number(row.score) });
      entry.faces.push({ displayName: row.displayName, avatarUrl: row.avatarUrl, avatarStyle: row.avatarStyle });
      out.set(row.tableId, entry);
    }
    return out;
  }

  /**
   * One tap to join several: free and funded-free entries join now; paid ones are returned for checkout
   * instead of being charged. Each join uses the normal rules (capacity, private invites, entry window).
   */
  async joinMany(userId: string, tableIds: string[]) {
    const joined: string[] = [];
    const needsPayment: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    for (const tableId of [...new Set(tableIds)].slice(0, 20)) {
      const table = await this.tables.findOne({ where: { id: tableId } });
      if (!table) { skipped.push({ id: tableId, reason: 'Not found' }); continue; }
      if (table.type === 'paid') { needsPayment.push(tableId); continue; }
      try {
        await this.registerFree(tableId, userId);
        joined.push(tableId);
      } catch (error) {
        skipped.push({ id: tableId, reason: error instanceof Error ? error.message : 'Couldn’t join' });
      }
    }
    return { joined, needsPayment, skipped };
  }

  /**
   * Public shape of a challenge: the creator is reduced to id + display name (the relation is the full
   * user row, email included, which must never leave the API), plus how many runners have joined.
   */
  private async present(tables: CompetitionTable[], knownCounts?: Array<{ tableId: string; n: number }>) {
    const counts = knownCounts ?? (tables.length
      ? ((await this.dataSource.query(
          `SELECT "tableId", count(*)::int AS n FROM "table_registrations" WHERE "tableId" = ANY($1::uuid[]) GROUP BY "tableId"`,
          [tables.map((table) => table.id)],
        )) as Array<{ tableId: string; n: number }>)
      : []);
    const byTable = new Map(counts.map((row) => [row.tableId, row.n]));
    const funding = tables.length ? (await this.dataSource.query(
      `SELECT "tableId", COALESCE(SUM("amountKobo"),0)::bigint AS amount
       FROM "payment_intents" WHERE "tableId" = ANY($1::uuid[]) AND "purpose"='SPONSOR_FUNDING' AND "status"='SUCCEEDED'
       GROUP BY "tableId"`, [tables.map((table) => table.id)],
    )) as Array<{ tableId: string; amount: string }> : [];
    const fundedByTable = new Map(funding.map((row) => [row.tableId, Number(row.amount)]));
    return tables.map(({ creator, ...table }) => ({
      ...table,
      creator: creator ? { id: creator.id, displayName: creator.displayName } : null,
      entrantCount: byTable.get(table.id) ?? 0,
      fundedPrizeKobo: fundedByTable.get(table.id) ?? 0,
    }));
  }

  /**
   * Competitions you host or joined, with where you stand: rank, entrants, your score and the leader's.
   * Scores are in the table's unit (metres, steps, or seconds for fastest-time tables). Ranking uses the
   * same order as the standings.
   */
  async mine(userId: string) {
    const rows = await this.tables.query(
      `WITH mine AS (
         SELECT t."id", (t."creatorId" = $1) AS "hosting", r."id" IS NOT NULL AS "joined", COALESCE(r."joinedAt", t."createdAt") AS "since"
         FROM "competition_tables" t
         LEFT JOIN "table_registrations" r ON r."tableId" = t."id" AND r."userId" = $1
         WHERE (t."creatorId" = $1 OR r."id" IS NOT NULL) AND t."status" <> 'CANCELLED' AND t."archivedAt" IS NULL
       ),
       ranked AS (
         SELECT r."tableId", r."userId",
                r."score", t."scoringMethod",
                row_number() OVER (PARTITION BY r."tableId" ORDER BY ${RANK_ORDER})::integer AS "rank",
                count(*) OVER (PARTITION BY r."tableId")::integer AS "entrants"
         FROM "table_registrations" r JOIN "competition_tables" t ON t."id" = r."tableId"
         WHERE r."tableId" IN (SELECT "id" FROM mine)
       )
       SELECT t."id", t."code", t."title", t."type", t."challengeType", t."scoringMethod", t."targetDistanceMetres",
              t."status", t."startsAt", t."scoringClosesAt", t."visibility", t."guaranteedPrizeKobo"::float8 AS "guaranteedPrizeKobo", t."createdAt", m."hosting", m."joined",
              COALESCE((SELECT max(x."entrants") FROM ranked x WHERE x."tableId" = t."id"), 0) AS "entrants",
              t."targetSteps", t."targetSeconds", t."targetSessions", t."dailyTarget",
              me."rank" AS "myRank", me."score" AS "myScore",
              (SELECT x."score" FROM ranked x WHERE x."tableId" = t."id" AND x."rank" = 1) AS "leaderScore",
              -- The runners either side of you, for "0.4 km behind Ada" / "leading Tunde by 1 km".
              ahead."score" AS "aheadScore", (SELECT p."displayName" FROM "profiles" p WHERE p."userId" = ahead."userId") AS "aheadName",
              behind."score" AS "behindScore", (SELECT p."displayName" FROM "profiles" p WHERE p."userId" = behind."userId") AS "behindName"
       FROM mine m JOIN "competition_tables" t ON t."id" = m."id"
       LEFT JOIN ranked me ON me."tableId" = t."id" AND me."userId" = $1
       LEFT JOIN ranked ahead ON ahead."tableId" = t."id" AND ahead."rank" = me."rank" - 1
       LEFT JOIN ranked behind ON behind."tableId" = t."id" AND behind."rank" = me."rank" + 1
       ORDER BY CASE WHEN m."hosting" AND t."status"='PENDING_FUNDING' THEN 0
                     WHEN t."status" IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED') THEN 1 ELSE 2 END,
                t."scoringClosesAt" ASC NULLS LAST, m."since" DESC
       LIMIT 100`,
      [userId],
    );
    return rows as Array<{
      id: string; code: string; title: string; type: string; challengeType: string; scoringMethod: string; targetDistanceMetres: number | null;
      targetSteps: number | null; targetSeconds: number | null; targetSessions: number | null; dailyTarget: number | null;
      status: string; startsAt: string | null; scoringClosesAt: string | null; visibility: string; guaranteedPrizeKobo: number | null; createdAt: string;
      hosting: boolean; joined: boolean;
      entrants: number; myRank: number | null; myScore: number | null; leaderScore: number | null;
      aheadScore: number | null; aheadName: string | null; behindScore: number | null; behindName: string | null;
    }>;
  }

  async eligible(userId: string, activity?: string) {
    if (activity !== 'run' && activity !== 'walk' && activity !== 'cycle') throw new BadRequestException('Choose run, walk or cycle');
    return this.dataSource.query(
      `SELECT t."id", t."code", t."title", t."challengeType", t."type"
       FROM "table_registrations" r JOIN "competition_tables" t ON t."id"=r."tableId"
       WHERE r."userId"=$1 AND t."status" IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED')
         AND COALESCE(t."startsAt", '-infinity'::timestamptz) <= now()
         AND COALESCE(t."scoringClosesAt", 'infinity'::timestamptz) > now()
         AND t."eligibleActivities" ? $2
       ORDER BY t."scoringClosesAt" ASC LIMIT 50`,
      [userId, activity],
    );
  }

  async create(creatorId: string, input: CreateTableDto) {
    const sponsored = Boolean(input.fundedFree || input.guaranteedPrizeKobo);
    const challengeType = input.challengeType ?? 'RUN';
    if (challengeType === 'CYCLING' && sponsored) throw new BadRequestException('Cycling competitions are free only until bicycle verification is stronger');
    const scoring = scoringColumns({ ...input, challengeType, scoringMethod: input.scoringMethod ?? ACTIVITY_RULES[challengeType].options[0].method }, sponsored);
    // Head-to-head is two people; invite-only is a private board.
    const format = input.format ?? (input.visibility === 'private' ? 'invite' : 'open');
    if (format === 'head_to_head' && input.capacity !== 2) throw new BadRequestException('Head-to-head is for exactly two people');
    if (format === 'head_to_head' && (input.inviteClubMembers || new Set([...(input.inviteEmails ?? []).map((email) => email.trim().toLowerCase()), ...(input.invitePhones ?? [])]).size > 1)) {
      throw new BadRequestException('Head-to-head is you and one opponent. Invite one person.');
    }
    const publish = input.publish ?? 'now';
    if ((input.clubPrizes || publish !== 'now' || input.series) && !input.communityId) {
      throw new BadRequestException('Prizes, scheduling, drafts and series are for club competitions. Host it from your club’s page.');
    }
    if ((publish !== 'now' || input.series) && sponsored) throw new BadRequestException('Cash-prize competitions open once they’re funded, so they can’t be drafted, scheduled or repeated');
    // A club challenge: a manager of a club in good standing, within the club's plan (drafts don't count).
    if (input.communityId) await assertClubCanHost(this.dataSource.manager, input.communityId, creatorId, { adding: publish !== 'draft' });
    if (input.inviteClubMembers && !input.communityId) throw new BadRequestException('Choose a club before inviting its members');
    if (input.inviteClubMembers && input.communityId) await this.assertClubFits(input.communityId, input.format === 'head_to_head' ? 2 : input.capacity);
    const prizeSplitBps = this.prizeSplit(input.prizeSplitBps, input.capacity);
    if (input.guaranteedPrizeKobo !== undefined && (!Number.isSafeInteger(input.guaranteedPrizeKobo) || input.guaranteedPrizeKobo < 1_000_000)) {
      throw new BadRequestException('Fixed contributions must be at least ₦10,000');
    }
    if (input.fundingDestination === 'CHARITY' && (!input.fundedFree || !input.guaranteedPrizeKobo || !input.charityName?.trim())) {
      throw new BadRequestException('Charity funding requires a fixed creator-funded amount and charity name');
    }
    if (input.charityName && input.fundingDestination !== 'CHARITY') throw new BadRequestException('Choose charity as the funding destination');
    if (input.guaranteedPrizeKobo && input.fundingDestination !== 'CHARITY') {
      this.assertAwardAmounts(calculatePrizeBreakdown(input.guaranteedPrizeKobo, 1500, 0).winnerAmountKobo, prizeSplitBps);
    }
    if (input.openEnded && sponsored) throw new BadRequestException('Prize competitions need an end date so winners can be paid');
    const prizes = input.clubPrizes ?? null;
    if (prizes) {
      if (!sponsored) throw new BadRequestException('Club prizes are for funded and paid competitions. Choose funded or paid to add them.');
      if (input.openEnded) throw new BadRequestException('Prize competitions need an end date so winners can be decided');
      checkClubPrizes(prizes, input.capacity, input.communityId!, this.cloudinary);
    }
    if (input.series && input.openEnded) throw new BadRequestException('A series needs an end date for each edition');
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    // Open-ended: no closing time at all; entry stays open and every verified activity keeps counting.
    const scoringClosesAt = input.openEnded ? null : input.scoringClosesAt
      ? new Date(input.scoringClosesAt)
      : new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const entryClosesAt = input.openEnded ? null : input.entryClosesAt ? new Date(input.entryClosesAt) : scoringClosesAt;
    if (scoringClosesAt && entryClosesAt && (entryClosesAt > scoringClosesAt || startsAt > scoringClosesAt)) {
      throw new ConflictException('Entry and start times must be before scoring closes');
    }
    const publishAt = publish === 'schedule' ? new Date(input.publishAt ?? '') : null;
    if (publishAt && (Number.isNaN(publishAt.getTime()) || publishAt <= new Date() || (scoringClosesAt && publishAt >= scoringClosesAt))) {
      throw new BadRequestException('Schedule it for a time in the future, before it ends');
    }
    const table = this.tables.create({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      code: randomBytes(4).toString('hex').toUpperCase(),
      creatorId,
      type: sponsored ? 'sponsored' : 'free',
      entryFeeKobo: 0,
      // Club prizes open straight away: the club commits to them, and Jump moderates afterwards.
      status: publish === 'draft' ? 'DRAFT' : publish === 'schedule' ? 'SCHEDULED' : input.guaranteedPrizeKobo ? 'PENDING_FUNDING' : 'OPEN_FOR_ENTRY',
      publishAt,
      ...(prizes ? prizeColumns(prizes) : {}),
      eligibleCountries: [...new Set(input.eligibleCountries ?? [])],
      autoEnrolClub: Boolean(input.inviteClubMembers && input.communityId),
      startsAt,
      entryClosesAt,
      scoringClosesAt,
      capacity: input.capacity,
      distanceCapMetres: input.distanceCapMetres ?? null,
      ...scoring,
      format,
      ...reminderConfig(input.reminderTime, input.reminderTimeZone),
      communityId: input.communityId ?? null,
      platformFeeBps: sponsored ? 1500 : 3000,
      creatorCommissionBps: 0,
      guaranteedPrizeKobo: input.guaranteedPrizeKobo ?? null,
      fundingDestination: input.fundingDestination ?? 'WINNERS',
      charityName: input.fundingDestination === 'CHARITY' ? input.charityName!.trim() : null,
      prizeSplitBps,
      visibility: format === 'open' ? 'public' : 'private',
    });
    return this.saveWithInvites(table, input, async (manager, created) => {
      if (prizes) await savePrizes(manager, created.id, prizes.prizes);
      if (input.series && created.communityId) {
        // This challenge is edition 1 and the template for the rest.
        const template = await templateOf(manager, created);
        const [series] = await manager.query(
          `INSERT INTO "challenge_series" ("clubId","title","cadence","template","autoPublish","nextStartsAt","lastEdition","createdByUserId")
           VALUES ($1,$2,$3,$4,$5,$6,1,$7) RETURNING "id"`,
          [created.communityId, created.title, input.series.cadence, JSON.stringify(template), input.series.autoPublish, nextStart(created.startsAt!, input.series.cadence), creatorId],
        ) as Array<{ id: string }>;
        created.seriesId = series.id;
        created.edition = 1;
        await manager.update(CompetitionTable, { id: created.id }, { seriesId: series.id, edition: 1 });
      }
      if (created.status === 'OPEN_FOR_ENTRY') await announceToFollowers(manager, created);
    });
  }

  async createPaidDraft(creatorId: string, input: CreateCreatorPaidChallengeDto) {
    if (input.challengeType === 'CYCLING') throw new BadRequestException('Cycling competitions cannot have cash prizes yet');
    const scoring = scoringColumns(input, true);
    await this.assertCommunityManager(creatorId, input.communityId);
    if (input.inviteClubMembers && !input.communityId) throw new BadRequestException('Choose a club before inviting its members');
    // A club can put up its own prizes on top of the cash pot.
    const clubPrizes = input.clubPrizes ?? null;
    if (clubPrizes) {
      if (!input.communityId) throw new BadRequestException('Club prizes are for club competitions. Host it from your club’s page.');
      checkClubPrizes(clubPrizes, input.capacity, input.communityId, this.cloudinary);
    }
    let guaranteedPrizeKobo: number;
    try { guaranteedPrizeKobo = paidPrizePot(input.capacity, input.entryFeeKobo); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid paid prize pot'); }
    const prizeSplitBps = this.prizeSplit(input.prizeSplitBps, input.capacity);
    this.assertAwardAmounts(guaranteedPrizeKobo - Math.floor(guaranteedPrizeKobo * 0.35), prizeSplitBps);
    const creator = (await this.dataSource.query(
      `SELECT "id" FROM "creator_profiles" WHERE "userId"=$1 AND "status"='ACTIVE'`,
      [creatorId],
    ) as Array<{ id: string }>)[0];
    if (!creator) throw new ForbiddenException('An active creator account is required for paid competitions');
    await this.aml.assertVerified(creatorId);
    // Bigger pots need more entrants before they can start or pay out.
    const minimumEntrants = await this.aml.assertPaidChallengeLimits(creatorId, {
      entryFeeKobo: input.entryFeeKobo, potKobo: guaranteedPrizeKobo, capacity: input.capacity, minimumEntrants: input.minimumEntrants,
    });
    const startsAt = new Date(input.startsAt);
    const entryClosesAt = new Date(input.entryClosesAt ?? input.scoringClosesAt);
    const scoringClosesAt = new Date(input.scoringClosesAt);
    if (minimumEntrants > input.capacity || entryClosesAt > scoringClosesAt || startsAt > scoringClosesAt) {
      throw new ConflictException('Competition dates or entrant limits are invalid');
    }
    return this.saveWithInvites(this.tables.create({
      creatorId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      code: randomBytes(4).toString('hex').toUpperCase(),
      type: 'paid',
      status: 'PENDING_APPROVAL',
      entryFeeKobo: input.entryFeeKobo,
      guaranteedPrizeKobo,
      minimumEntrants,
      capacity: input.capacity,
      startsAt,
      entryClosesAt,
      scoringClosesAt,
      distanceCapMetres: null,
      ...scoring,
      format: input.capacity === 2 ? 'head_to_head' : 'open',
      ...reminderConfig(input.reminderTime, input.reminderTimeZone),
      communityId: input.communityId ?? null,
      platformFeeBps: 3500,
      creatorCommissionBps: 500,
      prizeSplitBps,
      ...(clubPrizes ? prizeColumns(clubPrizes) : {}),
    }), input, async (manager, created) => {
      if (clubPrizes) await savePrizes(manager, created.id, clubPrizes.prizes);
    });
  }

  async registerFree(tableId: string, userId: string) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const table = await manager.findOne(CompetitionTable, {
          where: { id: tableId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!table || !['free', 'sponsored'].includes(table.type)) throw new NotFoundException('Free-entry competition not found');
        if (table.status !== 'OPEN_FOR_ENTRY' || (table.entryClosesAt && table.entryClosesAt <= new Date())) {
          throw new ConflictException('This competition is not open for entry');
        }
        // Private: the host, anyone invited, and (for a club competition) the club's members.
        if (table.visibility === 'private' && table.creatorId !== userId) {
          const [allowed] = await manager.query(
            `SELECT 1 FROM "challenge_invitations" i JOIN "users" u ON u."id"=$2
             WHERE i."tableId"=$1 AND i."status"<>'DECLINED' AND (i."invitedUserId"=u."id" OR (u."emailVerified" AND lower(i."email")=lower(u."email")))
             UNION ALL
             SELECT 1 FROM "club_memberships" m WHERE m."clubId"=$3 AND m."userId"=$2`,
            [tableId, userId, table.communityId],
          );
          if (!allowed) throw new ForbiddenException('This is a private competition. Ask the host to invite you.');
        }
        await assertCountryEligible(manager, table, userId);
        if (table.capacity) {
          const count = await manager.count(TableRegistration, { where: { tableId } });
          if (count >= table.capacity) throw new ConflictException('This competition is full');
        }
        const registration = await manager.save(TableRegistration, manager.create(TableRegistration, { tableId, userId }));
        await creditActivities(manager, { tableId, userId });
        await manager.query(
          `UPDATE "challenge_invitations" SET "status"='ACCEPTED',"respondedAt"=now()
           WHERE "tableId"=$1 AND "invitedUserId"=$2 AND "status"='PENDING'`,
          [tableId, userId],
        );
        return registration;
      });
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('You already joined this competition');
      }
      throw error;
    }
  }

  /**
   * Leave a competition. Its credits go with the registration (ON DELETE CASCADE). Paid entries can't be
   * withdrawn here (the fee is in the prize pot), and nobody leaves once scoring has closed.
   */
  async leave(tableId: string, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(CompetitionTable, { where: { id: tableId }, lock: { mode: 'pessimistic_write' } });
      if (!table) throw new NotFoundException('Competition not found');
      const registration = await manager.findOne(TableRegistration, { where: { tableId, userId } });
      if (!registration) throw new NotFoundException('You’re not in this competition');
      if (table.type === 'paid') throw new ForbiddenException('Paid entries can’t be withdrawn. Contact Jump support if something’s wrong.');
      if (table.status === 'SETTLED' || (table.scoringClosesAt && table.scoringClosesAt <= new Date())) {
        throw new ConflictException('This competition has finished, so you can’t leave it now.');
      }
      await manager.delete(TableRegistration, { id: registration.id });
      return { left: true };
    });
  }

  /**
   * Throws away a draft the host never opened: unfunded prize competitions and paid ones still waiting for
   * review. It's marked CANCELLED rather than deleted because payment rows point at it; a funding payment
   * that lands afterwards is refunded by the usual "prize funding unavailable" path.
   */
  /**
   * The host edits a competition. Title and description any time. Dates only on free competitions (prize
   * ones were agreed when funded or approved): the start while it hasn't started, the end any time
   * before it passes, never into the past. endNow closes an open-ended (or running) one immediately.
   */
  async update(tableId: string, userId: string, input: { title?: string; description?: string | null; startsAt?: string; scoringClosesAt?: string | null; endNow?: boolean }) {
    return this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(CompetitionTable, { where: { id: tableId }, lock: { mode: 'pessimistic_write' } });
      if (!table) throw new NotFoundException('Competition not found');
      if (!(await canManageTable(manager, table, userId))) throw new ForbiddenException('Only the host or the club’s managers can edit this competition');
      if (table.status === 'SETTLED' || table.status === 'CANCELLED') throw new ConflictException('This competition is finished and can’t be changed');
      const now = new Date();
      if (input.title !== undefined) {
        const title = input.title.trim();
        if (title.length < 3) throw new BadRequestException('Give it a name of at least 3 characters');
        table.title = title;
      }
      if (input.description !== undefined) table.description = input.description?.trim() || null;
      const datesChanging = input.startsAt !== undefined || input.scoringClosesAt !== undefined || input.endNow;
      if (datesChanging && table.type !== 'free') throw new ConflictException('Prize competitions keep the dates they were funded or approved with');
      if (input.startsAt !== undefined) {
        if (table.startsAt && table.startsAt <= now) throw new ConflictException('It has already started, so the start can’t move');
        const startsAt = new Date(input.startsAt);
        if (startsAt < new Date(now.getTime() - 60_000)) throw new BadRequestException('The start can’t be in the past');
        table.startsAt = startsAt;
      }
      if (input.endNow) {
        table.scoringClosesAt = now;
        table.entryClosesAt = now;
      } else if (input.scoringClosesAt !== undefined) {
        if (table.scoringClosesAt && table.scoringClosesAt <= now) throw new ConflictException('It has already ended');
        if (input.scoringClosesAt === null) {
          table.scoringClosesAt = null;
          table.entryClosesAt = null;
        } else {
          const end = new Date(input.scoringClosesAt);
          if (end <= now) throw new BadRequestException('The end has to be in the future. Use End now to finish it today.');
          if (table.startsAt && end <= table.startsAt) throw new BadRequestException('The end has to be after the start');
          // Entry stays open as long as it did relative to the end.
          table.entryClosesAt = !table.entryClosesAt || table.entryClosesAt.getTime() === table.scoringClosesAt?.getTime() ? end : table.entryClosesAt > end ? end : table.entryClosesAt;
          table.scoringClosesAt = end;
        }
      }
      await manager.save(table);
      // Moving the end can change which activities fall inside the window.
      if (datesChanging) await retotal(manager, [table.id]);
      return table;
    });
  }

  /**
   * The host tidies a competition away: off every list (theirs included, except Archived), still at
   * its link. Only once it's over, or if nobody else ever joined. Undo by unarchiving.
   */
  /**
   * Why the host can't delete this competition, or null when they can. Free competitions always can;
   * any other only while no money is attached to it: no payment (an entry fee, prize funding or a
   * contribution, even one still being confirmed), no entry paid from someone's balance, and no prize
   * awarded.
   */
  async deletionBlocker(table: CompetitionTable, manager: EntityManager = this.dataSource.manager): Promise<string | null> {
    if (table.type === 'free') return null;
    const [row] = await manager.query(
      `SELECT
         EXISTS (SELECT 1 FROM "payment_intents" WHERE "tableId"=$1 AND "status" NOT IN ('INITIATED','FAILED')) AS "paid",
         EXISTS (SELECT 1 FROM "table_registrations" WHERE "tableId"=$1 AND "userId"<>$2) AS "entered",
         EXISTS (SELECT 1 FROM "prize_awards" WHERE "tableId"=$1) AS "awarded"`,
      [table.id, table.creatorId],
    ) as Array<{ paid: boolean; entered: boolean; awarded: boolean }>;
    if (row.paid || row.awarded || (table.type === 'paid' && row.entered)) {
      return 'Money has been paid into this competition, so it can’t be deleted. You can end or archive it instead, or contact Jump support.';
    }
    return null;
  }

  /** For the Delete button: whether it can go, and if not, why. */
  async deletionCheck(tableId: string, userId: string) {
    const table = await this.tables.findOne({ where: { id: tableId } });
    if (!table || table.deletedAt) throw new NotFoundException('Competition not found');
    if (table.creatorId !== userId && !(await canManageTable(this.dataSource.manager, table, userId))) throw new ForbiddenException('Only the host can delete this competition');
    const reason = await this.deletionBlocker(table);
    return { canDelete: !reason, reason };
  }

  async remove(tableId: string, userId: string) {
    const entrants = await this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(CompetitionTable, { where: { id: tableId }, lock: { mode: 'pessimistic_write' } });
      if (!table || table.deletedAt) throw new NotFoundException('Competition not found');
      if (table.creatorId !== userId && !(await canManageTable(manager, table, userId))) throw new ForbiddenException('Only the host can delete this competition');
      const reason = await this.deletionBlocker(table, manager);
      if (reason) throw new ConflictException(reason);
      const others = await manager.query(`SELECT "userId" FROM "table_registrations" WHERE "tableId"=$1 AND "userId"<>$2`, [tableId, userId]) as Array<{ userId: string }>;
      table.status = 'CANCELLED';
      table.deletedAt = new Date();
      await manager.save(table);
      await manager.query(`UPDATE "challenge_invitations" SET "status"='DECLINED',"respondedAt"=now() WHERE "tableId"=$1 AND "status"='PENDING'`, [tableId]);
      return { title: table.title, others: others.map((row) => row.userId) };
    });
    // Everyone who was in it hears why it vanished from their list.
    if (entrants.others.length) {
      await this.dataSource.query(
        `INSERT INTO "notifications" ("userId","type","title","body","link")
         SELECT unnest($1::uuid[]),'COMPETITION_DELETED',$2,'The host deleted it. Your activities still count everywhere else.','/competitions'`,
        [entrants.others, `${entrants.title} was deleted`],
      ).catch(() => undefined);
    }
    return { deleted: true };
  }

  /** The host (or club managers) set or remove the competition's banner image. */
  async setBanner(tableId: string, userId: string, file: { buffer: Buffer; mimetype: string } | undefined) {
    const table = await this.editableTable(tableId, userId);
    if (!file) throw new BadRequestException('Choose an image to upload');
    if (!AVATAR_TYPES.includes(file.mimetype)) throw new BadRequestException('Use a JPG, PNG, WebP or HEIC image');
    table.bannerUrl = await this.cloudinary.uploadCompetitionBanner(table.id, file);
    await this.tables.save(table);
    return { bannerUrl: table.bannerUrl };
  }

  async removeBanner(tableId: string, userId: string) {
    const table = await this.editableTable(tableId, userId);
    if (table.bannerUrl) await this.cloudinary.removeCompetitionBanner(table.id).catch(() => undefined);
    table.bannerUrl = null;
    await this.tables.save(table);
    return { bannerUrl: null };
  }

  private async editableTable(tableId: string, userId: string) {
    const table = await this.tables.findOne({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Competition not found');
    if (!(await canManageTable(this.dataSource.manager, table, userId))) throw new ForbiddenException('Only the host or the club’s managers can edit this competition');
    if (table.status === 'SETTLED' || table.status === 'CANCELLED') throw new ConflictException('This competition is finished and can’t be changed');
    return table;
  }

  async archive(tableId: string, userId: string, archived: boolean) {
    const table = await this.tables.findOne({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Competition not found');
    if (!(await canManageTable(this.dataSource.manager, table, userId))) throw new ForbiddenException('Only the host or the club’s managers can archive this competition');
    if (archived) {
      const over = table.status === 'SETTLED' || (table.scoringClosesAt !== null && table.scoringClosesAt <= new Date());
      const others = await this.registrations.count({ where: { tableId } }) > 1;
      if (!over && others) throw new ConflictException('It’s still running. End it first, then archive it.');
      if (['paid', 'sponsored'].includes(table.type) && table.status !== 'SETTLED' && others) throw new ConflictException('Prizes are still being settled. Archive it once the result is final.');
    }
    await this.tables.update({ id: tableId }, { archivedAt: archived ? new Date() : null });
    return { archived };
  }

  async discard(tableId: string, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(CompetitionTable, { where: { id: tableId }, lock: { mode: 'pessimistic_write' } });
      if (!table) throw new NotFoundException('Competition not found');
      if (!(await canManageTable(manager, table, userId))) throw new ForbiddenException('Only the host or the club’s managers can discard this draft');
      if (!['PENDING_FUNDING', 'PENDING_APPROVAL', ...UNPUBLISHED].includes(table.status)) throw new ConflictException('Only drafts can be discarded. This one is already open.');
      const [funded] = await manager.query(
        `SELECT 1 FROM "payment_intents" WHERE "tableId"=$1 AND "status"='SUCCEEDED' LIMIT 1`, [tableId],
      ) as unknown[];
      if (funded) throw new ConflictException('Money has already been paid into this draft. Contact Jump support to close it.');
      table.status = 'CANCELLED';
      await manager.save(table);
      return { discarded: true };
    });
  }

  async registration(tableId: string, userId: string) {
    const joined = await this.registrations.exist({ where: { tableId, userId } });
    return { joined };
  }

  async standings(tableId: string) {
    const table = await this.tables.findOne({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Competition not found');
    return this.dataSource.query(
      `SELECT row_number() OVER (ORDER BY ${RANK_ORDER})::integer rank,
              r."userId",COALESCE(p."displayName",u."displayName",'Runner') "displayName",p."username",p."avatarUrl",
              CASE WHEN p."gender"='male' THEN 'masculine' WHEN p."gender"='female' THEN 'feminine' ELSE 'neutral' END "avatarStyle", p."verifiedAt" IS NOT NULL AS "verified",
              r."creditedDistanceMetres",r."creditedSteps",r."completionTimeSeconds",r."score",r."targetReachedAt",r."qualified"
       FROM "table_registrations" r JOIN "users" u ON u."id"=r."userId" LEFT JOIN "profiles" p ON p."userId"=r."userId" WHERE r."tableId"=$1
       ORDER BY ${RANK_ORDER} LIMIT 500`,
      [tableId],
    );
  }

  /** Drafts and scheduled challenges are only visible to the people who can manage them. */
  async getByCode(code: string, viewerId?: string | null) {
    const table = await this.tables.findOne({
      where: { code: code.toUpperCase() },
      relations: { creator: true },
    });
    if (!table || table.deletedAt) throw new NotFoundException('Competition not found');
    const manageable = Boolean(viewerId && await canManageTable(this.dataSource.manager, table, viewerId));
    if (UNPUBLISHED.includes(table.status) && !manageable) throw new NotFoundException('Competition not found');
    const [presented] = await this.present([table]);
    const productPrizes = table.prizeFulfilment ? await this.clubPrizes(table, manageable) : null;
    const [club] = table.communityId ? await this.dataSource.query(
      `SELECT c."name", c."slug", c."logoUrl", c."accentColor", c."verifiedAt" IS NOT NULL AS "verified",
              (SELECT count(*) FROM "club_follows" f WHERE f."clubId" = c."id")::integer AS "followerCount",
              s."title" AS "seriesTitle", s."cadence" AS "seriesCadence"
       FROM "clubs" c LEFT JOIN "challenge_series" s ON s."id" = $2 WHERE c."id" = $1`, [table.communityId, table.seriesId],
    ) as Array<Record<string, unknown>> : [];
    const [host] = (await this.dataSource.query(`SELECT "username", "avatarUrl", "verifiedAt" IS NOT NULL AS "verified",
      CASE WHEN "gender"='male' THEN 'masculine' WHEN "gender"='female' THEN 'feminine' ELSE 'neutral' END "avatarStyle"
      FROM "profiles" WHERE "userId" = $1`, [table.creatorId])) as Array<{ username: string; avatarUrl: string | null; avatarStyle: string; verified: boolean }>;
    return { ...presented, productPrizes, club: club ?? null, canManage: manageable, creator: presented.creator ? { ...presented.creator, username: host?.username ?? null, avatarUrl: host?.avatarUrl ?? null, avatarStyle: host?.avatarStyle ?? 'neutral', verified: host?.verified ?? false } : null };
  }

  /** What a prize challenge offers, and on what terms: shown before anyone joins. Redemption details stay with winners (and the club's managers). */
  private async clubPrizes(table: CompetitionTable, manageable: boolean) {
    const prizes = await this.dataSource.query(
      `SELECT "position","kind","productName","description","imageUrl","quantity","estimatedValue","currency"${manageable ? ',"redeemInstructions"' : ''}
       FROM "competition_prizes" WHERE "tableId" = $1 ORDER BY "position"`,
      [table.id],
    );
    const winners = table.prizesFinalizedAt ? await this.dataSource.query(
      `SELECT a."position", COALESCE(p."displayName", u."displayName", 'Runner') AS "displayName", p."username", pr."productName"
       FROM "product_awards" a JOIN "users" u ON u."id" = a."userId" LEFT JOIN "profiles" p ON p."userId" = a."userId" JOIN "competition_prizes" pr ON pr."id" = a."prizeId"
       WHERE a."tableId" = $1 AND a."status" <> 'FORFEITED' ORDER BY a."position", a."standingRank"`, [table.id],
    ) : [];
    return {
      prizes,
      winners,
      selection: table.prizeSelection,
      deliveryCountries: table.prizeDeliveryCountries,
      fulfilment: table.prizeFulfilment,
      shipping: table.prizeShipping,
      shippingNote: table.prizeShippingNote,
      eligibilityNote: table.prizeEligibilityNote,
      claimDays: table.prizeClaimDays,
    };
  }

  async result(tableId: string) {
    const rows = (await this.dataSource.query(
      `SELECT s.*, snap."standings", snap."algorithmVersion" FROM "table_settlements" s
       JOIN "table_leaderboard_snapshots" snap ON snap."id" = s."snapshotId"
       WHERE s."tableId" = $1 ORDER BY s."version" DESC LIMIT 1`,
      [tableId],
    )) as Array<Record<string, unknown>>;
    if (!rows[0]) throw new NotFoundException('Final result is not available');
    return rows[0];
  }

  private prizeSplit(split: number[] | undefined, capacity: number | null) {
    try { return assertPrizeSplit(split, capacity); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid prize shares'); }
  }

  private assertAwardAmounts(amountKobo: number, split: number[]) {
    try { allocatePrizes(amountKobo, split); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Prize pot is too small'); }
  }

  private async saveWithInvites(table: CompetitionTable, input: Invites, afterSave?: (manager: EntityManager, created: CompetitionTable) => Promise<void>) {
    // A draft or scheduled club challenge enters the club when it opens (autoEnrolClub); other invites wait.
    const deferred = UNPUBLISHED.includes(table.status);
    if (deferred && (input.inviteEmails?.length || input.invitePhones?.length)) throw new BadRequestException('Invite people by email or phone once it’s published');
    if (!deferred && table.status !== 'OPEN_FOR_ENTRY' && (input.inviteClubMembers || input.inviteEmails?.length || input.invitePhones?.length)) {
      throw new BadRequestException('Fund or approve this draft before inviting runners');
    }
    if (deferred) input = { ...input, inviteClubMembers: undefined };
    const emails = [...new Set((input.inviteEmails ?? []).map((value) => value.trim().toLowerCase()))];
    const phones = [...new Set(input.invitePhones ?? [])];
    // Registered runners get one notification email from the outbox. Check all addresses at once.
    const registered = emails.length ? await this.dataSource.query(
      `SELECT lower("email") "email" FROM "users" WHERE "emailVerified"=true AND lower("email")=ANY($1::text[])`, [emails],
    ) as Array<{ email: string }> : [];
    const known = new Set(registered.map((row) => row.email));
    const saved = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(CompetitionTable, table);
      // The host is visible on every board; funded prizes exclude their score at settlement.
      await manager.save(TableRegistration, manager.create(TableRegistration, { tableId: created.id, userId: created.creatorId }));
      await creditActivities(manager, { tableId: created.id, userId: created.creatorId });
      await this.insertInvitations(manager, created, input, emails, phones);
      if (afterSave) await afterSave(manager, created);
      return created;
    });
    const url = `${this.config.getOrThrow<string>('WEB_ORIGIN')}/competitions/${saved.code}`;
    for (const email of emails.filter((address) => !known.has(address))) this.mail.sendInBackground(challengeInviteEmail({ address: email }, saved.title, url));
    return saved;
  }

  private async insertInvitations(manager: EntityManager, table: CompetitionTable, input: Invites, emails: string[], phones: string[]) {
    // A free club competition takes the whole club in at once; paid ones (opened later) only invite.
    if (input.inviteClubMembers && input.communityId && table.type !== 'paid') {
      await enrolClubMembers(manager, { tableId: table.id });
    } else if (input.inviteClubMembers && input.communityId) {
      await manager.query(
        `INSERT INTO "challenge_invitations" ("tableId","invitedUserId")
         SELECT $1,m."userId" FROM "club_memberships" m WHERE m."clubId"=$2 AND m."userId"<>$3
         ON CONFLICT DO NOTHING`, [table.id, input.communityId, table.creatorId],
      );
    }
    if (emails.length) await manager.query(
      `INSERT INTO "challenge_invitations" ("tableId","email") SELECT $1,unnest($2::varchar[]) ON CONFLICT DO NOTHING`,
      [table.id, emails],
    );
    if (phones.length) await manager.query(
      `INSERT INTO "challenge_invitations" ("tableId","phone") SELECT $1,unnest($2::varchar[]) ON CONFLICT DO NOTHING`,
      [table.id, phones],
    );
    if ((input.inviteClubMembers && table.type === 'paid') || emails.length) await manager.query(
      `INSERT INTO "notifications" ("userId","type","title","body","link")
       SELECT DISTINCT targets."userId",'CHALLENGE_INVITE','You’re invited to a competition',$2,$4
       FROM (
         SELECT i."invitedUserId" "userId" FROM "challenge_invitations" i WHERE i."tableId"=$1 AND i."invitedUserId" IS NOT NULL
         UNION
         SELECT u."id" FROM "challenge_invitations" i JOIN "users" u ON lower(u."email")=i."email" WHERE i."tableId"=$1
       ) targets WHERE targets."userId"<>$3`,
      [table.id, `Join ${table.title} with code ${table.code}.`, table.creatorId, `/competitions/${table.code}`],
    );
  }

  async invitations(tableId: string, creatorId: string) {
    const table = await this.tables.findOne({ where: { id: tableId, creatorId } });
    if (!table) throw new NotFoundException('Competition not found');
    return this.dataSource.query(
      `SELECT i."id",i."email",i."phone",p."username",i."status",i."createdAt"
       FROM "challenge_invitations" i LEFT JOIN "profiles" p ON p."userId"=i."invitedUserId"
       WHERE i."tableId"=$1 ORDER BY i."createdAt" DESC LIMIT 200`, [tableId],
    );
  }

  async inviteRunner(tableId: string, creatorId: string, username: string) {
    const invitation = await this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(CompetitionTable, { where: { id: tableId, creatorId } });
      if (!table) throw new NotFoundException('Competition not found or you are not its host');
      if (table.status !== 'OPEN_FOR_ENTRY' || (table.entryClosesAt && table.entryClosesAt <= new Date())) {
        throw new ConflictException('Invitations are closed for this competition');
      }
      const [runner] = await manager.query(
        `SELECT p."userId",p."username",u."email",p."displayName" FROM "profiles" p JOIN "users" u ON u."id"=p."userId" WHERE lower(p."username")=lower($1)`,
        [username],
      ) as Array<{ userId: string; username: string; email: string; displayName: string }>;
      if (!runner) throw new NotFoundException('Runner not found');
      if (runner.userId === creatorId) throw new BadRequestException('You are already hosting this competition');
      // Head-to-head has one opponent: once someone's invited (and hasn't declined), nobody else.
      if (table.format === 'head_to_head') {
        const [other] = await manager.query(
          `SELECT 1 FROM "challenge_invitations" WHERE "tableId"=$1 AND "status"<>'DECLINED' AND ("invitedUserId" IS NULL OR "invitedUserId"<>$2) LIMIT 1`,
          [tableId, runner.userId],
        ) as unknown[];
        if (other) throw new ConflictException('You’ve already invited your opponent. Head-to-head is just the two of you.');
      }
      if (await manager.exists(TableRegistration, { where: { tableId, userId: runner.userId } })) throw new ConflictException('This runner has already joined');
      const created = await manager.query(
        `INSERT INTO "challenge_invitations" ("tableId","invitedUserId") VALUES ($1,$2)
         ON CONFLICT DO NOTHING RETURNING "id"`, [tableId, runner.userId],
      ) as Array<{ id: string }>;
      const existing = created.length ? null : (await manager.query(
        `SELECT "id","status" FROM "challenge_invitations" WHERE "tableId"=$1 AND "invitedUserId"=$2`,
        [tableId, runner.userId],
      ) as Array<{ id: string; status: string }>)[0];
      if (existing && existing.status !== 'PENDING') throw new ConflictException('This runner already answered the invitation');
      const invitationId = created[0]?.id ?? existing?.id;
      if (!invitationId) throw new ConflictException('This runner was already invited');
      const link = `${this.config.getOrThrow<string>('WEB_ORIGIN')}/competitions/${table.code}`;
      const body = `Join ${table.title} on Jump: ${link}`;
      const message = await manager.query(
        `INSERT INTO "direct_messages" ("senderId","recipientId","body","invitationId") VALUES ($1,$2,$3,$4)
         ON CONFLICT ("invitationId") WHERE "invitationId" IS NOT NULL DO NOTHING RETURNING "id"`,
        [creatorId, runner.userId, body, invitationId],
      ) as Array<{ id: string }>;
      if (!message.length) throw new ConflictException('This runner was already invited in messages');
      await manager.query(
        `INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,'CHALLENGE_INVITE','You’re invited to a competition',$2,$3)`,
        [runner.userId, body, `/competitions/${table.code}`],
      );
      return { runner, table, link };
    });
    return { invited: true, username: invitation.runner.username };
  }

  async respondToInvitation(invitationId: string, userId: string, decision: 'ACCEPT' | 'DECLINE') {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const [invite] = await manager.query(
          `SELECT i."id",i."tableId",i."status" FROM "challenge_invitations" i
           WHERE i."id"=$1 AND i."invitedUserId"=$2 FOR UPDATE OF i`,
          [invitationId, userId],
        ) as Array<{ id: string; tableId: string; status: string }>;
        if (!invite) throw new NotFoundException('Invitation not found');
        if (invite.status !== 'PENDING') throw new ConflictException('This invitation has already been answered');
        if (decision === 'DECLINE') {
          if (await manager.exists(TableRegistration, { where: { tableId: invite.tableId, userId } })) {
            throw new ConflictException('You have already joined this competition');
          }
          const pendingPayment = await manager.query(
            `SELECT 1 FROM "payment_intents" WHERE "tableId"=$1 AND "userId"=$2 AND "purpose"='CHALLENGE_ENTRY'
             AND "status" IN ('INITIATED','PENDING','RECONCILIATION_REQUIRED') LIMIT 1`,
            [invite.tableId, userId],
          ) as unknown[];
          if (pendingPayment.length) throw new ConflictException('Your entry payment is still in progress; check its status before declining');
          await manager.query(`UPDATE "challenge_invitations" SET "status"='DECLINED',"respondedAt"=now() WHERE "id"=$1`, [invite.id]);
          return { status: 'DECLINED', joined: false };
        }
        const table = await manager.findOne(CompetitionTable, { where: { id: invite.tableId }, lock: { mode: 'pessimistic_write' } });
        if (!table) throw new NotFoundException('Competition not found');
        if (table.status !== 'OPEN_FOR_ENTRY' || (table.entryClosesAt && table.entryClosesAt <= new Date())) {
          throw new ConflictException('This competition is not open for entry');
        }
        if (await manager.exists(TableRegistration, { where: { tableId: table.id, userId } })) {
          await manager.query(`UPDATE "challenge_invitations" SET "status"='ACCEPTED',"respondedAt"=now() WHERE "id"=$1`, [invite.id]);
          return { status: 'ACCEPTED', joined: true, tableId: table.id, code: table.code, type: table.type };
        }
        await assertCountryEligible(manager, table, userId);
        if (table.type === 'paid') {
          const [count] = await manager.query(
            `SELECT COUNT(*)::integer count FROM "table_registrations" WHERE "tableId"=$1 AND "userId"<>$2`,
            [table.id, table.creatorId],
          ) as Array<{ count: number }>;
          if (table.capacity !== null && Number(count.count) >= table.capacity) throw new ConflictException('This competition is full');
          return { status: 'PENDING', joined: false, paymentRequired: true, tableId: table.id, code: table.code, type: table.type };
        }
        if (table.capacity !== null) {
          const count = await manager.count(TableRegistration, { where: { tableId: table.id } });
          if (count >= table.capacity) throw new ConflictException('This competition is full');
        }
        await manager.save(TableRegistration, manager.create(TableRegistration, { tableId: table.id, userId }));
        await manager.query(`UPDATE "challenge_invitations" SET "status"='ACCEPTED',"respondedAt"=now() WHERE "id"=$1`, [invite.id]);
        await creditActivities(manager, { tableId: table.id, userId });
        return { status: 'ACCEPTED', joined: true, tableId: table.id, code: table.code, type: table.type, contributionOptional: table.type === 'sponsored' && table.guaranteedPrizeKobo === null };
      });
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('You already joined this competition');
      }
      throw error;
    }
  }

  /** Everyone in the club gets a place, so the competition has to hold them all. */
  private async assertClubFits(clubId: string, capacity: number) {
    const [{ members }] = await this.dataSource.query(`SELECT count(*)::integer AS "members" FROM "club_memberships" WHERE "clubId" = $1`, [clubId]) as Array<{ members: number }>;
    if (members > capacity) throw new BadRequestException(`The club has ${members} members. Set the maximum to at least ${members} so everyone gets a place.`);
  }

  private async assertCommunityManager(userId: string, communityId?: string) {
    if (!communityId) return;
    const allowed = await this.dataSource.query(
      `SELECT 1 FROM "club_memberships" WHERE "clubId"=$1 AND "userId"=$2 AND "role" IN ('owner','admin')`,
      [communityId, userId],
    ) as unknown[];
    if (!allowed.length) throw new ForbiddenException('Community owner or admin access required');
  }
}

