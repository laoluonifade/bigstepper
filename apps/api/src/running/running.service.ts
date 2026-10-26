import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

/**
 * When a pause, resume or finish happened. Normally now; done offline, the phone sends the moment it
 * really happened when it reconnects. Kept honest: never in the future, never before `floor` (the start,
 * or the pause being ended), and nothing older than a day.
 */
export function momentOf(at: string | undefined, floor: Date, now = new Date()) {
  if (!at) return now;
  const moment = new Date(at);
  if (Number.isNaN(moment.getTime())) return now;
  const earliest = Math.max(floor.getTime(), now.getTime() - 24 * 60 * 60 * 1000);
  return new Date(Math.min(now.getTime(), Math.max(earliest, moment.getTime())));
}

@Injectable()
export class RunningService {
  constructor(
    @InjectRepository(RunningSession)
    private readonly sessions: Repository<RunningSession>,
    private readonly dataSource: DataSource,
    @InjectQueue(ACTIVITY_VERIFICATION_QUEUE)
    private readonly verificationQueue: Queue,
  ) {}

  async start(userId: string, activityType: 'walk' | 'run' | 'cycle') {
    try {
      return await this.sessions.save(
        this.sessions.create({ userId, activityType, status: 'RUNNING', startedAt: new Date(), pausedAt: null }),
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
    return this.dataSource.transaction(async (manager) => {
      const session = await manager.findOne(RunningSession, {
        where: { id: sessionId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) throw new NotFoundException('Run session not found');
      if (session.status !== 'RUNNING') {
        throw new BadRequestException('Samples can only be added while the run is active');
      }

      // A number the run already has with a different time means the phone started counting again (a
      // reinstall, cleared storage): those are new points, so they go on the end instead of being dropped.
      // The same number and time is a retried upload, ignored below.
      const taken = new Map((await manager.query(
        `SELECT "sequence", "recordedAt" FROM "gps_samples" WHERE "sessionId"=$1 AND "sequence"=ANY($2::integer[])`,
        [sessionId, input.map((sample) => sample.sequence)],
      ) as Array<{ sequence: number; recordedAt: Date }>).map((row) => [row.sequence, new Date(row.recordedAt).getTime()]));
      let next = taken.size ? (await manager.query(`SELECT COALESCE(MAX("sequence"),0)::integer AS "max" FROM "gps_samples" WHERE "sessionId"=$1`, [sessionId]) as Array<{ max: number }>)[0].max : 0;
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
      // Same measurement verification uses, so the live number matches the verified one.
      session.distanceMetres = measureTrack(all, { activityType: session.activityType }).distanceMetres;
      session.stepCount = session.activityType === 'cycle' ? 0 : Math.max(0, ...all.map((sample) => sample.stepCount ?? 0));
      await manager.save(session);
      return { distanceMetres: session.distanceMetres, stepCount: session.stepCount, sampleCount: all.length };
    });
  }

  async discard(userId: string, sessionId: string) {
    return this.dataSource.transaction(async (manager) => {
      const session = await manager.findOne(RunningSession, { where: { id: sessionId, userId }, lock: { mode: 'pessimistic_write' } });
      if (!session) throw new NotFoundException('Run session not found');
      if (session.status !== 'RUNNING' && session.status !== 'PAUSED') {
        throw new ConflictException('This run is already finished. Delete it from your activities instead.');
      }
      await manager.delete(RunningSession, { id: session.id }); // GPS fixes go with it (ON DELETE CASCADE)
      return { discarded: true };
    });
  }

  async finish(userId: string, sessionId: string, at?: string) {
    const activity = await this.dataSource.transaction(async (manager) => {
      const session = await manager.findOne(RunningSession, {
        where: { id: sessionId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) throw new NotFoundException('Run session not found');

      const existing = await manager.findOne(Activity, { where: { runningSessionId: sessionId } });
      if (existing) return existing;
      if (!['RUNNING', 'PAUSED'].includes(session.status)) {
        throw new BadRequestException('This run cannot be finished');
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
      return manager.save(
        Activity,
        manager.create(Activity, {
          runningSessionId: session.id,
          userId,
          activityType: session.activityType,
          recordedDistanceMetres: session.distanceMetres,
          recordedSteps: session.stepCount,
          verificationStatus: 'PENDING_VERIFICATION',
          elapsedSeconds,
          movingSeconds: Math.max(0, elapsedSeconds - session.pausedSeconds),
          startedAt: session.startedAt,
          finishedAt,
        }),
      );
    });

    await this.verificationQueue.add(
      'verify-activity',
      { activityId: activity.id },
      { jobId: `activity-${activity.id}`, attempts: 5, backoff: { type: 'exponential', delay: 1_000 } },
    );
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
