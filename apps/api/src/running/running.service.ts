import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { GpsSampleDto } from './dto/add-samples.dto';
import { GpsSample } from './gps-sample.entity';
import { measureTrack } from './track';
import { RunningSession } from './running-session.entity';
import { Activity } from './activity.entity';
import { ACTIVITY_VERIFICATION_QUEUE } from '../jobs/jobs.module';
import { announceCounted, countActivity } from './count-activity';
import { gpsPoints, runEvents } from '../metrics/metrics';

export function momentOf(at: string | undefined, floor: Date, now = new Date()) {
  if (!at) return now;
  const moment = new Date(at);
  if (Number.isNaN(moment.getTime())) return now;
  const earliest = Math.max(floor.getTime(), now.getTime() - 24 * 60 * 60 * 1000);
  return new Date(Math.min(now.getTime(), Math.max(earliest, moment.getTime())));
}

const MIN_SAVED_METRES = 5;
const MIN_SAVED_STEPS = 10;
const LATE_POINTS_WAIT_MS = 24 * 60 * 60 * 1000;
const VERIFY_JOB = { attempts: 5, backoff: { type: 'exponential', delay: 1_000 } } as const;

@Injectable()
export class RunningService {
  constructor(
    @InjectRepository(RunningSession)
    private readonly sessions: Repository<RunningSession>,
    private readonly dataSource: DataSource,
    @InjectQueue(ACTIVITY_VERIFICATION_QUEUE)
    private readonly verificationQueue: Queue,
  ) {}

  async start(userId: string, activityType: 'walk' | 'run' | 'cycle', phone: { id?: string; startedAt?: string } = {}) {
    if (phone.id) {
      const known = await this.sessions.findOne({ where: { id: phone.id } });
      if (known && known.userId === userId) return known;
      if (known) throw new ConflictException('That run ID is already taken');
    }
    const now = new Date();
    try {
      return await this.sessions.save(
        this.sessions.create({
          ...(phone.id ? { id: phone.id } : {}),
          userId, activityType, status: 'RUNNING', pausedAt: null,
          startedAt: momentOf(phone.startedAt, new Date(now.getTime() - 24 * 60 * 60 * 1000), now),
        }),
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505'
      ) {
        throw new ConflictException('You already have an active run');
      }
      throw error;
    }
  }

  async getActive(userId: string) {
    return this.sessions.findOne({
      where: { userId, status: In(['RUNNING', 'PAUSED']) },
      order: { createdAt: 'DESC' },
    });
  }

