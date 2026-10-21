import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { refreshLeagueDistance } from '../leagues/league-credits';
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
import { assertScoringConfiguration } from '../tables/challenge-types';
import { calculatePrizeBreakdown } from '../payments/financial-policy';
import { allocatePrizes, assertPrizeSplit } from '../tables/prize-split';
import { paidPrizePot } from '../tables/paid-prize';
import { User } from '../users/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async approvePayout(actorUserId: string, payoutId: string, password: string) {
    await this.assertAdminPassword(actorUserId, password);
    return this.paymentsService.approvePayout(actorUserId, payoutId);
  }

  async rejectPayout(actorUserId: string, payoutId: string, reason: string) {
    return this.paymentsService.rejectPayout(actorUserId, payoutId, reason.trim());
  }

  payouts(view: 'pending' | 'history') {
    return this.paymentsService.listPayouts(view);
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

  async reconcilePayments(actorUserId: string, password: string) {
    await this.assertAdminPassword(actorUserId, password);
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
      await manager.query(`INSERT INTO "notifications" ("userId","type","title","body") VALUES ($1,$2,$3,$4)`, [
        rows[0].userId,
        status === 'ACTIVE' ? 'CREATOR_APPROVED' : 'CREATOR_SUSPENDED',
        status === 'ACTIVE' ? 'You’re approved as a creator' : 'Creator account suspended',
        status === 'ACTIVE'
          ? 'You can now host paid challenges on Jump. Create one from Compete.'
          : 'You can’t host new paid challenges for now. Contact Jump support if you think this is a mistake.',
      ]);
      return rows[0];
    });
  }

  pendingReviews() {
    return this.dataSource.getRepository(ActivityVerificationReview).find({
      where: { status: 'PENDING' },
      relations: { activity: true },
      order: { createdAt: 'ASC' },
      take: 200,
    });
  }

  async resolveReview(actorUserId: string, reviewId: string, input: ResolveReviewDto) {
    return this.dataSource.transaction(async (manager) => {
      const review = await manager.findOne(ActivityVerificationReview, {
        where: { id: reviewId, status: 'PENDING' },
        relations: { activity: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!review) throw new NotFoundException('Pending review not found');

      const verificationStatus = input.decision === 'APPROVED' ? 'VERIFIED' : 'REJECTED';
      review.status = input.decision;
      await manager.save(review);
      await manager.update(Activity, { id: review.activityId }, { verificationStatus });
      await manager.update(RunningSession, { id: review.activity.runningSessionId }, { status: verificationStatus });

      if (input.decision === 'APPROVED') {
        await manager.query(
          `INSERT INTO "table_activity_credits" ("tableId", "registrationId", "activityId", "creditedDistanceMetres", "creditedSteps", "completionTimeSeconds")
           SELECT t."id", r."id", a."id",
             CASE WHEN t."scoringMethod"='FARTHEST_DISTANCE' THEN LEAST(
               CASE WHEN t."type" IN ('free','sponsored') THEN GREATEST(a."validatedDistanceMetres", a."stepDistanceMetres") ELSE a."validatedDistanceMetres" END,
               COALESCE(t."distanceCapMetres", 2147483647)) ELSE 0 END,
             CASE WHEN t."scoringMethod"='MOST_STEPS' THEN a."validatedSteps" ELSE 0 END,
             CASE WHEN t."scoringMethod" IN ('FASTEST_FIXED_DISTANCE','FASTEST_TIME') AND a."validatedDistanceMetres">=t."targetDistanceMetres" THEN a."movingSeconds" ELSE NULL END
           FROM "activities" a JOIN "table_registrations" r ON r."userId" = a."userId" AND r."joinedAt" <= a."startedAt"
           JOIN "competition_tables" t ON t."id" = r."tableId"
           WHERE a."id" = $1 AND a."startedAt" >= COALESCE(t."startsAt", '-infinity'::timestamptz)
             AND (t."challengeType" IN ('DISTANCE','STEP','TIMED') OR (t."challengeType"='WALK' AND a."activityType"='walk') OR (t."challengeType"='RUN' AND a."activityType"='run'))
             AND a."finishedAt" <= COALESCE(t."scoringClosesAt", 'infinity'::timestamptz)
           ON CONFLICT ("tableId", "activityId") DO NOTHING`,
          [review.activityId],
        );
      } else {
        await manager.query(`DELETE FROM "table_activity_credits" WHERE "activityId" = $1`, [review.activityId]);
      }
      await manager.query(
        `UPDATE "table_registrations" r SET "creditedDistanceMetres" = totals.distance,"creditedSteps"=totals.steps,"completionTimeSeconds"=totals.best_time
         FROM (SELECT r2."id", COALESCE(SUM(c."creditedDistanceMetres"), 0)::integer distance,
                      COALESCE(SUM(c."creditedSteps"), 0)::integer steps,MIN(c."completionTimeSeconds")::integer best_time
           FROM "table_registrations" r2 LEFT JOIN "table_activity_credits" c ON c."registrationId" = r2."id" GROUP BY r2."id") totals
         WHERE r."id" = totals."id"`,
      );
      await manager.query(
        `INSERT INTO "admin_audit_events" ("actorUserId", "action", "targetType", "targetId", "metadata") VALUES ($1,$2,'activity_review',$3,$4)`,
        [actorUserId, `REVIEW_${input.decision}`, reviewId, JSON.stringify({ note: input.note })],
      );
      await refreshLeagueDistance(manager, review.activity.userId);
      return { id: review.id, status: review.status };
    });
  }

  async createPaidDraft(actorUserId: string, input: CreatePaidTableDto) {
    try {
      assertScoringConfiguration(input.challengeType, input.scoringMethod, input.targetDistanceMetres);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid challenge scoring');
    }
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
      throw new ConflictException('Paid challenge dates or entrant limits are invalid');
    }
    const creator = (await this.dataSource.query(`SELECT "id" FROM "creator_profiles" WHERE "userId"=$1 AND "status"='ACTIVE'`, [input.creatorId]) as Array<{ id: string }>)[0];
    const table = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(CompetitionTable, manager.create(CompetitionTable, {
        creatorId: input.creatorId, title: input.title.trim(), code: randomBytes(4).toString('hex').toUpperCase(),
        type: 'paid', status: 'PENDING_APPROVAL', entryFeeKobo: input.entryFeeKobo,
        guaranteedPrizeKobo, minimumEntrants: (input.minimumEntrants ?? 2),
        capacity: input.capacity, startsAt, entryClosesAt, scoringClosesAt, distanceCapMetres: null,
        challengeType: input.challengeType, scoringMethod: input.scoringMethod,
        targetDistanceMetres: input.targetDistanceMetres ?? null, communityId: input.communityId ?? null,
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
      if (!table) throw new NotFoundException('Paid challenge not found');
      if (table.status !== 'PENDING_APPROVAL') throw new ConflictException('Challenge is not pending approval');
      table.status = 'OPEN_FOR_ENTRY';
      await manager.save(table);
      await manager.query(`INSERT INTO "notifications" ("userId","type","title","body") VALUES ($1,'PAID_CHALLENGE_APPROVED','Your challenge is open',$2)`, [table.creatorId, `${table.title} is approved. Runners can now join with code ${table.code}.`]);
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
      if (!table) throw new NotFoundException('Challenge not found');
      if (!table.scoringClosesAt || table.scoringClosesAt > new Date()) {
        throw new ConflictException('Scoring has not closed');
      }
      let fundingUserId: string | null = null;
      if (table.type === 'sponsored') {
        const funding = await manager.query(
          `SELECT "userId","status" FROM "payment_intents" WHERE "tableId"=$1 AND "purpose"='SPONSOR_FUNDING' ORDER BY "createdAt" DESC`,
          [tableId],
        ) as Array<{ userId: string; status: string }>;
        const successful = funding.filter((intent) => intent.status === 'SUCCEEDED');
        if (!table.fundedAt || successful.length !== 1 || funding.some((intent) => intent.status === 'DISPUTED')) {
          throw new ConflictException('Prize funding is not verified or is under dispute');
        }
        fundingUserId = successful[0].userId;
      }
      const pending = await manager.query(
        `SELECT COUNT(*)::integer count FROM "activities" a JOIN "table_registrations" r ON r."userId" = a."userId"
         WHERE r."tableId" = $1 AND a."verificationStatus" IN ('PENDING_VERIFICATION','FLAGGED')
           AND a."startedAt" >= COALESCE($2::timestamptz, '-infinity'::timestamptz) AND a."finishedAt" <= $3`,
        [tableId, table.startsAt, table.scoringClosesAt],
      ) as Array<{ count: number }>;
      if (Number(pending[0].count) > 0) throw new ConflictException('Activities are still pending review');

      const metric = table.scoringMethod === 'MOST_STEPS' ? 'r."creditedSteps" DESC' : table.scoringMethod === 'FARTHEST_DISTANCE' ? 'r."creditedDistanceMetres" DESC' : 'r."completionTimeSeconds" ASC NULLS LAST';
      const standings = (await manager.query(
        `SELECT r."userId", r."creditedDistanceMetres",r."creditedSteps",r."completionTimeSeconds", r."joinedAt",
                row_number() OVER (ORDER BY ${metric}, r."joinedAt" ASC, r."userId" ASC)::integer rank
         FROM "table_registrations" r WHERE r."tableId" = $1
         ORDER BY ${metric}, r."joinedAt" ASC, r."userId" ASC`,
        [tableId],
      )) as Array<{ userId: string; creditedDistanceMetres: number; creditedSteps: number; completionTimeSeconds: number | null; joinedAt: Date; rank: number }>;
      const eligible = standings.filter((row) =>
        (table.type === 'free' || (row.userId !== table.creatorId && row.userId !== fundingUserId)) &&
        (!['FASTEST_FIXED_DISTANCE', 'FASTEST_TIME'].includes(table.scoringMethod) || row.completionTimeSeconds !== null));
      const winner = eligible[0];
      if (table.type === 'paid' && standings.filter((row) => row.userId !== table.creatorId).length < table.minimumEntrants) {
        throw new ConflictException('Minimum entrants were not met; cancel and refund the challenge');
      }
      if (['paid', 'sponsored'].includes(table.type) && !winner) throw new ConflictException('No eligible finisher is available for the funded prize');
      const existing = (await manager.query(`SELECT COALESCE(MAX("version"),0)::integer version FROM "table_settlements" WHERE "tableId" = $1`, [tableId])) as Array<{ version: number }>;
      const version = Number(existing[0].version) + 1;
      const snapshots = (await manager.query(
        `INSERT INTO "table_leaderboard_snapshots" ("tableId","version","algorithmVersion","standings") VALUES ($1,$2,$3,$4) RETURNING "id"`,
        [tableId, version, `jump-${table.scoringMethod.toLowerCase()}-v1`, JSON.stringify(standings)],
      )) as Array<{ id: string }>;
      const settlements = (await manager.query(
        `INSERT INTO "table_settlements" ("tableId","version","snapshotId","winnerUserId","settledByUserId") VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [tableId, version, snapshots[0].id, winner?.userId ?? null, actorUserId],
      )) as Array<Record<string, unknown>>;
      await manager.update(CompetitionTable, { id: tableId }, { status: 'SETTLED' });
      if (['paid', 'sponsored'].includes(table.type) && table.guaranteedPrizeKobo) {
        const { creatorCommissionKobo, winnerAmountKobo } = calculatePrizeBreakdown(
          table.guaranteedPrizeKobo, table.platformFeeBps, table.creatorCommissionBps,
        );
        const shares = (table.prizeSplitBps ?? [10000]).slice(0, eligible.length);
        const recipients = eligible.slice(0, shares.length);
        const gross = allocatePrizes(table.guaranteedPrizeKobo, shares);
        const prizes = allocatePrizes(winnerAmountKobo, shares);
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
            [tableId, table.guaranteedPrizeKobo, creatorCommissionKobo, table.creatorId],
          );
        }
      }
      await manager.query(
        `INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId","metadata") VALUES ($1,'TABLE_SETTLED','competition_table',$2,$3)`,
        [actorUserId, tableId, JSON.stringify({ version })],
      );
      return settlements[0];
    });
  }

  private async assertAdminPassword(userId: string, password: string) {
    const user = await this.dataSource.getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId AND user.role = :role', { userId, role: 'admin' })
      .getOne();
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new ForbiddenException('Administrator password confirmation failed');
    }
  }
}
