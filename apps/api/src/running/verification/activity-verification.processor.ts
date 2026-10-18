import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { ACTIVITY_VERIFICATION_QUEUE } from '../../jobs/jobs.module';
import { Activity } from '../activity.entity';
import { GpsSample } from '../gps-sample.entity';
import { haversineMetres } from '../haversine';
import { RunningSession } from '../running-session.entity';

interface VerificationJob {
  activityId: string;
}

@Injectable()
@Processor(ACTIVITY_VERIFICATION_QUEUE)
export class ActivityVerificationProcessor extends WorkerHost {
  private readonly logger = new Logger(ActivityVerificationProcessor.name);

  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async process(job: Job<VerificationJob>): Promise<void> {
    if (job.name !== 'verify-activity') return;
    const activity = await this.dataSource.getRepository(Activity).findOne({ where: { id: job.data.activityId } });
    if (!activity || activity.verificationStatus !== 'PENDING_VERIFICATION') return;

    const samples = await this.dataSource.getRepository(GpsSample).find({
      where: { sessionId: activity.runningSessionId },
      order: { sequence: 'ASC' },
    });
    const reasons = new Set<string>();
    const accepted = samples.filter((sample) => {
      if (sample.accuracy !== null && sample.accuracy > 50) {
        reasons.add('LOW_GPS_ACCURACY');
        return false;
      }
      return true;
    });

    let validatedDistance = 0;
    let movingSeconds = 0;
    let validatedSteps = 0;
    for (let index = 1; index < accepted.length; index += 1) {
      const previous = accepted[index - 1];
      const current = accepted[index];
      const seconds = (current.recordedAt.getTime() - previous.recordedAt.getTime()) / 1000;
      if (seconds <= 0) {
        reasons.add('NON_MONOTONIC_TIME');
        continue;
      }
      if (seconds > 120) reasons.add('GPS_GAP');
      const distance = haversineMetres(previous.latitude, previous.longitude, current.latitude, current.longitude);
      if (distance / seconds > 8) {
        reasons.add('IMPLAUSIBLE_SPEED');
        continue;
      }
      validatedDistance += distance;
      if (distance / seconds >= 0.5) movingSeconds += Math.round(seconds);
      const previousSteps = previous.stepCount;
      const currentSteps = current.stepCount;
      if (previousSteps !== null && currentSteps !== null) {
        const addedSteps = currentSteps - previousSteps;
        if (addedSteps < 0) reasons.add('NON_MONOTONIC_STEPS');
        else if (addedSteps / seconds > 5.5) reasons.add('IMPLAUSIBLE_STEP_RATE');
        else validatedSteps += addedSteps;
      }
    }

    if (accepted.length < 2) reasons.add('INSUFFICIENT_GPS_DATA');
    const confidence = samples.length === 0 ? 0 : accepted.length / samples.length;
    const status = accepted.length >= 2
      && !reasons.has('IMPLAUSIBLE_SPEED')
      && !reasons.has('NON_MONOTONIC_STEPS')
      && !reasons.has('IMPLAUSIBLE_STEP_RATE')
      && confidence >= 0.7 ? 'VERIFIED' : 'FLAGGED';

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        Activity,
        { id: activity.id, verificationStatus: 'PENDING_VERIFICATION' },
        {
          verificationStatus: status,
          validatedDistanceMetres: Math.round(validatedDistance),
          validatedSteps,
          movingSeconds,
          gpsConfidence: confidence,
          verificationReasons: [...reasons],
        },
      );
      await manager.update(RunningSession, { id: activity.runningSessionId }, { status });

      if (status === 'VERIFIED') {
        await manager.query(
          `INSERT INTO "table_activity_credits" ("tableId", "registrationId", "activityId", "creditedDistanceMetres", "creditedSteps", "completionTimeSeconds")
           SELECT t."id", r."id", a."id",
             CASE WHEN t."scoringMethod"='FARTHEST_DISTANCE' THEN LEAST(a."validatedDistanceMetres", COALESCE(t."distanceCapMetres", a."validatedDistanceMetres")) ELSE 0 END,
             CASE WHEN t."scoringMethod"='MOST_STEPS' THEN a."validatedSteps" ELSE 0 END,
             CASE WHEN t."scoringMethod" IN ('FASTEST_FIXED_DISTANCE','FASTEST_TIME') AND a."validatedDistanceMetres">=t."targetDistanceMetres" THEN a."movingSeconds" ELSE NULL END
           FROM "activities" a
           JOIN "table_registrations" r ON r."userId" = a."userId" AND r."joinedAt" <= a."startedAt"
           JOIN "competition_tables" t ON t."id" = r."tableId"
           WHERE a."id" = $1
             AND t."status" IN ('OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED')
             AND (t."challengeType" IN ('DISTANCE','STEP','TIMED') OR (t."challengeType"='WALK' AND a."activityType"='walk') OR (t."challengeType"='RUN' AND a."activityType"='run'))
             AND a."startedAt" >= COALESCE(t."startsAt", '-infinity'::timestamptz)
             AND a."finishedAt" <= COALESCE(t."scoringClosesAt", 'infinity'::timestamptz)
           ON CONFLICT ("tableId", "activityId") DO NOTHING`,
          [activity.id],
        );
        await manager.query(
          `UPDATE "table_registrations" r
           SET "creditedDistanceMetres" = totals.distance,
               "creditedSteps" = totals.steps,
               "completionTimeSeconds" = totals.best_time
           FROM (
             SELECT c."registrationId", SUM(c."creditedDistanceMetres")::integer AS distance,
                    SUM(c."creditedSteps")::integer AS steps, MIN(c."completionTimeSeconds")::integer AS best_time
             FROM "table_activity_credits" c
             WHERE c."tableId" IN (SELECT "tableId" FROM "table_activity_credits" WHERE "activityId" = $1)
             GROUP BY c."registrationId"
           ) totals
           WHERE r."id" = totals."registrationId"`,
          [activity.id],
        );
      }
    });
    this.logger.log(`Activity ${activity.id} processed as ${status}`);
  }
}
