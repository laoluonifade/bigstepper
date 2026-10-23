import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { refreshLeagueDistance } from '../leagues/league-credits';
import { uncreditActivity } from '../tables/competition-credits';
import { GpsSample } from './gps-sample.entity';
import { RunningSession } from './running-session.entity';
import { MAX_USABLE_ACCURACY_METRES, smoothTrack } from './track';
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

  async calendar(userId: string, month?: string, timeZone = 'UTC') {
    const selected = month ?? new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)) throw new BadRequestException('Month must be YYYY-MM');
    try { new Intl.DateTimeFormat('en', { timeZone }); }
    catch { throw new BadRequestException('Invalid time zone'); }
    return this.activities.query(
      `SELECT (a."startedAt" AT TIME ZONE $3)::date::text AS day,
              COUNT(*)::integer AS "activities",
              COALESCE(SUM(a."validatedSteps") FILTER (WHERE a."verificationStatus"='VERIFIED'), 0)::integer AS steps,
              COALESCE(SUM(GREATEST(a."validatedDistanceMetres", a."stepDistanceMetres")) FILTER (WHERE a."verificationStatus"='VERIFIED'), 0)::bigint AS "distanceMetres"
       FROM "activities" a
       -- Every day you moved is marked, even before verification finishes; totals stay verified-only.
       WHERE a."userId"=$1 AND a."verificationStatus"<>'REJECTED'
         AND (a."startedAt" AT TIME ZONE $3)::date >= ($2 || '-01')::date
         AND (a."startedAt" AT TIME ZONE $3)::date < (($2 || '-01')::date + INTERVAL '1 month')
       GROUP BY day ORDER BY day`,
      [userId, selected, timeZone],
    );
  }

  async credits(userId: string, activityId: string) {
    await this.get(userId, activityId);
    return this.activities.query(
      `SELECT t."code", t."title", t."challengeType", t."scoringMethod", c."creditedDistanceMetres", c."creditedSteps", c."completionTimeSeconds"
       FROM "table_activity_credits" c JOIN "competition_tables" t ON t."id"=c."tableId"
       WHERE c."activityId"=$1 ORDER BY t."title"`, [activityId],
    );
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
      await uncreditActivity(manager, activityId);
      // Removing the session removes the activity, its GPS fixes and any review request with it.
      await manager.delete(RunningSession, { id: activity.runningSessionId });
      if (activity.activityType !== 'cycle') await refreshLeagueDistance(manager, userId);
      return { deleted: true };
    });
  }

  async track(userId: string, activityId: string) {
    const activity = await this.get(userId, activityId);
    const samples = await this.activities.manager.find(GpsSample, {
      where: { sessionId: activity.runningSessionId },
      order: { sequence: 'ASC' },
    });
    const usable = samples
      .filter((sample) => sample.accuracy === null || sample.accuracy <= MAX_USABLE_ACCURACY_METRES)
      .filter((sample, index, all) => index === 0 || sample.recordedAt.getTime() > all[index - 1].recordedAt.getTime());
    const smoothed = smoothTrack(usable);
    const step = Math.max(1, Math.ceil(smoothed.length / 400));
    const points = smoothed.filter((_, index) => index % step === 0 || index === smoothed.length - 1);
    return { points: points.map((point) => [Number(point.lat.toFixed(6)), Number(point.lon.toFixed(6))]) };
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
