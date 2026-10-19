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
import { PaymentsService } from '../payments/payments.service';
import { assertScoringConfiguration } from '../tables/challenge-types';
import { calculatePrizeBreakdown } from '../payments/financial-policy';
import { UpdateUserEligibilityDto } from './user-eligibility.dto';
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

  async executePayout(actorUserId: string, payoutId: string, password: string) {
    await this.assertAdminPassword(actorUserId, password);
    return this.paymentsService.executePayout(actorUserId, payoutId);
  }

  async reconcilePayments(actorUserId: string, password: string) {
    await this.assertAdminPassword(actorUserId, password);
    return this.paymentsService.reconcile();
  }

  async updateEligibility(actorUserId: string, userId: string, input: UpdateUserEligibilityDto) {
    const users = await this.dataSource.query(`SELECT "id" FROM "users" WHERE "id"=$1`, [userId]) as Array<{ id: string }>;
    if (!users[0]) throw new NotFoundException('User not found');
    const countryCode = input.countryCode.toUpperCase();
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `INSERT INTO "user_eligibility" ("userId","adultVerified","paidCompetitionEligible","countryCode")
         VALUES ($1,$2,$3,$4)
         ON CONFLICT ("userId") DO UPDATE SET "adultVerified"=EXCLUDED."adultVerified",
           "paidCompetitionEligible"=EXCLUDED."paidCompetitionEligible","countryCode"=EXCLUDED."countryCode","updatedAt"=now()
         RETURNING "userId","adultVerified","paidCompetitionEligible","countryCode","updatedAt"`,
        [userId, input.adultVerified, input.paidCompetitionEligible, countryCode],
      ) as Array<Record<string, unknown>>;
      await manager.query(
        `INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId","metadata")
         VALUES ($1,'USER_ELIGIBILITY_UPDATED','user',$2,$3)`,
        [actorUserId, userId, JSON.stringify({ ...input, countryCode })],
      );
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
             CASE WHEN t."scoringMethod"='FARTHEST_DISTANCE' THEN LEAST(a."validatedDistanceMetres", COALESCE(t."distanceCapMetres", a."validatedDistanceMetres")) ELSE 0 END,
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
    const startsAt = new Date(input.startsAt);
    const entryClosesAt = new Date(input.entryClosesAt);
    const scoringClosesAt = new Date(input.scoringClosesAt);
    if (input.minimumEntrants > input.capacity || entryClosesAt > scoringClosesAt || startsAt > scoringClosesAt) {
      throw new ConflictException('Paid table dates or entrant limits are invalid');
    }
    const creator = (await this.dataSource.query(`SELECT "id" FROM "creator_profiles" WHERE "userId"=$1 AND "status"='ACTIVE'`, [input.creatorId]) as Array<{ id: string }>)[0];
    const table = await this.dataSource.getRepository(CompetitionTable).save(
      this.dataSource.getRepository(CompetitionTable).create({
        creatorId: input.creatorId, title: input.title.trim(), code: randomBytes(4).toString('hex').toUpperCase(),
        type: 'paid', status: 'PENDING_APPROVAL', entryFeeKobo: input.entryFeeKobo,
        guaranteedPrizeKobo: input.guaranteedPrizeKobo, minimumEntrants: input.minimumEntrants,
        capacity: input.capacity, startsAt, entryClosesAt, scoringClosesAt, distanceCapMetres: null,
        challengeType: input.challengeType, scoringMethod: input.scoringMethod,
        targetDistanceMetres: input.targetDistanceMetres ?? null, communityId: input.communityId ?? null,
        platformFeeBps: creator ? 3500 : 3000, creatorCommissionBps: creator ? 500 : 0,
      }),
    );
    await this.dataSource.query(`INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId") VALUES ($1,'PAID_TABLE_DRAFT_CREATED','competition_table',$2)`, [actorUserId, table.id]);
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
      if (!table) throw new NotFoundException('Paid table not found');
      if (table.status !== 'PENDING_APPROVAL') throw new ConflictException('Table is not pending approval');
      table.status = 'OPEN_FOR_ENTRY';
      await manager.save(table);
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
      if (!table) throw new NotFoundException('Table not found');
      if (!table.scoringClosesAt || table.scoringClosesAt > new Date()) {
        throw new ConflictException('Scoring has not closed');
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
         FROM "table_registrations" r WHERE r."tableId" = $1 AND ($2 <> 'paid' OR r."userId" <> $3)
         ORDER BY ${metric}, r."joinedAt" ASC, r."userId" ASC`,
        [tableId, table.type, table.creatorId],
      )) as Array<{ userId: string; creditedDistanceMetres: number; creditedSteps: number; completionTimeSeconds: number | null; joinedAt: Date; rank: number }>;
      const winner = ['FASTEST_FIXED_DISTANCE', 'FASTEST_TIME'].includes(table.scoringMethod) && standings[0]?.completionTimeSeconds === null
        ? undefined
        : standings[0];
      if (table.type === 'paid' && standings.length < table.minimumEntrants) {
        throw new ConflictException('Minimum entrants were not met; cancel and refund the table');
      }
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
      if (table.type === 'paid' && winner && table.guaranteedPrizeKobo) {
        const { platformFeeKobo, creatorCommissionKobo, winnerAmountKobo } = calculatePrizeBreakdown(
          table.guaranteedPrizeKobo,
          table.platformFeeBps,
          table.creatorCommissionBps,
        );
        await manager.query(
          `INSERT INTO "prize_awards" ("tableId","winnerUserId","grossPrizeKobo","amountKobo","platformFeeKobo","creatorCommissionKobo","currency")
           VALUES ($1,$2,$3,$4,$5,$6,'NGN') ON CONFLICT ("tableId") DO NOTHING`,
          [tableId, winner.userId, table.guaranteedPrizeKobo, winnerAmountKobo, platformFeeKobo, creatorCommissionKobo],
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
