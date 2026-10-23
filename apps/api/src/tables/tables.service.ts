import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { creditActivities } from './competition-credits';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { DataSource, EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { CompetitionTable } from './competition-table.entity';
import { CreateTableDto } from './dto/create-table.dto';
import { TableRegistration } from './table-registration.entity';
import { ACTIVITY_RULES, METRICS, ScoringMethod } from './competition-rules';
import { scoringColumns } from './scoring-columns';
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
    if (!['for-you', 'trending', 'starting', 'newest', 'friends', 'created'].includes(view) || !['all', 'free', 'sponsored', 'paid'].includes(type) ||
        !['all', 'WALK', 'RUN', 'DISTANCE', 'STEP', 'TIMED', 'CYCLING'].includes(activity) || !/^(0|[1-9]\d{0,3})$/.test(page)) {
      throw new BadRequestException('Invalid competition filter');
    }
    if ((view === 'for-you' || view === 'friends' || view === 'created') && !viewerId) view = 'trending';
    // Only bind the viewer when the view uses it: Postgres can't type a parameter nothing references.
    const params: unknown[] = [type, activity, Number(page) * 20];
    const personal = view === 'for-you' || view === 'friends' || view === 'created';
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
    const hosted = `(t."creatorId" = ${me} AND t."status" NOT IN ('CANCELLED','PENDING_FUNDING','PENDING_APPROVAL'))`;
    const where = [
      view === 'for-you' ? `((${discoverable} AND NOT ${joinedByMe}) OR ${mineLive})` : view === 'created' ? hosted : discoverable,
      `($1 = 'all' OR t."type" = $1)`, `($2 = 'all' OR t."challengeType" = $2)`,
      ...(view === 'starting' ? [`t."startsAt" > now()`] : []),
      ...(view === 'friends' ? [friendsInvolved] : []),
    ].join(' AND ');
    const order = view === 'created' ? `(CASE WHEN ${mineLive} THEN 0 ELSE 1 END), t."createdAt" DESC`
      : view === 'starting' ? 't."startsAt" ASC'
      : view === 'newest' ? 't."createdAt" DESC'
      : view === 'for-you' ? `(CASE WHEN ${mineLive} THEN 1 ELSE 0 END) DESC, (CASE WHEN ${mineLive} THEN t."scoringClosesAt" END) ASC NULLS LAST,
                              ((CASE WHEN ${fits} THEN 3 ELSE 0 END) + (CASE WHEN ${friendsInvolved} THEN 2 ELSE 0 END)
                              + (CASE WHEN t."type" <> 'paid' THEN 1 ELSE 0 END) + ln(1 + ${joinedCount})) DESC, t."createdAt" DESC`
      : `${joinedCount} DESC, t."createdAt" DESC`;
    const ranked = (await this.dataSource.query(
      `SELECT t."id", ${joinedCount}::integer AS n
       FROM "competition_tables" t LEFT JOIN "table_registrations" r ON r."tableId" = t."id"
       WHERE ${where}
       GROUP BY t."id" HAVING ${view === 'created' ? 'true' : `t."capacity" IS NULL OR ${joinedCount} < t."capacity"${view === 'for-you' ? ` OR ${mineLive}` : ''}`}
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
    const out = new Map<string, { leaders: Array<{ rank: number; displayName: string; username: string | null; avatarUrl: string | null; score: number }>; faces: Array<{ displayName: string; avatarUrl: string | null }>; myRank: number | null }>();
    if (!tableIds.length) return out;
    const rows = (await this.dataSource.query(
      `SELECT * FROM (
         SELECT r."tableId", r."joinedAt", r."userId",
                COALESCE(p."displayName", u."displayName", 'Runner') AS "displayName", p."username", p."avatarUrl",
                r."score", t."scoringMethod",
                row_number() OVER (PARTITION BY r."tableId" ORDER BY ${RANK_ORDER})::integer AS "rank"
         FROM "table_registrations" r
         JOIN "competition_tables" t ON t."id" = r."tableId"
         JOIN "users" u ON u."id" = r."userId" LEFT JOIN "profiles" p ON p."userId" = r."userId"
         WHERE r."tableId" = ANY($1::uuid[])
       ) ranked WHERE ranked."rank" <= 5 OR ranked."userId" = $2`,
      [tableIds, viewerId],
    )) as Array<{ tableId: string; userId: string; rank: number; displayName: string; username: string | null; avatarUrl: string | null; score: number | null; scoringMethod: ScoringMethod }>;
    for (const row of rows) {
      const entry = out.get(row.tableId) ?? { leaders: [], faces: [], myRank: null };
      if (viewerId && row.userId === viewerId) entry.myRank = row.rank;
      if (row.rank > 5) { out.set(row.tableId, entry); continue; }
      // Lower-is-better scores (times, variation) count from zero; totals only once there's something.
      const scored = row.score !== null && (METRICS[row.scoringMethod]?.better === 'lower' || Number(row.score) > 0);
      if (scored && row.rank <= 3) entry.leaders.push({ rank: row.rank, displayName: row.displayName, username: row.username, avatarUrl: row.avatarUrl, score: Number(row.score) });
      entry.faces.push({ displayName: row.displayName, avatarUrl: row.avatarUrl });
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
         WHERE (t."creatorId" = $1 OR r."id" IS NOT NULL) AND t."status" <> 'CANCELLED'
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
              (SELECT x."score" FROM ranked x WHERE x."tableId" = t."id" AND x."rank" = 1) AS "leaderScore"
       FROM mine m JOIN "competition_tables" t ON t."id" = m."id"
       LEFT JOIN ranked me ON me."tableId" = t."id" AND me."userId" = $1
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
    await this.assertCommunityManager(creatorId, input.communityId);
    if (input.inviteClubMembers && !input.communityId) throw new BadRequestException('Choose a club before inviting its members');
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
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    // Open-ended: no closing time at all; entry stays open and every verified activity keeps counting.
    const scoringClosesAt = input.openEnded ? null : input.scoringClosesAt
      ? new Date(input.scoringClosesAt)
      : new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const entryClosesAt = input.openEnded ? null : input.entryClosesAt ? new Date(input.entryClosesAt) : scoringClosesAt;
    if (scoringClosesAt && entryClosesAt && (entryClosesAt > scoringClosesAt || startsAt > scoringClosesAt)) {
      throw new ConflictException('Entry and start times must be before scoring closes');
    }
    const table = this.tables.create({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      code: randomBytes(4).toString('hex').toUpperCase(),
      creatorId,
      type: sponsored ? 'sponsored' : 'free',
      entryFeeKobo: 0,
      status: input.guaranteedPrizeKobo ? 'PENDING_FUNDING' : 'OPEN_FOR_ENTRY',
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
    return this.saveWithInvites(table, input);
  }

  async createPaidDraft(creatorId: string, input: CreateCreatorPaidChallengeDto) {
    if (input.challengeType === 'CYCLING') throw new BadRequestException('Cycling competitions cannot have cash prizes yet');
    const scoring = scoringColumns(input, true);
    await this.assertCommunityManager(creatorId, input.communityId);
    if (input.inviteClubMembers && !input.communityId) throw new BadRequestException('Choose a club before inviting its members');
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
    const startsAt = new Date(input.startsAt);
    const entryClosesAt = new Date(input.entryClosesAt ?? input.scoringClosesAt);
    const scoringClosesAt = new Date(input.scoringClosesAt);
    if ((input.minimumEntrants ?? 2) > input.capacity || entryClosesAt > scoringClosesAt || startsAt > scoringClosesAt) {
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
      minimumEntrants: (input.minimumEntrants ?? 2),
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
    }), input);
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
        if (table.visibility === 'private' && table.creatorId !== userId) {
          const [invited] = await manager.query(
            `SELECT 1 FROM "challenge_invitations" i JOIN "users" u ON u."id"=$2
             WHERE i."tableId"=$1 AND i."status"<>'DECLINED' AND (i."invitedUserId"=u."id" OR (u."emailVerified" AND lower(i."email")=lower(u."email")))`,
            [tableId, userId],
          );
          if (!invited) throw new ForbiddenException('This is a private competition. Ask the host to invite you.');
        }
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
  async discard(tableId: string, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(CompetitionTable, { where: { id: tableId }, lock: { mode: 'pessimistic_write' } });
      if (!table) throw new NotFoundException('Competition not found');
      if (table.creatorId !== userId) throw new ForbiddenException('Only the host can discard this draft');
      if (table.status !== 'PENDING_FUNDING' && table.status !== 'PENDING_APPROVAL') throw new ConflictException('Only drafts can be discarded. This one is already open.');
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
              r."creditedDistanceMetres",r."creditedSteps",r."completionTimeSeconds",r."score",r."targetReachedAt",r."qualified"
       FROM "table_registrations" r JOIN "users" u ON u."id"=r."userId" LEFT JOIN "profiles" p ON p."userId"=r."userId" WHERE r."tableId"=$1
       ORDER BY ${RANK_ORDER} LIMIT 500`,
      [tableId],
    );
  }

  async getByCode(code: string) {
    const table = await this.tables.findOne({
      where: { code: code.toUpperCase() },
      relations: { creator: true },
    });
    if (!table) throw new NotFoundException('Competition not found');
    const [presented] = await this.present([table]);
    const [host] = (await this.dataSource.query(`SELECT "username", "avatarUrl" FROM "profiles" WHERE "userId" = $1`, [table.creatorId])) as Array<{ username: string; avatarUrl: string | null }>;
    return { ...presented, creator: presented.creator ? { ...presented.creator, username: host?.username ?? null, avatarUrl: host?.avatarUrl ?? null } : null };
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

  private async saveWithInvites(table: CompetitionTable, input: Invites) {
    if (table.status !== 'OPEN_FOR_ENTRY' && (input.inviteClubMembers || input.inviteEmails?.length || input.invitePhones?.length)) {
      throw new BadRequestException('Fund or approve this draft before inviting runners');
    }
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
      return created;
    });
    const url = `${this.config.getOrThrow<string>('WEB_ORIGIN')}/competitions/${saved.code}`;
    for (const email of emails.filter((address) => !known.has(address))) this.mail.sendInBackground(challengeInviteEmail({ address: email }, saved.title, url));
    return saved;
  }

  private async insertInvitations(manager: EntityManager, table: CompetitionTable, input: Invites, emails: string[], phones: string[]) {
    if (input.inviteClubMembers && input.communityId) {
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
    if (input.inviteClubMembers || emails.length) await manager.query(
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

  private async assertCommunityManager(userId: string, communityId?: string) {
    if (!communityId) return;
    const allowed = await this.dataSource.query(
      `SELECT 1 FROM "club_memberships" WHERE "clubId"=$1 AND "userId"=$2 AND "role" IN ('owner','admin')`,
      [communityId, userId],
    ) as unknown[];
    if (!allowed.length) throw new ForbiddenException('Community owner or admin access required');
  }
}