  async addSamples(userId: string, sessionId: string, input: GpsSampleDto[]) {
    gpsPoints.inc(input.length);
    return this.dataSource.transaction(async (manager) => {
      const session = await manager.findOne(RunningSession, {
        where: { id: sessionId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) throw new NotFoundException('Run session not found');
      const uploadingAfterFinish = session.status === 'PENDING_VERIFICATION' && session.expectedSamples !== null;
      if (session.status !== 'RUNNING' && session.status !== 'PAUSED' && !uploadingAfterFinish) {
        throw new BadRequestException('Samples can only be added while the run is active');
      }

      const taken = new Map((await manager.query(
        `SELECT "sequence", "recordedAt" FROM "gps_samples" WHERE "sessionId"=$1 AND "sequence"=ANY($2::integer[])`,
        [sessionId, input.map((sample) => sample.sequence)],
      ) as Array<{ sequence: number; recordedAt: Date }>).map((row) => [row.sequence, new Date(row.recordedAt).getTime()]));
      let next = taken.size ? Math.max(
        (await manager.query(`SELECT COALESCE(MAX("sequence"),0)::integer AS "max" FROM "gps_samples" WHERE "sessionId"=$1`, [sessionId]) as Array<{ max: number }>)[0].max,
        ...input.map((sample) => sample.sequence),
      ) : 0;
      const sequenceOf = (sample: GpsSampleDto) => {
        const at = taken.get(sample.sequence);
        return at === undefined || at === new Date(sample.recordedAt).getTime() ? sample.sequence : (next += 1);
      };

      await manager
        .createQueryBuilder()
        .insert()
        .into(GpsSample)
        .values(
          input.map((sample) => ({
            sessionId,
            sequence: sequenceOf(sample),
            latitude: sample.latitude,
            longitude: sample.longitude,
            accuracy: sample.accuracy,
            stepCount: sample.stepCount,
            recordedAt: new Date(sample.recordedAt),
          })),
        )
        .orIgnore()
        .execute();

      const all = await manager.find(GpsSample, {
        where: { sessionId },
        order: { sequence: 'ASC' },
      });
      session.distanceMetres = measureTrack(all, { activityType: session.activityType }).distanceMetres;
      session.stepCount = session.activityType === 'cycle' ? 0 : Math.max(0, ...all.map((sample) => sample.stepCount ?? 0));
      await manager.save(session);
      const complete = uploadingAfterFinish && all.length >= session.expectedSamples!;
      return { distanceMetres: session.distanceMetres, stepCount: session.stepCount, sampleCount: all.length, complete };
    }).then(async ({ complete, ...result }) => {
      if (complete) {
        runEvents.inc({ event: 'uploaded_after_finish' });
        await this.verifyNow(sessionId);
      }
      return result;
    });
  }

  private async verifyNow(sessionId: string) {
    const activity = await this.dataSource.getRepository(Activity).findOne({ where: { runningSessionId: sessionId } });
    if (activity?.verificationStatus === 'PENDING_VERIFICATION') {
      await this.verificationQueue.add('verify-activity', { activityId: activity.id }, { jobId: `activity-${activity.id}`, ...VERIFY_JOB });
    }
  }

  async discard(userId: string, sessionId: string) {
    return this.dataSource.transaction(async (manager) => {
      const session = await manager.findOne(RunningSession, { where: { id: sessionId, userId }, lock: { mode: 'pessimistic_write' } });
      if (!session) throw new NotFoundException('Run session not found');
      if (session.status !== 'RUNNING' && session.status !== 'PAUSED') {
        throw new ConflictException('This run is already finished. Delete it from your activities instead.');
      }
      await manager.delete(RunningSession, { id: session.id });
      return { discarded: true };
    });
  }

  async finish(userId: string, sessionId: string, at?: string, sampleCount?: number, phone: { distanceMetres?: number; steps?: number; deferred?: boolean } = {}) {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const session = await manager.findOne(RunningSession, {
        where: { id: sessionId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) throw new NotFoundException('Run session not found');

      const existing = await manager.findOne(Activity, { where: { runningSessionId: sessionId } });
      if (existing) return { activity: existing, waiting: false };
      if (!['RUNNING', 'PAUSED'].includes(session.status)) {
        throw new BadRequestException('This run cannot be finished');
      }

      let waiting = false;
      if (sampleCount !== undefined) {
        const received = await manager.count(GpsSample, { where: { sessionId } });
        const short = received < sampleCount;
        if (short && !phone.deferred && !session.finishRequestedAt) {
          session.finishRequestedAt = new Date();
          await manager.save(session);
          return { retry: { received, sampleCount } };
        }
        waiting = short && Boolean(phone.deferred);
        const measured = phone.distanceMetres ?? session.distanceMetres;
        const walkedSteps = session.activityType !== 'cycle' && (phone.steps ?? 0) >= MIN_SAVED_STEPS;
        if (phone.distanceMetres === undefined && measured < MIN_SAVED_METRES && !walkedSteps) {
          await manager.delete(RunningSession, { id: session.id });
          return { activity: null, waiting: false };
        }
        if (waiting) session.expectedSamples = sampleCount;
      }

      const finishedAt = momentOf(at, session.pausedAt ?? session.startedAt);
      if (session.status === 'PAUSED' && session.pausedAt) {
        session.pausedSeconds += Math.max(0, Math.floor((finishedAt.getTime() - session.pausedAt.getTime()) / 1000));
      }
      session.status = 'PENDING_VERIFICATION';
      session.finishedAt = finishedAt;
      session.pausedAt = null;
      await manager.save(session);

      const elapsedSeconds = Math.max(0, Math.floor((finishedAt.getTime() - session.startedAt.getTime()) / 1000));
      const saved = await manager.save(
          Activity,
          manager.create(Activity, {
            runningSessionId: session.id,
            userId,
            activityType: session.activityType,
            recordedDistanceMetres: phone.distanceMetres ?? session.distanceMetres,
            recordedSteps: session.activityType === 'cycle' ? 0 : phone.steps ?? session.stepCount,
            measuredOnPhone: phone.distanceMetres !== undefined,
            verificationStatus: 'PENDING_VERIFICATION',
            elapsedSeconds,
            movingSeconds: Math.max(0, elapsedSeconds - session.pausedSeconds),
            startedAt: session.startedAt,
            finishedAt,
          }),
      );
      await announceCounted(manager, saved, await countActivity(manager, saved));
      return { waiting, activity: saved };
    });
    runEvents.inc({ event: 'retry' in outcome && outcome.retry ? 'finish_asked_resend' : !outcome.activity ? 'finish_empty' : outcome.waiting ? 'finish_waiting_for_points' : 'finish_complete' });
    if ('retry' in outcome && outcome.retry) {
      throw new ConflictException(`Jump has ${outcome.retry.received} of the ${outcome.retry.sampleCount} GPS points from this run. Sending the rest again.`);
    }
    if (!outcome.activity) throw new UnprocessableEntityException('GPS didn’t measure any distance, so there’s nothing to save.');
    const activity = outcome.activity;

    if (outcome.waiting) {
      await this.verificationQueue.add('verify-activity', { activityId: activity.id }, { jobId: `activity-${activity.id}-late`, delay: LATE_POINTS_WAIT_MS, ...VERIFY_JOB });
    } else {
      await this.verificationQueue.add('verify-activity', { activityId: activity.id }, { jobId: `activity-${activity.id}`, ...VERIFY_JOB });
    }
    return activity;
  }

  async pause(userId: string, sessionId: string, at?: string) {
    const session = await this.get(userId, sessionId);
    if (session.status !== 'RUNNING') throw new BadRequestException('Only a running session can be paused');
    session.status = 'PAUSED';
    session.pausedAt = momentOf(at, session.startedAt);
    return this.sessions.save(session);
  }

  async resume(userId: string, sessionId: string, at?: string) {
    const session = await this.get(userId, sessionId);
    if (session.status !== 'PAUSED' || !session.pausedAt) {
      throw new BadRequestException('Only a paused session can be resumed');
    }
    const resumedAt = momentOf(at, session.pausedAt);
    session.pausedSeconds += Math.max(0, Math.floor((resumedAt.getTime() - session.pausedAt.getTime()) / 1000));
    session.pausedAt = null;
    session.status = 'RUNNING';
    return this.sessions.save(session);
  }

  async get(userId: string, sessionId: string) {
    const session = await this.sessions.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Run session not found');
    return session;
  }
}
