import { EntityManager } from 'typeorm';
import { bestEffortSeconds, measureTrack } from '../running/track';

/** One activity's fastest stretch of `metres`, from its GPS fixes (the same track that was verified). */
export async function bestEffortFor(manager: EntityManager, activityId: string, metres: number) {
  const [activity] = await manager.query(
    `SELECT "runningSessionId", "activityType", "validatedDistanceMetres" FROM "activities" WHERE "id" = $1`, [activityId],
  ) as Array<{ runningSessionId: string; activityType: 'walk' | 'run' | 'cycle'; validatedDistanceMetres: number }>;
  if (!activity) return null;
  const samples = await manager.query(
    `SELECT "latitude", "longitude", "accuracy", "recordedAt" FROM "gps_samples" WHERE "sessionId" = $1 ORDER BY "sequence"`,
    [activity.runningSessionId],
  ) as Array<{ latitude: number; longitude: number; accuracy: number | null; recordedAt: Date }>;
  const profile = measureTrack(samples, { activityType: activity.activityType }).profile;
  // Keep the race on the distance shown on the board: re-measuring can land a few metres off the verified
  // total (an older algorithm, or rounding), which shouldn't make a 10.02 km run miss a 10 km race.
  const measured = profile.at(-1)?.[1] ?? 0;
  const scale = measured > 0 ? activity.validatedDistanceMetres / measured : 1;
  const aligned = scale > 0.9 && scale < 1.1 ? profile.map(([at, metresSoFar]) => [at, metresSoFar * scale] as [number, number]) : profile;
  return bestEffortSeconds(aligned, metres);
}

/**
 * Times new credits in fastest-time competitions: the best stretch of the race distance inside each
 * activity, so a 14 km run in a 10K race counts its fastest 10 km, not the whole run.
 */
export async function timeEfforts(manager: EntityManager, credits: Array<{ id: string; tableId: string; activityId: string }>) {
  if (!credits.length) return;
  const races = await manager.query(
    `SELECT "id", "targetDistanceMetres" FROM "competition_tables"
     WHERE "id" = ANY($1::uuid[]) AND "scoringMethod" IN ('FASTEST_FIXED_DISTANCE','FASTEST_TIME') AND "targetDistanceMetres" > 0`,
    [[...new Set(credits.map((credit) => credit.tableId))]],
  ) as Array<{ id: string; targetDistanceMetres: number }>;
  const target = new Map(races.map((race) => [race.id, race.targetDistanceMetres]));
  const timed = new Map<string, number | null>();
  for (const credit of credits) {
    const metres = target.get(credit.tableId);
    if (!metres) continue;
    const key = `${credit.activityId}:${metres}`;
    if (!timed.has(key)) timed.set(key, await bestEffortFor(manager, credit.activityId, metres));
    await manager.query(`UPDATE "table_activity_credits" SET "completionTimeSeconds" = $2 WHERE "id" = $1`, [credit.id, timed.get(key) ?? null]);
  }
}
