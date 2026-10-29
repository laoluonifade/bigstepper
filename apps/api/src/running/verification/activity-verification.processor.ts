import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { ACTIVITY_VERIFICATION_QUEUE } from '../../jobs/jobs.module';
import { Activity } from '../activity.entity';
import { GpsSample } from '../gps-sample.entity';
import { measureTrack, type TrackMeasure } from '../track';
import { RunningSession } from '../running-session.entity';
import { countActivity } from '../count-activity';

const MAX_STEPS_PER_SECOND = 5.5;
const MIN_STRIDE_METRES = 0.45;
const SHAKE_ALLOWANCE_STEPS = 150;
const MIN_MOVED_METRES = 5;
const FLAG_FOR_ADMIN = new Set(['NO_GPS_MOVEMENT']);

export function judgeActivity(
  track: Pick<TrackMeasure, 'distanceMetres' | 'confidence' | 'usableCount' | 'reasons'>,
  samples: Array<Pick<GpsSample, 'stepCount' | 'recordedAt'>>,
  activityType: 'walk' | 'run' | 'cycle',
) {
  const reasons = new Set(track.reasons);
  let steps = 0;
  const counted = samples.filter((sample) => sample.stepCount !== null);
  let ref = counted[0];
  for (let index = 1; index < counted.length; index += 1) {
    const current = counted[index];
    const addedSteps = current.stepCount! - ref.stepCount!;
    if (addedSteps < 0) { ref = current; continue; }
    if (addedSteps === 0) continue;
    const seconds = (current.recordedAt.getTime() - ref.recordedAt.getTime()) / 1000;
    const last = index === counted.length - 1;
    if (seconds < 2 && !last) continue;
    if (seconds >= 2 && addedSteps / seconds > MAX_STEPS_PER_SECOND) reasons.add('IMPLAUSIBLE_STEP_RATE');
    else steps += addedSteps;
    ref = current;
  }

  const cycling = activityType === 'cycle';
  if (track.distanceMetres < MIN_MOVED_METRES) reasons.add('NO_GPS_MOVEMENT');
  const stepCap = Math.ceil(track.distanceMetres / MIN_STRIDE_METRES);
  if (!cycling && steps > Math.max(stepCap * 2, stepCap + SHAKE_ALLOWANCE_STEPS)) reasons.add('STEPS_WITHOUT_MOVEMENT');
  return {
    status: [...reasons].some((reason) => FLAG_FOR_ADMIN.has(reason)) ? 'FLAGGED' as const : 'VERIFIED' as const,
    validatedSteps: cycling ? 0 : Math.min(steps, stepCap),
    reasons,
  };
}

interface VerificationJob {
  activityId: string;
  recheck?: boolean;
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
    const { status, validatedSteps, reasons } = judgeActivity(track, samples, activity.activityType);
    const validatedDistance = track.distanceMetres;
    const movingSeconds = track.movingSeconds;
    const confidence = track.confidence;
    const stepDistance = 0;

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        Activity,
        { id: activity.id, verificationStatus: 'PENDING_VERIFICATION' },
        {
          verificationStatus: status,
          validatedDistanceMetres: Math.round(validatedDistance),
          validatedSteps,
          stepsSource: activity.stepsSource ?? (validatedSteps > 0 ? 'sensor' : null),
          stepDistanceMetres: stepDistance,
          movingSeconds,
          gpsConfidence: confidence,
          verificationReasons: [...reasons],
        },
      );
      await manager.update(RunningSession, { id: activity.runningSessionId }, { status });

      await countActivity(manager, activity);
      if (job.data.recheck && status === 'VERIFIED') {
        await manager.query(`UPDATE "activity_verification_reviews" SET "status"='APPROVED' WHERE "activityId"=$1 AND "status"='PENDING'`, [activity.id]);
      }
    });
    this.logger.log(`Activity ${activity.id} processed as ${status}`);
  }
}
