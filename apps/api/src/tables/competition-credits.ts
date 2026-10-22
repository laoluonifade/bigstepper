import { EntityManager } from 'typeorm';

/**
 * Puts verified activities on competition boards and re-totals them. One rule everywhere: a verified
 * walk, run or ride counts if it happened inside the competition's dates and fits its activity type,
 * whenever the runner joined. So an activity recorded (or synced from Strava) before joining still counts
 * once they're in, and a late Strava upload counts the moment it's verified.
 *
 * Both distance and steps are recorded on every credit so any board can show km and steps; ranking only
 * reads the column that matches the scoring method.
 */
export async function creditActivities(manager: EntityManager, scope: { activityId: string } | { tableId: string; userId: string }) {
  const [filter, params] = 'activityId' in scope
    ? ['a."id" = $1', [scope.activityId]]
    : ['t."id" = $1 AND a."userId" = $2', [scope.tableId, scope.userId]];
  const credited = await manager.query(
    `INSERT INTO "table_activity_credits" ("tableId", "registrationId", "activityId", "creditedDistanceMetres", "creditedSteps", "completionTimeSeconds")
     SELECT t."id", r."id", a."id",
       LEAST(CASE WHEN t."type"='free' THEN GREATEST(a."validatedDistanceMetres", a."stepDistanceMetres") ELSE a."validatedDistanceMetres" END,
             COALESCE(t."distanceCapMetres", 2147483647)),
       a."validatedSteps",
       CASE WHEN t."scoringMethod" IN ('FASTEST_FIXED_DISTANCE','FASTEST_TIME') AND a."validatedDistanceMetres">=t."targetDistanceMetres" THEN a."movingSeconds" ELSE NULL END
     FROM "activities" a
     JOIN "table_registrations" r ON r."userId" = a."userId"
     JOIN "competition_tables" t ON t."id" = r."tableId"
     WHERE ${filter}
       AND a."verificationStatus" = 'VERIFIED'
       AND t."status" IN ('OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED')
       AND ((a."activityType"='cycle' AND t."challengeType"='CYCLING') OR
            (a."activityType" IN ('walk','run') AND (t."challengeType" IN ('DISTANCE','STEP','TIMED') OR
             (t."challengeType"='WALK' AND a."activityType"='walk') OR (t."challengeType"='RUN' AND a."activityType"='run'))))
       AND a."startedAt" >= COALESCE(t."startsAt", '-infinity'::timestamptz)
       AND a."finishedAt" <= COALESCE(t."scoringClosesAt", 'infinity'::timestamptz)
     ON CONFLICT ("tableId", "activityId") DO NOTHING
     RETURNING "tableId"`,
    params,
  ) as Array<{ tableId: string }>;
  const tableIds = [...new Set(credited.map((row) => row.tableId))];
  if (tableIds.length) await retotal(manager, tableIds);
  return tableIds;
}

/** Recomputes each entrant's totals on these competitions from their credits. */
export async function retotal(manager: EntityManager, tableIds: string[]) {
  await manager.query(
    `UPDATE "table_registrations" r
     SET "creditedDistanceMetres" = totals.distance, "creditedSteps" = totals.steps, "completionTimeSeconds" = totals.best_time
     FROM (
       SELECT c."registrationId", SUM(c."creditedDistanceMetres")::integer AS distance,
              SUM(c."creditedSteps")::integer AS steps, MIN(c."completionTimeSeconds")::integer AS best_time
       FROM "table_activity_credits" c
       WHERE c."tableId" = ANY($1::uuid[])
       GROUP BY c."registrationId"
     ) totals
     WHERE r."id" = totals."registrationId"`,
    [tableIds],
  );
}
