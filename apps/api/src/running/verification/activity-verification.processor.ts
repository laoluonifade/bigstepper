import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { ACTIVITY_VERIFICATION_QUEUE } from '../../jobs/jobs.module';
import { Activity } from '../activity.entity';
import { GpsSample } from '../gps-sample.entity';
import { measureTrack } from '../track';
import { RunningSession } from '../running-session.entity';
import { refreshLeagueDistance } from '../../leagues/league-credits';

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
    const track = measureTrack(samples);
    const reasons = track.reasons;
    const validatedDistance = track.distanceMetres;
    const movingSeconds = track.movingSeconds;
    const confidence = track.confidence;

    // Steps come from the device pedometer; check they only ever go up at a human rate.
    let validatedSteps = 0;
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      const seconds = (current.recordedAt.getTime() - previous.recordedAt.getTime()) / 1000;
      if (seconds <= 0 || previous.stepCount === null || current.stepCount === null) continue;
      const addedSteps = current.stepCount - previous.stepCount;
      if (addedSteps < 0) reasons.add('NON_MONOTONIC_STEPS');
      else if (addedSteps / seconds > 5.5) reasons.add('IMPLAUSIBLE_STEP_RATE');
      else validatedSteps += addedSteps;
    }

    // Inaccurate fixes are simply not counted; only flag when most of the track was unusable.
    const status = track.usableCount >= 2
      && !reasons.has('IMPLAUSIBLE_SPEED')
      && !reasons.has('NON_MONOTONIC_STEPS')
      && !reasons.has('IMPLAUSIBLE_STEP_RATE')
      && confidence >= 0.5 ? 'VERIFIED' : 'FLAGGED';

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
        await refreshLeagueDistance(manager, activity.userId);
      }
    });
    this.logger.log(`Activity ${activity.id} processed as ${status}`);
  }
}
