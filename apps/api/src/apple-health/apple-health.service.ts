import { STRIDE_METRES } from '../running/track';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { ACTIVITY_VERIFICATION_QUEUE } from '../jobs/jobs.module';
import { alreadyImported, saveImportedActivity } from '../running/import-activity';
import { stravaStepTotals } from '../strava/strava-steps';
import { routeMetres, spreadSteps } from './apple-health-steps';
import { AppleHealthLink } from './apple-health-link.entity';
import { AppleHealthWorkoutDto, DailyStepsDto } from './apple-health.dto';
import { validZone } from '../notifications/engagement-policy';
import { refreshLeagueDistance } from '../leagues/league-credits';
import { HEALTH_ELIGIBLE, retotal, uncreditActivity } from '../tables/competition-credits';

const MAX_WORKOUT_SECONDS = 24 * 60 * 60;
const ROUTE_SLACK_SECONDS = 120;
const MAX_STEPS_PER_SECOND = 4;
const MAX_DAILY_STEPS = 100_000;
const MAX_DAYS_BACK = 40;
const POST_HOUR = 21;
const MIN_POSTED_STEPS = 500;
const MAX_DAILY_METRES = 150_000;

@Injectable()
export class AppleHealthService {
  constructor(
    @InjectRepository(AppleHealthLink) private readonly links: Repository<AppleHealthLink>,
    private readonly dataSource: DataSource,
    @InjectQueue(ACTIVITY_VERIFICATION_QUEUE) private readonly verificationQueue: Queue,
  ) {}

  async status(userId: string) {
    const link = await this.links.findOne({ where: { userId } });
    if (!link) return { connected: false as const };
    return { connected: true as const, connectedAt: link.connectedAt, lastSyncedAt: link.lastSyncedAt, shareSteps: link.shareSteps };
  }

  async connect(userId: string) {
    await this.links.createQueryBuilder().insert().values({ userId }).orIgnore().execute();
    return this.status(userId);
  }

  async disconnect(userId: string) {
    await this.dataSource.transaction(async (manager) => {
      const imported = await manager.query(
        `SELECT "id", "runningSessionId", "activityType" FROM "activities" WHERE "userId" = $1 AND "source" = 'apple_health' FOR UPDATE`,
        [userId],
      ) as Array<{ id: string; runningSessionId: string; activityType: string }>;
      for (const activity of imported) {
        await uncreditActivity(manager, activity.id, { liveOnly: true });
        await manager.query(`DELETE FROM "table_activity_credits" WHERE "activityId" = $1`, [activity.id]);
      }
      if (imported.length) await manager.query(`DELETE FROM "running_sessions" WHERE "id" = ANY($1::uuid[])`, [imported.map((activity) => activity.runningSessionId)]);
      if (imported.some((activity) => activity.activityType !== 'cycle')) await refreshLeagueDistance(manager, userId);
      const days = await manager.query(`DELETE FROM "daily_steps" WHERE "userId" = $1 RETURNING "day"`, [userId]) as Array<{ day: string }>;
      if (days.length) {
        const tables = await manager.query(
          `SELECT t."id" FROM "table_registrations" r JOIN "competition_tables" t ON t."id" = r."tableId"
           WHERE r."userId" = $1 AND ${HEALTH_ELIGIBLE('t')} AND t."status" IN ('OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED')`,
          [userId],
        ) as Array<{ id: string }>;
        if (tables.length) await retotal(manager, tables.map((table) => table.id));
      }
      await manager.query(`DELETE FROM "feed_posts" WHERE "userId" = $1 AND "stepsDay" IS NOT NULL`, [userId]);
      await manager.query(`DELETE FROM "apple_health_links" WHERE "userId" = $1`, [userId]);
    });
    return { connected: false as const };
  }

