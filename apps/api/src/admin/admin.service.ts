import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ACTIVITY_VERIFICATION_QUEUE } from '../jobs/jobs.module';
import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { refreshLeagueDistance } from '../leagues/league-credits';
import { creditActivities, rescore, uncreditActivity } from '../tables/competition-credits';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { CompetitionTable } from '../tables/competition-table.entity';
import { DataSource } from 'typeorm';
import { ActivityVerificationReview } from '../running/activity-verification-review.entity';
import { Activity } from '../running/activity.entity';
import { RunningSession } from '../running/running-session.entity';
import { ResolveReviewDto } from './resolve-review.dto';
import { ApprovePaidTableDto, CreatePaidTableDto } from './paid-table.dto';
import { reminderConfig } from '../tables/reminder-config';
import { PaymentsService } from '../payments/payments.service';
import { scoringColumns } from '../tables/scoring-columns';
import { announceCompetition } from '../tables/club-challenges';
import { inviteClubToPaid } from '../tables/club-competitions';
import { RANK_ORDER } from '../tables/scoring-engine';
import { calculatePrizeBreakdown, cashPrizeEligible } from '../payments/financial-policy';
import { allocateFundedPrizes, allocatePrizes, assertPrizeSplit } from '../tables/prize-split';
import { paidPrizePot } from '../tables/paid-prize';
import { AdminAuthService } from './admin-auth.service';
import { PrizeAwardsService } from '../prizes/prize-awards.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly paymentsService: PaymentsService,
    private readonly adminAuth: AdminAuthService,
    private readonly awardsService: PrizeAwardsService,
    @InjectQueue(ACTIVITY_VERIFICATION_QUEUE) private readonly verificationQueue: Queue,
  ) {}

  /**
   * After the verification rules change: put flagged Jump recordings from the last `days` back through
   * the checks. Ones that now pass are verified, credited and announced; the rest stay flagged, quietly.
   * Activities an admin already decided aren't touched (they aren't FLAGGED any more).
   */
  async recheckFlagged(actorUserId: string, days = 60) {
    const ids = await this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `UPDATE "activities" SET "verificationStatus"='PENDING_VERIFICATION'
         WHERE "verificationStatus"='FLAGGED' AND "source"='jump' AND "startedAt" > now() - make_interval(days => $1::int)
           AND "runningSessionId" IS NOT NULL
         RETURNING "id"`,
        [days],
      ) as [Array<{ id: string }>, number];
      const list = rows[0].map((row) => row.id);
      await manager.query(
        `INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId","metadata") VALUES ($1,'ACTIVITIES_RECHECKED','activity','flagged',$2)`,
        [actorUserId, JSON.stringify({ days, count: list.length })],
      );
      return list;
    });
    // A fresh job id each time: an earlier verification job for the same activity may still be in Redis.
    const stamp = Date.now();
    await Promise.all(ids.map((activityId) => this.verificationQueue.add(
      'verify-activity', { activityId, recheck: true },
      { jobId: `recheck-${activityId}-${stamp}`, attempts: 5, backoff: { type: 'exponential', delay: 1_000 } },
    )));
    return { queued: ids.length };
  }

  /* ───────── Club moderation and prizes ───────── */

  /**
   * Jump's enforcement on clubs: suspend (it keeps its page but can't run challenges; its live challenges
   * keep going unless taken down) and its plan (for paid features). Both are audited.
   */
  async moderateClub(actorUserId: string, clubId: string, input: { suspended?: boolean; reason?: string; plan?: 'free' | 'pro'; planRenewsAt?: string | null }) {
    if (input.suspended && (input.reason?.trim().length ?? 0) < 5) throw new BadRequestException('Say why the club is suspended; its managers see it');
    return this.dataSource.transaction(async (manager) => {
      const [club] = await manager.query(`SELECT "id","slug","name","plan","suspendedAt" FROM "clubs" WHERE "id" = $1 FOR UPDATE`, [clubId]) as Array<{ id: string; slug: string; name: string; plan: string; suspendedAt: Date | null }>;
      if (!club) throw new NotFoundException('Club not found');
      if (input.suspended !== undefined) {
        await manager.query(`UPDATE "clubs" SET "suspendedAt" = CASE WHEN $2 THEN COALESCE("suspendedAt", now()) ELSE NULL END, "suspendedReason" = CASE WHEN $2 THEN $3 ELSE NULL END WHERE "id" = $1`,
          [clubId, input.suspended, input.reason?.trim() ?? null]);
        await manager.query(
          `INSERT INTO "notifications" ("userId","type","title","body","link")
           SELECT "userId",'CLUB_MODERATION',$2,$3,$4 FROM "club_memberships" WHERE "clubId" = $1 AND "role" IN ('owner','admin')`,
          [clubId, input.suspended ? `${club.name} is suspended` : `${club.name} can run competitions again`,
            input.suspended ? `${input.reason!.trim()} Contact Jump support to resolve it.` : 'The suspension was lifted.', `/clubs/${club.slug}`],
        );
      }
      if (input.plan) await manager.query(`UPDATE "clubs" SET "plan" = $2, "planRenewsAt" = $3 WHERE "id" = $1`, [clubId, input.plan, input.planRenewsAt ? new Date(input.planRenewsAt) : null]);
      await manager.query(
        `INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId","metadata") VALUES ($1,'CLUB_MODERATED','club',$2,$3)`,
        [actorUserId, clubId, JSON.stringify({ suspended: input.suspended ?? null, reason: input.reason ?? null, plan: input.plan ?? null, planRenewsAt: input.planRenewsAt ?? null })],
      );
      return { id: clubId };
    });
  }

  /** Takes a challenge down for breaking the rules: cancelled, off every list, and its host told why. */
  async takeDownChallenge(actorUserId: string, tableId: string, reason: string) {
    return this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(CompetitionTable, { where: { id: tableId }, lock: { mode: 'pessimistic_write' } });
      if (!table) throw new NotFoundException('Competition not found');
      if (table.type !== 'free') throw new ConflictException('Cash and paid competitions are settled or refunded through the payments review instead');
      table.status = 'CANCELLED';
      table.archivedAt = new Date();
      await manager.save(table);
      await manager.query(`UPDATE "product_awards" SET "status" = 'FORFEITED', "forfeitReason" = 'Competition removed by Jump', "updatedAt" = now() WHERE "tableId" = $1 AND "status" = 'AWAITING_DETAILS'`, [tableId]);
      await manager.query(`INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,'CHALLENGE_REMOVED',$2,$3,$4)`,
        [table.creatorId, `${table.title} was taken down`, `${reason.trim()} Contact Jump support if you think this is a mistake.`, `/competitions/${table.code}`]);
      await manager.query(`INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId","metadata") VALUES ($1,'CHALLENGE_TAKEN_DOWN','competition_table',$2,$3)`,
        [actorUserId, tableId, JSON.stringify({ reason: reason.trim(), title: table.title })]);
      return { id: tableId, status: table.status };
    });
  }

  /** Premium placement: listed first in discovery until the given time (null ends it). */
  async promoteChallenge(actorUserId: string, tableId: string, until: string | null) {
    const end = until ? new Date(until) : null;
    if (end && end <= new Date()) throw new BadRequestException('Promote it until a time in the future');
    const result = await this.dataSource.query(`UPDATE "competition_tables" SET "promotedUntil" = $2 WHERE "id" = $1 RETURNING "id"`, [tableId, end]) as [unknown[], number];
    if (!result[0].length) throw new NotFoundException('Competition not found');
    await this.dataSource.query(`INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId","metadata") VALUES ($1,'CHALLENGE_PROMOTED','competition_table',$2,$3)`,
      [actorUserId, tableId, JSON.stringify({ until: end })]);
    return { id: tableId, promotedUntil: end };
  }

  /** Every winner and prize across clubs, with claim details (admins see them to resolve issues). */
  prizeAwards(status?: string) {
    const filter = ['AWAITING_DETAILS', 'DETAILS_SUBMITTED', 'READY_FOR_DISPATCH', 'SHIPPED', 'DELIVERED', 'FORFEITED', 'ISSUE'].includes(status ?? '') ? status : null;
    return this.dataSource.query(
      `SELECT a.*, pr."productName", pr."kind", t."code", t."title", t."prizeFulfilment", c."name" AS "clubName", c."slug" AS "clubSlug",
              COALESCE(p."displayName", u."displayName") AS "winnerName", u."email" AS "winnerEmail", p."countryCode" AS "winnerCountry"
       FROM "product_awards" a JOIN "competition_prizes" pr ON pr."id" = a."prizeId" JOIN "competition_tables" t ON t."id" = a."tableId"
       JOIN "clubs" c ON c."id" = t."communityId" JOIN "users" u ON u."id" = a."userId" LEFT JOIN "profiles" p ON p."userId" = a."userId"
       WHERE ($1::text IS NULL OR a."status" = $1)
       ORDER BY CASE a."status" WHEN 'ISSUE' THEN 0 WHEN 'DETAILS_SUBMITTED' THEN 1 WHEN 'AWAITING_DETAILS' THEN 2 ELSE 3 END, a."updatedAt" DESC LIMIT 300`,
      [filter],
    );
  }

  updatePrizeAward(actorUserId: string, awardId: string, status: 'READY_FOR_DISPATCH' | 'SHIPPED' | 'DELIVERED' | 'ISSUE', notes: { trackingNote?: string; issueNote?: string }) {
    void actorUserId;
    return this.awardsService.updateStatus(awardId, status, notes, { admin: true });
  }

  forfeitPrizeAward(_actorUserId: string, awardId: string, reason: string) {
    return this.awardsService.forfeit(awardId, reason);
  }

  /** Decide winners now for a closed prize challenge (instead of waiting for the schedule). */
  async finalizePrizes(_actorUserId: string, tableId: string) {
    const table = await this.dataSource.getRepository(CompetitionTable).findOne({ where: { id: tableId } });
    if (!table?.prizeFulfilment) throw new NotFoundException('Prize competition not found');
    if (!table.scoringClosesAt || table.scoringClosesAt > new Date()) throw new ConflictException('It hasn’t ended yet');
    return { winners: await this.awardsService.finalize(tableId) };
  }

  async stats() {
    // "Today" is the Lagos calendar day, not the last 24 hours.
    const [row] = await this.dataSource.query(
      `WITH today AS (SELECT (date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos') AS start)
       SELECT
         (SELECT count(*) FROM "users")::integer AS "users",
         (SELECT count(*) FROM "users", today WHERE "createdAt" >= today.start)::integer AS "newToday",
         (SELECT count(*) FROM "users" WHERE "createdAt" > now() - interval '7 days')::integer AS "newWeek",
         (SELECT count(*) FROM "users" WHERE "createdAt" > now() - interval '30 days')::integer AS "newMonth",
         (SELECT count(*) FROM "users", today WHERE "lastSeenAt" >= today.start)::integer AS "activeToday",
         (SELECT count(DISTINCT "userId") FROM "activities", today WHERE "startedAt" >= today.start)::integer AS "movedToday",
         (SELECT count(*) FROM "users" WHERE "emailVerified")::integer AS "verified",
         (SELECT count(DISTINCT "userId") FROM "activities" WHERE "startedAt" > now() - interval '7 days')::integer AS "activeWeek",
         (SELECT count(*) FROM "strava_accounts" WHERE "userId" IS NOT NULL)::integer AS "strava",
         (SELECT count(*) FROM "competition_tables" WHERE "status" IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED'))::integer AS "liveCompetitions"`,
    ) as Array<Record<string, number>>;
    return row;
  }

  /**
   * Everyone on Jump for the admin list, newest activity first. Views match the stats: active today
   * (used Jump), moved today (recorded an activity), new today, or everyone; q searches name, username, email.
   */
  async people(input: { view?: string; q?: string; offset?: number }) {
    const view = ['active-today', 'moved-today', 'new-today'].includes(input.view ?? '') ? input.view : 'all';
    const term = input.q?.trim().toLowerCase().slice(0, 80) ?? '';
    const offset = Math.max(0, Math.min(Number(input.offset) || 0, 100_000));
    const rows = await this.dataSource.query(
      `WITH today AS (SELECT (date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos') AS start),
       people AS (
         SELECT u."id", COALESCE(p."displayName", u."displayName", 'Runner') AS "displayName", p."username", p."avatarUrl", p."countryCode",
                p."verifiedAt" IS NOT NULL AS "verified",
                u."email", u."emailVerified", u."role", u."createdAt", u."lastSeenAt",
                (SELECT max(a."startedAt") FROM "activities" a WHERE a."userId" = u."id") AS "lastActivityAt",
                (SELECT count(*) FROM "activities" a WHERE a."userId" = u."id" AND a."verificationStatus" = 'VERIFIED')::integer AS "activities",
                EXISTS (SELECT 1 FROM "strava_accounts" s WHERE s."userId" = u."id") AS "strava"
         FROM "users" u LEFT JOIN "profiles" p ON p."userId" = u."id"
       )
       SELECT people.*, count(*) OVER ()::integer AS "total" FROM people, today
       WHERE ($1 = 'all'
              OR ($1 = 'active-today' AND people."lastSeenAt" >= today.start)
              OR ($1 = 'moved-today' AND people."lastActivityAt" >= today.start)
              OR ($1 = 'new-today' AND people."createdAt" >= today.start))
         AND ($2 = '' OR lower(people."displayName") LIKE '%' || $2 || '%' OR lower(COALESCE(people."username", '')) LIKE '%' || $2 || '%'
              OR lower(people."email") LIKE '%' || $2 || '%')
       ORDER BY people."lastSeenAt" DESC NULLS LAST, people."createdAt" DESC
       LIMIT 50 OFFSET $3`,
      [view, term.replace(/[%_\\]/g, ''), offset],
    ) as Array<Record<string, unknown> & { total: number }>;
    return { total: rows[0]?.total ?? 0, people: rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'total'))) };
  }

  /** Blue tick for a person. Only after they've verified their email; the tick is a badge, nothing more. */
  async verifyPerson(actorUserId: string, ref: string, verified: boolean) {
    const byId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
    const [person] = await this.dataSource.query(
      `SELECT u."id", u."emailVerified" FROM "users" u JOIN "profiles" p ON p."userId" = u."id"
       WHERE ${byId ? 'u."id" = $1::uuid' : 'lower(p."username") = lower($1)'}`,
      [ref.replace(/^@/, '')],
    ) as Array<{ id: string; emailVerified: boolean }>;
    if (!person) throw new NotFoundException('Person not found');
    const userId = person.id;
    if (verified && !person.emailVerified) throw new ConflictException('They need to verify their email before they can get a blue tick');
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`UPDATE "profiles" SET "verifiedAt" = ${verified ? 'COALESCE("verifiedAt", now())' : 'NULL'} WHERE "userId" = $1`, [userId]);
      await manager.query(
        `INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId") VALUES ($1,$2,'user',$3)`,
        [actorUserId, verified ? 'PERSON_VERIFIED' : 'PERSON_UNVERIFIED', userId],
      );
      if (verified) await manager.query(
        `INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,'VERIFIED','You’re verified','Jump gave you a blue tick. It shows next to your name across the app.','/settings/profile')`,
        [userId],
      );
    });
    return { verified };
  }

  /** Every club for the console, biggest first; q searches name and handle, verified narrows to ticked ones. */
  async clubs(input: { q?: string; verified?: boolean; offset?: number }) {
    const term = input.q?.trim().toLowerCase().replace(/[%_\\]/g, '').slice(0, 80) ?? '';
    const rows = await this.dataSource.query(
      `SELECT c."id", c."slug", c."name", c."logoUrl", c."accentColor", c."location", c."privacy", c."createdAt",
              c."verifiedAt" IS NOT NULL AS "verified", c."plan", c."planRenewsAt", c."suspendedAt", c."suspendedReason",
              (SELECT count(*) FROM "club_memberships" m WHERE m."clubId" = c."id")::integer AS "memberCount",
              (SELECT count(*) FROM "club_follows" f WHERE f."clubId" = c."id")::integer AS "followerCount",
              (SELECT count(*) FROM "competition_tables" t WHERE t."communityId" = c."id" AND t."status" NOT IN ('DRAFT','CANCELLED'))::integer AS "challengeCount",
              COALESCE(p."displayName", u."displayName", 'Runner') AS "ownerName", u."email" AS "ownerEmail",
              count(*) OVER ()::integer AS "total"
       FROM "clubs" c JOIN "users" u ON u."id" = c."ownerUserId" LEFT JOIN "profiles" p ON p."userId" = u."id"
       WHERE ($1 = '' OR lower(c."name") LIKE '%' || $1 || '%' OR c."slug" LIKE '%' || $1 || '%')
         AND (NOT $2 OR c."verifiedAt" IS NOT NULL)
       ORDER BY "memberCount" DESC, c."createdAt" DESC
       LIMIT 50 OFFSET $3`,
      [term, Boolean(input.verified), Math.max(0, Math.min(input.offset ?? 0, 100_000))],
    ) as Array<Record<string, unknown> & { total: number }>;
    return { total: rows[0]?.total ?? 0, clubs: rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'total'))) };
  }

  /** Blue tick for a club. Clubs work the same without it; it marks the ones Jump has checked. */
  async verifyClub(actorUserId: string, clubId: string, verified: boolean) {
    const [club] = await this.dataSource.query(`SELECT "id", "slug", "name", "ownerUserId" FROM "clubs" WHERE "id" = $1`, [clubId]) as Array<{ id: string; slug: string; name: string; ownerUserId: string }>;
    if (!club) throw new NotFoundException('Club not found');
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`UPDATE "clubs" SET "verifiedAt" = ${verified ? 'COALESCE("verifiedAt", now())' : 'NULL'} WHERE "id" = $1`, [clubId]);
      await manager.query(
        `INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId") VALUES ($1,$2,'club',$3)`,
        [actorUserId, verified ? 'CLUB_VERIFIED' : 'CLUB_UNVERIFIED', clubId],
      );
      if (verified) await manager.query(
        `INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,'VERIFIED',$2,'Jump gave your club a blue tick. It shows on the club page and in club lists.',$3)`,
        [club.ownerUserId, `${club.name} is verified`, `/clubs/${club.slug}`],
      );
    });
    return { verified };
  }

  async approvePayout(actorUserId: string, payoutId: string, code: string, note?: string) {
    await this.adminAuth.assertConfirmCode(actorUserId, code);
    return this.paymentsService.approvePayout(actorUserId, payoutId, note);
  }

  async rejectPayout(actorUserId: string, payoutId: string, reason: string) {
    return this.paymentsService.rejectPayout(actorUserId, payoutId, reason.trim());
  }

  payouts(view: 'pending' | 'history') {
    return this.paymentsService.listPayouts(view);
  }

  charityAllocations() {
    return this.dataSource.query(
      `SELECT a."tableId",t."code",t."title",a."charityName",a."grossKobo",a."platformFeeKobo",a."charityKobo",a."status",a."createdAt"
       FROM "charity_allocations" a JOIN "competition_tables" t ON t."id"=a."tableId"
       ORDER BY a."createdAt" ASC LIMIT 200`,
    );
  }

  paidChallenges(view: 'pending' | 'approved') {
    return this.dataSource.query(
      `SELECT t."id",t."code",t."title",t."status",t."entryFeeKobo",t."guaranteedPrizeKobo",t."prizeSplitBps",t."startsAt",t."scoringClosesAt",t."createdAt",
              COALESCE(p."displayName",u."displayName",'Host') "hostName",p."username" "hostUsername"
       FROM "competition_tables" t JOIN "users" u ON u."id"=t."creatorId" LEFT JOIN "profiles" p ON p."userId"=u."id"
       WHERE t."type"='paid' AND t."status"=$1 ORDER BY t."createdAt" DESC LIMIT 100`,
      [view === 'pending' ? 'PENDING_APPROVAL' : 'OPEN_FOR_ENTRY'],
    );
  }

  async reconcilePayments(actorUserId: string, code: string) {
    await this.adminAuth.assertConfirmCode(actorUserId, code);
    return this.paymentsService.reconcile();
  }

  /** Creator accounts for review: pending applications oldest first, the rest newest first. */
  creators(view: 'pending' | 'active' | 'suspended') {
    const status = view.toUpperCase();
    return this.dataSource.query(
      `SELECT c."id", c."userId", c."displayName", c."creatorType", c."socialUrl", c."bio", c."status", c."createdAt", c."reviewedAt",
              u."email", u."emailVerified", p."username", p."avatarUrl", reviewer."displayName" "reviewedBy",
              (SELECT COUNT(*) FROM "competition_tables" t WHERE t."creatorId" = c."userId" AND t."type" = 'paid')::integer "paidChallenges"
       FROM "creator_profiles" c
       JOIN "users" u ON u."id" = c."userId"
       LEFT JOIN "profiles" p ON p."userId" = c."userId"
       LEFT JOIN "profiles" reviewer ON reviewer."userId" = c."reviewedByUserId"
       WHERE c."status" = $1
       ORDER BY CASE WHEN $1 = 'PENDING' THEN c."createdAt" END ASC, c."createdAt" DESC
       LIMIT 200`,
      [status],
    );
  }

  /** Approve (ACTIVE) or suspend a creator. Only active creators can host paid challenges. */
  async reviewCreator(actorUserId: string, creatorId: string, status: 'ACTIVE' | 'SUSPENDED') {
    return this.dataSource.transaction(async (manager) => {
      // TypeORM returns [rows, affected] for UPDATE ... RETURNING on Postgres.
      const [rows] = (await manager.query(
        `UPDATE "creator_profiles" SET "status"=$2,"reviewedAt"=now(),"reviewedByUserId"=$3,"updatedAt"=now()
         WHERE "id"=$1 AND "status" <> $2 RETURNING "id","userId","status","displayName"`,
        [creatorId, status, actorUserId],
      )) as [Array<{ id: string; userId: string; status: string; displayName: string }>, number];
      if (!rows[0]) {
        const exists = await manager.query(`SELECT 1 FROM "creator_profiles" WHERE "id"=$1`, [creatorId]);
        if (!(exists as unknown[]).length) throw new NotFoundException('Creator not found');
        throw new ConflictException(status === 'ACTIVE' ? 'This creator is already approved' : 'This creator is already suspended');
      }
      await manager.query(
        `INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId","metadata") VALUES ($1,$2,'creator_profile',$3,'{}')`,
        [actorUserId, status === 'ACTIVE' ? 'CREATOR_APPROVED' : 'CREATOR_SUSPENDED', creatorId],
      );
      await manager.query(`INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,$2,$3,$4,'/creator')`, [
        rows[0].userId,
        status === 'ACTIVE' ? 'CREATOR_APPROVED' : 'CREATOR_SUSPENDED',
        status === 'ACTIVE' ? 'You’re approved as a creator' : 'Creator account suspended',
        status === 'ACTIVE'
          ? 'You can now host paid competitions on Jump. Create one from Compete.'
          : 'You can’t host new paid competitions for now. Contact Jump support if you think this is a mistake.',
      ]);
      return rows[0];
    });
  }

  pendingReviews() {
    return this.dataSource.getRepository(ActivityVerificationReview).find({
      where: { status: 'PENDING' },
      relations: { activity: true, requestedBy: true },
      order: { createdAt: 'ASC' },
      take: 200,
    });
  }

  async resolveReview(actorUserId: string, reviewId: string, input: ResolveReviewDto) {
    return this.dataSource.transaction(async (manager) => {
      // Lock the review alone: Postgres refuses FOR UPDATE on a LEFT JOINed relation, so the activity loads after.
      const review = await manager.findOne(ActivityVerificationReview, {
        where: { id: reviewId, status: 'PENDING' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!review) throw new NotFoundException('Pending review not found');
      review.activity = await manager.findOneOrFail(Activity, { where: { id: review.activityId } });

      const verificationStatus = input.decision === 'APPROVED' ? 'VERIFIED' : 'REJECTED';
      review.status = input.decision;
      await manager.save(review);
      await manager.update(Activity, { id: review.activityId }, { verificationStatus });
      await manager.update(RunningSession, { id: review.activity.runningSessionId }, { status: verificationStatus });

      if (input.decision === 'APPROVED') {
        await creditActivities(manager, { activityId: review.activityId });
      } else {
        await uncreditActivity(manager, review.activityId);
      }
      await manager.query(
        `INSERT INTO "admin_audit_events" ("actorUserId", "action", "targetType", "targetId", "metadata") VALUES ($1,$2,'activity_review',$3,$4)`,
        [actorUserId, `REVIEW_${input.decision}`, reviewId, JSON.stringify({ note: input.note })],
      );
      if (review.activity.activityType !== 'cycle') await refreshLeagueDistance(manager, review.activity.userId);
      return { id: review.id, status: review.status };
    });
  }

  async createPaidDraft(actorUserId: string, input: CreatePaidTableDto) {
    if (input.challengeType === 'CYCLING') throw new BadRequestException('Cycling competitions cannot have cash prizes yet');
    const scoring = scoringColumns(input, true);
    let guaranteedPrizeKobo: number;
    try { guaranteedPrizeKobo = paidPrizePot(input.capacity, input.entryFeeKobo); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid paid prize pot'); }
    const startsAt = new Date(input.startsAt);
    let prizeSplitBps: number[];
    try { prizeSplitBps = assertPrizeSplit(input.prizeSplitBps, input.capacity); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid prize shares'); }
    try { allocatePrizes(guaranteedPrizeKobo - Math.floor(guaranteedPrizeKobo * 0.35), prizeSplitBps); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Prize pot is too small'); }
    const entryClosesAt = new Date(input.entryClosesAt ?? input.scoringClosesAt);
    const scoringClosesAt = new Date(input.scoringClosesAt);
    if ((input.minimumEntrants ?? 2) > input.capacity || entryClosesAt > scoringClosesAt || startsAt > scoringClosesAt) {
      throw new ConflictException('Paid competition dates or entrant limits are invalid');
    }
    const creator = (await this.dataSource.query(`SELECT "id" FROM "creator_profiles" WHERE "userId"=$1 AND "status"='ACTIVE'`, [input.creatorId]) as Array<{ id: string }>)[0];
    const table = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(CompetitionTable, manager.create(CompetitionTable, {
        creatorId: input.creatorId, title: input.title.trim(), code: randomBytes(4).toString('hex').toUpperCase(),
        type: 'paid', status: 'PENDING_APPROVAL', entryFeeKobo: input.entryFeeKobo,
        guaranteedPrizeKobo, minimumEntrants: (input.minimumEntrants ?? 2),
        capacity: input.capacity, startsAt, entryClosesAt, scoringClosesAt, distanceCapMetres: null,
        ...scoring, format: input.capacity === 2 ? 'head_to_head' : 'open', communityId: input.communityId ?? null,
        ...reminderConfig(input.reminderTime, input.reminderTimeZone),
        platformFeeBps: creator ? 3500 : 3000, creatorCommissionBps: creator ? 500 : 0,
        prizeSplitBps,
      }));
      await manager.query(`INSERT INTO "table_registrations" ("tableId","userId") VALUES ($1,$2) ON CONFLICT DO NOTHING`, [created.id, created.creatorId]);
      await manager.query(`INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId") VALUES ($1,'PAID_TABLE_DRAFT_CREATED','competition_table',$2)`, [actorUserId, created.id]);
      return created;
    });
    return table;
  }

  async approvePaidTable(actorUserId: string, tableId: string, input: ApprovePaidTableDto) {
    if (!input.fundingConfirmed || !input.rulesApproved) throw new ConflictException('Funding and rules must be approved');
    const sandboxApproved = this.config.get('NODE_ENV') !== 'production' && this.config.get<string>('PAYSTACK_SECRET_KEY')?.startsWith('sk_test_');
    const productionApproved = this.config.get<boolean>('PAYSTACK_LIVE_ENABLED') &&
      this.config.get<string>('PAYSTACK_SECRET_KEY')?.startsWith('sk_live_') &&
      this.config.get<boolean>('LEGAL_APPROVAL_CONFIRMED') && this.config.get<boolean>('PAYSTACK_APPROVAL_CONFIRMED');
    if (!this.config.get<boolean>('PAID_CONTESTS_ENABLED') || (!sandboxApproved && !productionApproved)) {
      throw new ServiceUnavailableException('Paid competitions are not operationally approved');
    }
    return this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(CompetitionTable, { where: { id: tableId, type: 'paid' }, lock: { mode: 'pessimistic_write' } });
      if (!table) throw new NotFoundException('Paid competition not found');
      if (table.status !== 'PENDING_APPROVAL') throw new ConflictException('Competition is not pending approval');
      table.status = 'OPEN_FOR_ENTRY';
      await manager.save(table);
      if (table.communityId) await inviteClubToPaid(manager, table.id);
      await announceCompetition(manager, table);
      await manager.query(`INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,'PAID_CHALLENGE_APPROVED','Your competition is open',$2,$3)`, [table.creatorId, `${table.title} is approved. Runners can now join with code ${table.code}.`, `/competitions/${table.code}`]);
      await manager.query(`INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId","metadata") VALUES ($1,'PAID_TABLE_APPROVED','competition_table',$2,$3)`, [actorUserId, tableId, JSON.stringify(input)]);
      return table;
    });
  }

  async settleTable(actorUserId: string, tableId: string) {
    return this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(CompetitionTable, {
        where: { id: tableId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!table) throw new NotFoundException('Competition not found');
      if (!table.scoringClosesAt || table.scoringClosesAt > new Date()) {
        throw new ConflictException('Scoring has not closed');
      }
      let fundedPrizeKobo = table.guaranteedPrizeKobo ?? 0;
      const fundingUserIds = new Set<string>();
      if (table.type === 'sponsored') {
        const funding = await manager.query(
          `SELECT "userId","status","amountKobo" FROM "payment_intents" WHERE "tableId"=$1 AND "purpose"='SPONSOR_FUNDING'`,
          [tableId],
        ) as Array<{ userId: string; status: string; amountKobo: string }>;
        const successful = funding.filter((intent) => intent.status === 'SUCCEEDED');
        if (funding.some((intent) => intent.status === 'DISPUTED') ||
            (table.guaranteedPrizeKobo !== null && (!table.fundedAt || successful.length !== 1))) {
          throw new ConflictException('Prize funding is not verified or is under dispute');
        }
        fundedPrizeKobo = successful.reduce((sum, intent) => sum + Number(intent.amountKobo), 0);
        if (!Number.isSafeInteger(fundedPrizeKobo) || fundedPrizeKobo > 1_000_000_000) throw new ConflictException('Prize funding exceeds the supported limit');
        successful.forEach((intent) => fundingUserIds.add(intent.userId));
      }
      const pending = await manager.query(
        `SELECT COUNT(*)::integer count FROM "activities" a JOIN "table_registrations" r ON r."userId" = a."userId"
         WHERE r."tableId" = $1 AND a."verificationStatus" IN ('PENDING_VERIFICATION','FLAGGED')
           AND a."startedAt" >= COALESCE($2::timestamptz, '-infinity'::timestamptz) AND a."finishedAt" <= $3`,
        [tableId, table.startsAt, table.scoringClosesAt],
      ) as Array<{ count: number }>;
      if (Number(pending[0].count) > 0) throw new ConflictException('Activities are still pending review');

      // Final scores from the same engine as the live board, recomputed now so nothing is stale.
      await rescore(manager, [tableId]);
      const standings = (await manager.query(
        `SELECT r."userId", r."creditedDistanceMetres",r."creditedSteps",r."completionTimeSeconds", r."score", r."targetReachedAt", r."qualified", r."joinedAt",
                row_number() OVER (ORDER BY ${RANK_ORDER})::integer rank
         FROM "table_registrations" r WHERE r."tableId" = $1
         ORDER BY ${RANK_ORDER}`,
        [tableId],
      )) as Array<{ userId: string; creditedDistanceMetres: number; creditedSteps: number; completionTimeSeconds: number | null; score: number | null; qualified: boolean; joinedAt: Date; rank: number }>;
      // A winner needs a real score and to have met the minimums (a fastest-time race needs a finish).
      const eligible = standings.filter((row) => cashPrizeEligible(table, row.userId, fundingUserIds) && row.qualified && row.score !== null);
      const winner = eligible[0];
      if (table.type === 'paid' && standings.filter((row) => row.userId !== table.creatorId).length < table.minimumEntrants) {
        throw new ConflictException('Minimum entrants were not met; cancel and refund the competition');
      }
      if ((table.type === 'paid' || (table.type === 'sponsored' && table.fundingDestination !== 'CHARITY' && fundedPrizeKobo > 0)) && !winner) throw new ConflictException('No eligible finisher is available for the funded prize');
      const existing = (await manager.query(`SELECT COALESCE(MAX("version"),0)::integer version FROM "table_settlements" WHERE "tableId" = $1`, [tableId])) as Array<{ version: number }>;
      const version = Number(existing[0].version) + 1;
      const snapshots = (await manager.query(
        `INSERT INTO "table_leaderboard_snapshots" ("tableId","version","algorithmVersion","standings") VALUES ($1,$2,$3,$4) RETURNING "id"`,
        [tableId, version, `jump-${table.scoringMethod.toLowerCase()}-v${table.rulesVersion}`, JSON.stringify(standings)],
      )) as Array<{ id: string }>;
      const settlements = (await manager.query(
        `INSERT INTO "table_settlements" ("tableId","version","snapshotId","winnerUserId","settledByUserId") VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [tableId, version, snapshots[0].id, table.fundingDestination === 'CHARITY' ? null : winner?.userId ?? null, actorUserId],
      )) as Array<Record<string, unknown>>;
      await manager.update(CompetitionTable, { id: tableId }, { status: 'SETTLED' });
      if (table.type === 'sponsored' && table.fundingDestination === 'CHARITY' && fundedPrizeKobo) {
        const platformFeeKobo = Math.floor(fundedPrizeKobo * table.platformFeeBps / 10000);
        await manager.query(
          `INSERT INTO "charity_allocations" ("tableId","charityName","grossKobo","platformFeeKobo","charityKobo") VALUES ($1,$2,$3,$4,$5) ON CONFLICT ("tableId") DO NOTHING`,
          [tableId, table.charityName, fundedPrizeKobo, platformFeeKobo, fundedPrizeKobo - platformFeeKobo],
        );
      } else if (['paid', 'sponsored'].includes(table.type) && fundedPrizeKobo) {
        const { creatorCommissionKobo, winnerAmountKobo } = calculatePrizeBreakdown(
          fundedPrizeKobo, table.platformFeeBps, table.creatorCommissionBps,
        );
        const shares = (table.prizeSplitBps ?? [10000]).slice(0, table.type === 'sponsored' ? Math.min(eligible.length, winnerAmountKobo) : eligible.length);
        const recipients = eligible.slice(0, shares.length);
        const gross = table.type === 'sponsored' ? allocateFundedPrizes(fundedPrizeKobo, shares) : allocatePrizes(fundedPrizeKobo, shares);
        const prizes = table.type === 'sponsored' ? allocateFundedPrizes(winnerAmountKobo, shares) : allocatePrizes(winnerAmountKobo, shares);
        const commission = shares.map((share) => Math.floor(creatorCommissionKobo * share / shares.reduce((sum, part) => sum + part, 0)));
        commission[0] += creatorCommissionKobo - commission.reduce((sum, value) => sum + value, 0);
        await manager.query(
          `INSERT INTO "prize_awards" ("tableId","winnerUserId","place","grossPrizeKobo","amountKobo","platformFeeKobo","creatorCommissionKobo","currency")
           SELECT $1, x."userId", x."place", x."gross", x."amount", x."fee", x."commission", 'NGN'
           FROM jsonb_to_recordset($2::jsonb) AS x("userId" uuid,"place" integer,"gross" bigint,"amount" bigint,"fee" bigint,"commission" bigint)
           ON CONFLICT ("tableId","winnerUserId") DO NOTHING`,
          [tableId, JSON.stringify(recipients.map((row, index) => ({ userId: row.userId, place: index + 1, gross: gross[index], amount: prizes[index], fee: gross[index] - prizes[index], commission: commission[index] })))],
        );
        if (creatorCommissionKobo > 0) {
          await manager.query(
            `INSERT INTO "creator_earnings" ("creatorProfileId","tableId","grossPrizeKobo","amountKobo")
             SELECT c."id",$1,$2,$3 FROM "creator_profiles" c WHERE c."userId"=$4 AND c."status"='ACTIVE' ON CONFLICT ("tableId") DO NOTHING`,
            [tableId, fundedPrizeKobo, creatorCommissionKobo, table.creatorId],
          );
        }
      }
      await manager.query(
        `INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId","metadata") VALUES ($1,'TABLE_SETTLED','competition_table',$2,$3)`,
        [actorUserId, tableId, JSON.stringify({ version })],
      );
      await manager.query(
        `INSERT INTO "notifications" ("userId","type","title","body","link")
         SELECT r."userId",'COMPETITION_RESULT',
                CASE WHEN a."id" IS NOT NULL THEN 'You placed in ' || $2
                     WHEN $3::uuid IS NOT NULL THEN COALESCE(w."displayName",'A runner') || ' won ' || $2
                     ELSE $2 || ' has finished' END,
                CASE WHEN a."id" IS NOT NULL THEN 'Your prize is ready to view in Jump.'
                     ELSE 'The final leaderboard is ready. Open Jump to see the results.' END,
                '/competitions/' || $4
         FROM "table_registrations" r
         LEFT JOIN "prize_awards" a ON a."tableId"=r."tableId" AND a."winnerUserId"=r."userId"
         LEFT JOIN "profiles" w ON w."userId"=$3
         WHERE r."tableId"=$1`,
        [tableId, table.title, table.fundingDestination === 'CHARITY' ? null : winner?.userId ?? null, table.code],
      );
      return settlements[0];
    });
  }

}
