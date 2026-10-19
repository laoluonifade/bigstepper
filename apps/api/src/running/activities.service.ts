import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { refreshLeagueDistance } from '../leagues/league-credits';
import { RunningSession } from './running-session.entity';
import { ActivityVerificationReview } from './activity-verification-review.entity';
import { Activity } from './activity.entity';

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @InjectRepository(ActivityVerificationReview)
    private readonly reviews: Repository<ActivityVerificationReview>,
  ) {}

  list(userId: string) {
    return this.activities.find({ where: { userId }, order: { startedAt: 'DESC' }, take: 100 });
  }

  /**
   * Deletes one of the runner's own activities and takes its distance back out of free challenges
   * that are still running and of their league. Blocked when it counted toward a paid challenge or
   * one that has finished, because those results can't change afterwards.
   */
  async remove(userId: string, activityId: string) {
    return this.activities.manager.transaction(async (manager) => {
      const activity = await manager.findOne(Activity, { where: { id: activityId, userId }, lock: { mode: 'pessimistic_write' } });
      if (!activity) throw new NotFoundException('Activity not found');
      const locked = (await manager.query(
        `SELECT t."title" FROM "table_activity_credits" c JOIN "competition_tables" t ON t."id" = c."tableId"
         WHERE c."activityId" = $1 AND (t."type" <> 'free' OR t."status" NOT IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED'))
         LIMIT 1`,
        [activityId],
      )) as Array<{ title: string }>;
      if (locked[0]) {
        throw new ConflictException(`This activity counts toward “${locked[0].title}”, which is paid or has finished, so it can’t be deleted.`);
      }
      const credited = (await manager.query(
        `DELETE FROM "table_activity_credits" WHERE "activityId" = $1 RETURNING "registrationId"`,
        [activityId],
      )) as Array<{ registrationId: string }>;
      const registrationIds = [...new Set(credited.map((row) => row.registrationId))];
      if (registrationIds.length) {
        await manager.query(
          `UPDATE "table_registrations" r
           SET "creditedDistanceMetres" = totals.distance, "creditedSteps" = totals.steps, "completionTimeSeconds" = totals.best_time
           FROM (
             SELECT r2."id", COALESCE(SUM(c."creditedDistanceMetres"), 0)::integer distance,
                    COALESCE(SUM(c."creditedSteps"), 0)::integer steps, MIN(c."completionTimeSeconds")::integer best_time
             FROM "table_registrations" r2 LEFT JOIN "table_activity_credits" c ON c."registrationId" = r2."id"
             WHERE r2."id" = ANY($1::uuid[]) GROUP BY r2."id"
           ) totals
           WHERE r."id" = totals."id"`,
          [registrationIds],
        );
      }
      // Removing the session removes the activity, its GPS fixes and any review request with it.
      await manager.delete(RunningSession, { id: activity.runningSessionId });
      await refreshLeagueDistance(manager, userId);
      return { deleted: true };
    });
  }

  async get(userId: string, activityId: string) {
    const activity = await this.activities.findOne({ where: { id: activityId, userId } });
    if (!activity) throw new NotFoundException('Activity not found');
    return activity;
  }

  async requestReview(userId: string, activityId: string, reason: string) {
    const activity = await this.get(userId, activityId);
    if (activity.verificationStatus === 'PENDING_VERIFICATION') {
      throw new ConflictException('Verification is still in progress');
    }
    try {
      return await this.reviews.save(
        this.reviews.create({ activityId, requestedByUserId: userId, reason: reason.trim(), status: 'PENDING' }),
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505'
      ) {
        throw new ConflictException('A review is already pending');
      }
      throw error;
    }
  }
}