  days(userId: string, limit: number) {
    return this.dataSource.query(
      `SELECT to_char("day", 'YYYY-MM-DD') AS "day", "steps", "distanceMetres", "updatedAt"
       FROM "daily_steps" WHERE "userId" = $1 ORDER BY "day" DESC LIMIT $2`,
      [userId, limit],
    ) as Promise<Array<{ day: string; steps: number; distanceMetres: number | null; updatedAt: Date }>>;
  }

  async synced(userId: string) {
    await this.links.update({ userId }, { lastSyncedAt: new Date() });
    return this.status(userId);
  }

  async settings(userId: string, shareSteps: boolean) {
    if (!(await this.links.exist({ where: { userId } }))) throw new BadRequestException('Connect Apple Health first');
    await this.links.update({ userId }, { shareSteps });
    if (!shareSteps) await this.dataSource.query(`DELETE FROM "feed_posts" WHERE "userId" = $1 AND "stepsDay" IS NOT NULL`, [userId]);
    return this.status(userId);
  }

  async postDailySteps() {
    const posted = await this.dataSource.query(
      `INSERT INTO "feed_posts" ("userId", "body", "stepsDay")
       SELECT l."userId", '', d."day"
       FROM "apple_health_links" l
       CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE COALESCE(l."timeZone", 'Africa/Lagos')) AS local) z
       JOIN "daily_steps" d ON d."userId" = l."userId"
         AND (d."day" = z.local::date - 1 OR (d."day" = z.local::date AND extract(hour FROM z.local) >= ${POST_HOUR}))
       WHERE l."shareSteps" AND d."steps" >= ${MIN_POSTED_STEPS} AND d."day" >= (l."connectedAt" AT TIME ZONE COALESCE(l."timeZone", 'Africa/Lagos'))::date
       ON CONFLICT ("userId", "stepsDay") WHERE "stepsDay" IS NOT NULL DO NOTHING
       RETURNING "id"`,
    ) as Array<{ id: string }>;
    return posted.length;
  }

  async saveDailySteps(userId: string, days: DailyStepsDto[], timeZone?: string) {
    if (!(await this.links.exist({ where: { userId } }))) throw new BadRequestException('Connect Apple Health first');
    if (timeZone && validZone(timeZone)) await this.links.update({ userId }, { timeZone });
    const today = Date.now();
    const valid = days.filter(({ day }) => {
      const time = Date.parse(`${day}T00:00:00Z`);
      return Number.isFinite(time) && time <= today + 86_400_000 && time >= today - MAX_DAYS_BACK * 86_400_000;
    });
    if (!valid.length) return { saved: 0 };
    const changed = await this.dataSource.query(
      `INSERT INTO "daily_steps" ("userId", "day", "steps", "distanceMetres", "countedSteps", "countedMetres")
       SELECT $1, x."day", s.steps, s.metres, LEAST(COALESCE(x."countedSteps", 0), s.steps),
              CASE WHEN s.metres IS NULL THEN round(LEAST(COALESCE(x."countedSteps", 0), s.steps) * ${STRIDE_METRES.walk})::integer
                   ELSE LEAST(COALESCE(x."countedMetres", 0), s.metres) END
       FROM jsonb_to_recordset($2::jsonb) AS x("day" date, "steps" integer, "distanceMetres" integer, "countedSteps" integer, "countedMetres" integer)
       CROSS JOIN LATERAL (SELECT LEAST(x."steps", ${MAX_DAILY_STEPS}) AS steps,
                                  CASE WHEN x."distanceMetres" IS NULL THEN NULL ELSE LEAST(x."distanceMetres", ${MAX_DAILY_METRES}) END AS metres) s
       ON CONFLICT ("userId", "day") DO UPDATE SET "steps" = EXCLUDED."steps", "distanceMetres" = COALESCE(EXCLUDED."distanceMetres", "daily_steps"."distanceMetres"),
         "countedSteps" = EXCLUDED."countedSteps", "countedMetres" = EXCLUDED."countedMetres", "updatedAt" = now()
       WHERE ("daily_steps"."steps", "daily_steps"."distanceMetres", "daily_steps"."countedSteps", "daily_steps"."countedMetres")
         IS DISTINCT FROM (EXCLUDED."steps", COALESCE(EXCLUDED."distanceMetres", "daily_steps"."distanceMetres"), EXCLUDED."countedSteps", EXCLUDED."countedMetres")
       RETURNING "day"`,
      [userId, JSON.stringify(valid)],
    ) as Array<{ day: string }>;
    if (changed.length) {
      const tables = await this.dataSource.query(
        `SELECT t."id" FROM "table_registrations" r JOIN "competition_tables" t ON t."id" = r."tableId"
         WHERE r."userId" = $1 AND ${HEALTH_ELIGIBLE('t')} AND t."status" IN ('OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED')`,
        [userId],
      ) as Array<{ id: string }>;
      if (tables.length) await this.dataSource.transaction((manager) => retotal(manager, tables.map((table) => table.id)));
    }
    return { saved: changed.length };
  }

