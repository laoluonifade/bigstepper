import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { GpsSampleDto } from './dto/add-samples.dto';
import { GpsSample } from './gps-sample.entity';
import { measureTrack } from './track';
import { RunningSession } from './running-session.entity';
import { Activity } from './activity.entity';
import { ACTIVITY_VERIFICATION_QUEUE } from '../jobs/jobs.module';

@Injectable()
export class RunningService {
  constructor(
    @InjectRepository(RunningSession)
    private readonly sessions: Repository<RunningSession>,
    private readonly dataSource: DataSource,
    @InjectQueue(ACTIVITY_VERIFICATION_QUEUE)
    private readonly verificationQueue: Queue,
  ) {}

  async start(userId: string, activityType: 'walk' | 'run') {
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

      await manager
        .createQueryBuilder()
        .insert()
        .into(GpsSample)
        .values(
          input.map((sample) => ({
            sessionId,
            sequence: sample.sequence,
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
      session.distanceMetres = measureTrack(all).distanceMetres;
      session.stepCount = Math.max(0, ...all.map((sample) => sample.stepCount ?? 0));
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

  async finish(userId: string, sessionId: string) {
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

      const finishedAt = new Date();
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

  async pause(userId: string, sessionId: string) {
    const session = await this.get(userId, sessionId);
    if (session.status !== 'RUNNING') throw new BadRequestException('Only a running session can be paused');
    session.status = 'PAUSED';
    session.pausedAt = new Date();
    return this.sessions.save(session);
  }

  async resume(userId: string, sessionId: string) {
    const session = await this.get(userId, sessionId);
    if (session.status !== 'PAUSED' || !session.pausedAt) {
      throw new BadRequestException('Only a paused session can be resumed');
    }
    session.pausedSeconds += Math.max(0, Math.floor((Date.now() - session.pausedAt.getTime()) / 1000));
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
