import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { ACTIVITY_VERIFICATION_QUEUE } from '../../jobs/jobs.module';
import { Activity } from '../activity.entity';
import { GpsSample } from '../gps-sample.entity';
import { measureTrack, type TrackMeasure } from '../track';
import { RunningSession } from '../running-session.entity';
import { refreshLeagueDistance } from '../../leagues/league-credits';
import { creditActivities } from '../../tables/competition-credits';

/** Faster than any human cadence (a sprint is about 4 steps/s); shaking a phone usually is. */
const MAX_STEPS_PER_SECOND = 5.5;
/** The shortest believable stride (a slow shuffle); the GPS route caps steps at distance ÷ this. */
const MIN_STRIDE_METRES = 0.45;
/** Slack for GPS under-measuring a short or twisty route before extra steps look like shaking. */
const SHAKE_ALLOWANCE_STEPS = 150;
/** At least this share of fixes must be accurate enough to use (cities and tall buildings knock some out). */
const MIN_GPS_CONFIDENCE = 0.35;

/**
 * Whether a recorded activity counts, and how many of its steps do.
 *
 * Like Strava, distance comes from GPS alone, and steps only count while the GPS shows you moving. A
 * phone shaken in a hand or a pocket counts steps at a perfectly human rate, so steps can't stand in for
 * distance; they're capped at what the route allows (no stride is shorter than about 0.45 m, so 20 m of
 * GPS can't carry 3,000 steps), and far more steps than that is shaking, which flags the activity.
 */
export function judgeActivity(
  track: Pick<TrackMeasure, 'distanceMetres' | 'confidence' | 'usableCount' | 'reasons'>,
  samples: Array<Pick<GpsSample, 'stepCount' | 'recordedAt'>>,
  activityType: 'walk' | 'run' | 'cycle',
) {
  const reasons = new Set(track.reasons);
  // Steps come from the phone's motion sensors. They're a bonus that's capped by the distance, never a
  // way to gain, so step quirks are handled, not held against the activity:
  // - a count that goes down (the counter restarted after a pause or an app restart) just carries on;
  // - a burst the phone held back while in the background is judged over the time since the count last
  //   moved, not the second it arrived in, and anything truly faster than a human is left out;
  // - more steps than the distance allows are simply capped below.
  let steps = 0;
  const counted = samples.filter((sample) => sample.stepCount !== null);
  let ref = counted[0];
  for (let index = 1; index < counted.length; index += 1) {
    const current = counted[index];
    const addedSteps = current.stepCount! - ref.stepCount!;
    if (addedSteps < 0) { ref = current; continue; }
    if (addedSteps === 0) continue; // nothing new: keep timing from when it last moved
    const seconds = (current.recordedAt.getTime() - ref.recordedAt.getTime()) / 1000;
    const last = index === counted.length - 1;
    if (seconds < 2 && !last) continue;
    if (seconds >= 2 && addedSteps / seconds > MAX_STEPS_PER_SECOND) reasons.add('IMPLAUSIBLE_STEP_RATE');
    else steps += addedSteps;
    ref = current;
  }

  const cycling = activityType === 'cycle';
  const gpsOk = track.usableCount >= 2 && track.confidence >= MIN_GPS_CONFIDENCE && track.distanceMetres > 0;
  if (!gpsOk) reasons.add('NO_GPS_MOVEMENT');
  const stepCap = Math.ceil(track.distanceMetres / MIN_STRIDE_METRES);
  if (!cycling && steps > Math.max(stepCap * 2, stepCap + SHAKE_ALLOWANCE_STEPS)) reasons.add('STEPS_WITHOUT_MOVEMENT');
  // Only travel no person could do on foot (or a bike) for a sustained stretch is held against it.
  const tampered = reasons.has('IMPLAUSIBLE_SPEED');
  return {
    status: !tampered && gpsOk ? 'VERIFIED' as const : 'FLAGGED' as const,
    validatedSteps: cycling ? 0 : Math.min(steps, stepCap),
    reasons,
  };
}

interface VerificationJob {
  activityId: string;
  /** A re-check of an already-flagged activity after the rules changed: only good news is announced. */
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
    const cycling = activity.activityType === 'cycle';
    // Steps still count as steps; they no longer turn into distance.
    const stepDistance = 0;

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        Activity,
        { id: activity.id, verificationStatus: 'PENDING_VERIFICATION' },
        {
          verificationStatus: status,
          validatedDistanceMetres: Math.round(validatedDistance),
          validatedSteps,
          // Strava imports say at import whether steps came from cadence; Jump's come from the motion sensor.
          stepsSource: activity.stepsSource ?? (validatedSteps > 0 ? 'sensor' : null),
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
      // A re-check that passes also settles any review the runner asked for.
      if (job.data.recheck && status === 'VERIFIED') {
        await manager.query(`UPDATE "activity_verification_reviews" SET "status"='APPROVED' WHERE "activityId"=$1 AND "status"='PENDING'`, [activity.id]);
      }
      if (!(job.data.recheck && status !== 'VERIFIED')) await manager.query(
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
