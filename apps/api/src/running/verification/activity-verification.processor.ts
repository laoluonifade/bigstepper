import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { ACTIVITY_VERIFICATION_QUEUE } from '../../jobs/jobs.module';
import { Activity } from '../activity.entity';
import { GpsSample } from '../gps-sample.entity';
import { measureTrack, stepDistanceMetres } from '../track';
import { RunningSession } from '../running-session.entity';
import { refreshLeagueDistance } from '../../leagues/league-credits';
import { creditActivities } from '../../tables/competition-credits';

/** Faster than any human cadence (a sprint is about 4 steps/s); shaking a phone usually is. */
const MAX_STEPS_PER_SECOND = 5.5;

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
    const track = measureTrack(samples, { activityType: activity.activityType });
    const reasons = track.reasons;
    const validatedDistance = track.distanceMetres;
    const movingSeconds = track.movingSeconds;
    const confidence = track.confidence;

    // Steps come from the phone's motion sensors; check they only ever go up, at a human rate. The rate
    // is judged over windows of at least 2 s, so a step total saved just after a GPS fix isn't misread.
    let validatedSteps = 0;
    const counted = samples.filter((sample) => sample.stepCount !== null);
    let ref = counted[0];
    for (let index = 1; index < counted.length; index += 1) {
      const current = counted[index];
      const addedSteps = current.stepCount! - ref.stepCount!;
      if (addedSteps < 0) {
        reasons.add('NON_MONOTONIC_STEPS');
        ref = current;
        continue;
      }
      const seconds = (current.recordedAt.getTime() - ref.recordedAt.getTime()) / 1000;
      const last = index === counted.length - 1;
      if (seconds < 2 && !last) continue;
      if (seconds >= 2 && addedSteps / seconds > MAX_STEPS_PER_SECOND) reasons.add('IMPLAUSIBLE_STEP_RATE');
      else validatedSteps += addedSteps;
      ref = current;
    }

    // Verified by GPS, or (indoors, where GPS sees nothing) by a believable step count. Any sign of
    // faking — car-speed travel, steps going backwards or impossibly fast — flags the activity.
    const tampered = reasons.has('IMPLAUSIBLE_SPEED') || reasons.has('NON_MONOTONIC_STEPS') || reasons.has('IMPLAUSIBLE_STEP_RATE');
    const gpsOk = track.usableCount >= 2 && confidence >= 0.5;
    const cycling = activity.activityType === 'cycle';
    const stepsOk = !cycling && validatedSteps > 0;
    const status = !tampered && (cycling ? gpsOk && validatedDistance > 0 : gpsOk || stepsOk) ? 'VERIFIED' : 'FLAGGED';
    if (cycling) validatedSteps = 0;
    const stepDistance = stepDistanceMetres(validatedSteps, activity.activityType);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        Activity,
        { id: activity.id, verificationStatus: 'PENDING_VERIFICATION' },
        {
          verificationStatus: status,
          validatedDistanceMetres: Math.round(validatedDistance),
          validatedSteps,
          stepDistanceMetres: stepDistance,
          movingSeconds,
          gpsConfidence: confidence,
          verificationReasons: [...reasons],
        },
      );
      await manager.update(RunningSession, { id: activity.runningSessionId }, { status });

      if (status === 'VERIFIED') {
        await creditActivities(manager, { activityId: activity.id });
        if (!cycling) await refreshLeagueDistance(manager, activity.userId);
        await manager.query(
          `INSERT INTO "notifications" ("userId","type","title","body","link")
           SELECT $2,'LEADERBOARD_UPDATE','Your standings updated',
                  'Your verified ' || $3 || ' now counts in ' || t."title" || '.', '/competitions/' || t."code"
           FROM "table_activity_credits" c JOIN "competition_tables" t ON t."id"=c."tableId"
           WHERE c."activityId"=$1`, [activity.id, activity.userId, activity.activityType],
        );
      }
      await manager.query(
        `INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,$2,$3,$4,$5)`,
        [activity.userId, status === 'VERIFIED' ? 'ACTIVITY_VERIFIED' : 'ACTIVITY_REVIEW',
          status === 'VERIFIED' ? `Your ${activity.activityType} is verified` : `Your ${activity.activityType} needs review`,
          status === 'VERIFIED' ? 'Your distance and steps are checked. Open Jump to see your progress.' : 'Open Jump to see what needs attention.',
          `/activities/${activity.id}`],
      );
    });
    this.logger.log(`Activity ${activity.id} processed as ${status}`);
  }
}
