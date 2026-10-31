import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { ACTIVITY_VERIFICATION_QUEUE } from '../jobs/jobs.module';
import { alreadyImported, saveImportedActivity } from '../running/import-activity';
import { stravaStepTotals } from '../strava/strava-steps';
import { spreadSteps } from './apple-health-steps';
import { AppleHealthLink } from './apple-health-link.entity';
import { AppleHealthWorkoutDto } from './apple-health.dto';

const MAX_WORKOUT_SECONDS = 24 * 60 * 60;
const ROUTE_SLACK_SECONDS = 120;
const MAX_STEPS_PER_SECOND = 4;

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
    return { connected: true as const, connectedAt: link.connectedAt, lastSyncedAt: link.lastSyncedAt };
  }

  async connect(userId: string) {
    await this.links.createQueryBuilder().insert().values({ userId }).orIgnore().execute();
    return this.status(userId);
  }

  async disconnect(userId: string) {
    await this.links.delete({ userId });
    return { connected: false as const };
  }

  async synced(userId: string) {
    await this.links.update({ userId }, { lastSyncedAt: new Date() });
    return this.status(userId);
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
      distanceMetres: workout.distanceMetres,
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
