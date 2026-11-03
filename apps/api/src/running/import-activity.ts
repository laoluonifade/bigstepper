import { DataSource, EntityManager } from 'typeorm';
import { uncreditActivity } from '../tables/competition-credits';
import { Activity } from './activity.entity';
import { GpsSample } from './gps-sample.entity';
import { RunningSession } from './running-session.entity';

export interface ImportedPoint {
  latitude: number;
  longitude: number;
  recordedAt: Date;
  stepCount: number | null;
}

export interface ImportedActivity {
  userId: string;
  activityType: 'walk' | 'run' | 'cycle';
  source: Activity['source'];
  externalId: string;
  startedAt: Date;
  finishedAt: Date;
  distanceMetres: number;
  elapsedSeconds: number;
  movingSeconds: number;
  elevationGainMetres: number | null;
  recordedSteps: number;
  stepsSource: Activity['stepsSource'];
  points: ImportedPoint[];
}

export async function alreadyImported(dataSource: DataSource, userId: string, externalId: string, startedAt: Date, finishedAt: Date) {
  if (await dataSource.getRepository(Activity).exist({ where: { externalId } })) return true;
  const [{ overlapping }] = await dataSource.query(
    `SELECT EXISTS (SELECT 1 FROM "activities" WHERE "userId" = $1 AND "startedAt" < $3 AND "finishedAt" > $2)
       OR EXISTS (SELECT 1 FROM "running_sessions" WHERE "userId" = $1 AND "status" IN ('RUNNING', 'PAUSED')
                    AND "startedAt" < $3 AND "startedAt" > $2::timestamptz - INTERVAL '1 day') AS overlapping`,
    [userId, startedAt, finishedAt],
  );
  return Boolean(overlapping);
}

export async function dropOverlappingImports(manager: EntityManager, userId: string, startedAt: Date, finishedAt: Date) {
  const overlapping = await manager.query(
    `SELECT a."id", a."runningSessionId" FROM "activities" a
     WHERE a."userId" = $1 AND a."source" <> 'jump' AND a."startedAt" < $3 AND a."finishedAt" > $2
       AND NOT EXISTS (
         SELECT 1 FROM "table_activity_credits" c JOIN "competition_tables" t ON t."id" = c."tableId"
         WHERE c."activityId" = a."id" AND (t."type" <> 'free' OR t."status" NOT IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED')))`,
    [userId, startedAt, finishedAt],
  ) as Array<{ id: string; runningSessionId: string }>;
  for (const activity of overlapping) {
    await uncreditActivity(manager, activity.id);
    await manager.delete(RunningSession, { id: activity.runningSessionId });
  }
  return overlapping.length;
}

export function saveImportedActivity(dataSource: DataSource, input: ImportedActivity): Promise<Activity> {
  return dataSource.transaction(async (manager) => {
    const session = await manager.save(
      RunningSession,
      manager.create(RunningSession, {
        userId: input.userId,
        activityType: input.activityType,
        status: 'PENDING_VERIFICATION',
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        distanceMetres: Math.round(input.distanceMetres),
        pausedSeconds: Math.max(0, input.elapsedSeconds - input.movingSeconds),
        pausedAt: null,
      }),
    );
    const samples = input.points.map((point, index) => ({ sessionId: session.id, sequence: index, ...point }));
    for (let start = 0; start < samples.length; start += 1000) {
      await manager.createQueryBuilder().insert().into(GpsSample).values(samples.slice(start, start + 1000)).execute();
    }
    return manager.save(
      Activity,
      manager.create(Activity, {
        runningSessionId: session.id,
        userId: input.userId,
        activityType: input.activityType,
        source: input.source,
        externalId: input.externalId,
        recordedDistanceMetres: Math.round(input.distanceMetres),
        recordedSteps: input.recordedSteps,
        stepsSource: input.stepsSource,
        elevationGainMetres: input.elevationGainMetres,
        verificationStatus: 'PENDING_VERIFICATION',
        elapsedSeconds: input.elapsedSeconds,
        movingSeconds: input.movingSeconds,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
      }),
    );
  });
}