  async importWorkout(userId: string, workout: AppleHealthWorkoutDto) {
    if (!(await this.links.exist({ where: { userId } }))) throw new BadRequestException('Connect Apple Health first');
    return { imported: await this.save(userId, workout) };
  }

  private async save(userId: string, workout: AppleHealthWorkoutDto) {
    const startedAt = new Date(workout.startedAt);
    const finishedAt = new Date(workout.finishedAt);
    const elapsedSeconds = Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000);
    if (elapsedSeconds <= 0 || elapsedSeconds > MAX_WORKOUT_SECONDS || finishedAt.getTime() > Date.now() + 60_000) return false;

    const route = workout.route
      .filter((point) => Array.isArray(point) && point.length === 3 && point.every((value) => typeof value === 'number' && Number.isFinite(value)))
      .filter(([latitude, longitude, offset]) => Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && offset >= -ROUTE_SLACK_SECONDS && offset <= elapsedSeconds + ROUTE_SLACK_SECONDS)
      .sort((a, b) => a[2] - b[2]);
    if (route.length < 2) return false;

    const externalId = `ah:${workout.id.toLowerCase()}`;
    if (await alreadyImported(this.dataSource, userId, externalId, startedAt, finishedAt)) return false;

    const points = route.map(([latitude, longitude]) => [latitude, longitude] as [number, number]);
    const distanceMetres = workout.distanceMetres >= 1 ? workout.distanceMetres : routeMetres(points);
    const offsets = route.map(([, , offset]) => Math.max(0, offset));
    const sensorSteps = workout.activityType === 'cycle' || !workout.steps ? null : Math.min(workout.steps, elapsedSeconds * MAX_STEPS_PER_SECOND);
    const stepTotals = sensorSteps ? spreadSteps(points, sensorSteps) : stravaStepTotals(workout.activityType, offsets, points);

    const activity = await saveImportedActivity(this.dataSource, {
      userId,
      activityType: workout.activityType,
      source: 'apple_health',
      externalId,
      startedAt,
      finishedAt,
      distanceMetres,
      elapsedSeconds,
      movingSeconds: elapsedSeconds,
      elevationGainMetres: workout.elevationGainMetres == null ? null : Math.round(workout.elevationGainMetres),
      recordedSteps: stepTotals?.at(-1) ?? 0,
      stepsSource: stepTotals ? (sensorSteps ? 'sensor' : 'estimate') : null,
      points: route.map(([latitude, longitude, offset], index) => ({
        latitude,
        longitude,
        stepCount: stepTotals?.[index] ?? null,
        recordedAt: new Date(startedAt.getTime() + offset * 1000),
      })),
    });
    await this.verificationQueue.add(
      'verify-activity',
      { activityId: activity.id },
      { jobId: `activity-${activity.id}`, attempts: 5, backoff: { type: 'exponential', delay: 1_000 } },
    );
    return true;
  }
}
