import { EntityManager } from 'typeorm';
import { ChallengeType, dailyMeasure, ScoringMethod } from './competition-rules';
import { daysBetween, ScoredActivity, scoreEntrants } from './scoring-engine';
import { timeEfforts } from './best-effort';

export async function creditActivities(manager: EntityManager, scope: { activityId: string } | { tableId: string; userId: string }) {
  const [filter, params] = 'activityId' in scope
    ? ['a."id" = $1', [scope.activityId]]
    : ['t."id" = $1 AND a."userId" = $2', [scope.tableId, scope.userId]];
  const credited = await manager.query(
    `INSERT INTO "table_activity_credits" ("tableId", "registrationId", "activityId", "creditedDistanceMetres", "creditedSteps", "completionTimeSeconds")
     SELECT t."id", r."id", a."id",
       LEAST(CASE WHEN t."rulesVersion" = 1 AND t."type"='free' THEN GREATEST(a."validatedDistanceMetres", a."stepDistanceMetres") ELSE a."validatedDistanceMetres" END,
             COALESCE(t."distanceCapMetres", 2147483647)),
       CASE WHEN t."rulesVersion" >= 2 AND a."stepsSource" IS DISTINCT FROM 'sensor' THEN 0 ELSE a."validatedSteps" END,
       NULL
     FROM "activities" a
     JOIN "table_registrations" r ON r."userId" = a."userId"
     JOIN "competition_tables" t ON t."id" = r."tableId"
     WHERE ${filter}
       AND a."verificationStatus" = 'VERIFIED'
       AND t."status" IN ('OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED')
       AND t."eligibleActivities" ? a."activityType"
       AND a."startedAt" >= COALESCE(t."startsAt", '-infinity'::timestamptz)
       AND a."finishedAt" <= COALESCE(t."scoringClosesAt", 'infinity'::timestamptz)
       AND a."validatedDistanceMetres" >= COALESCE(t."minActivityMetres", 0)
       AND a."movingSeconds" >= COALESCE(t."minActivitySeconds", 0)
       AND (t."rulesVersion" = 1 OR NOT EXISTS (
         SELECT 1 FROM "table_activity_credits" c2 JOIN "activities" a2 ON a2."id" = c2."activityId"
         WHERE c2."registrationId" = r."id" AND a2."id" <> a."id" AND a2."startedAt" < a."finishedAt" AND a2."finishedAt" > a."startedAt"))
     ON CONFLICT ("tableId", "activityId") DO NOTHING
     RETURNING "id", "tableId", "activityId"`,
    params,
  ) as Array<{ id: string; tableId: string; activityId: string }>;
  await timeEfforts(manager, credited);
  const tableIds = [...new Set(credited.map((row) => row.tableId))];
  if (tableIds.length) await retotal(manager, tableIds);
  return tableIds;
}

export async function uncreditActivity(manager: EntityManager, activityId: string, { liveOnly = false } = {}) {
  const removed = await manager.query(
    `DELETE FROM "table_activity_credits" c USING "competition_tables" t
     WHERE c."activityId" = $1 AND t."id" = c."tableId"
       ${liveOnly ? `AND t."status" IN ('OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED')` : ''}
     RETURNING c."tableId"`,
    [activityId],
  ) as [Array<{ tableId: string }>, number] | Array<{ tableId: string }>;
  const rows = (Array.isArray(removed[0]) ? removed[0] : removed) as Array<{ tableId: string }>;
  const tableIds = [...new Set(rows.map((row) => row.tableId))];
  if (tableIds.length) await retotal(manager, tableIds);
  return tableIds;
}

export async function retotal(manager: EntityManager, tableIds: string[]) {
  await manager.query(
    `UPDATE "table_registrations" r
     SET "creditedDistanceMetres" = COALESCE(totals.distance, 0), "creditedSteps" = COALESCE(totals.steps, 0), "completionTimeSeconds" = totals.best_time
     FROM "table_registrations" own
     LEFT JOIN (
       SELECT c."registrationId", SUM(c."creditedDistanceMetres")::integer AS distance,
              SUM(c."creditedSteps")::integer AS steps, MIN(c."completionTimeSeconds")::integer AS best_time
       FROM "table_activity_credits" c
       WHERE c."tableId" = ANY($1::uuid[])
       GROUP BY c."registrationId"
     ) totals ON totals."registrationId" = own."id"
     WHERE r."id" = own."id" AND own."tableId" = ANY($1::uuid[])`,
    [tableIds],
  );
  await rescore(manager, tableIds);
}

interface TableRules {
  id: string;
  challengeType: ChallengeType;
  scoringMethod: ScoringMethod;
  rulesVersion: number;
  targetDistanceMetres: number | null;
  targetSteps: number | null;
  targetSeconds: number | null;
  targetSessions: number | null;
  dailyTarget: number | null;
  minSessions: number | null;
  timeZone: string;
  startDay: string;
  endDay: string;
}

export async function rescore(manager: EntityManager, tableIds: string[]) {
  for (const tableId of tableIds) {
    const [table] = await manager.query(
      `SELECT "id", "challengeType", "scoringMethod", "rulesVersion", "targetDistanceMetres", "targetSteps", "targetSeconds",
              "targetSessions", "dailyTarget", "minSessions", "timeZone",
              to_char((COALESCE("startsAt", "createdAt") AT TIME ZONE "timeZone")::date, 'YYYY-MM-DD') AS "startDay",
              to_char((LEAST(now(), COALESCE("scoringClosesAt", 'infinity'::timestamptz)) AT TIME ZONE "timeZone")::date, 'YYYY-MM-DD') AS "endDay"
       FROM "competition_tables" WHERE "id" = $1`,
      [tableId],
    ) as TableRules[];
    if (!table) continue;
    const registrations = await manager.query(`SELECT "id" FROM "table_registrations" WHERE "tableId" = $1`, [tableId]) as Array<{ id: string }>;
    if (!registrations.length) continue;
    const rows = await manager.query(
      `SELECT c."registrationId", a."id" AS "activityId", a."startedAt", a."finishedAt",
              to_char(a."startedAt" AT TIME ZONE $2, 'YYYY-MM-DD') AS "day",
              c."creditedDistanceMetres" AS "distance", c."creditedSteps" AS "steps", a."movingSeconds", a."elapsedSeconds",
              a."elevationGainMetres" AS "elevation", c."completionTimeSeconds" AS "completionSeconds"
       FROM "table_activity_credits" c JOIN "activities" a ON a."id" = c."activityId"
       WHERE c."tableId" = $1`,
      [tableId, table.timeZone],
    ) as ScoredActivity[];
    const scores = scoreEntrants({
      method: table.scoringMethod,
      rulesVersion: table.rulesVersion,
      targetDistanceMetres: table.targetDistanceMetres,
      targetSteps: table.targetSteps,
      targetSeconds: table.targetSeconds,
      targetSessions: table.targetSessions,
      dailyTarget: table.dailyTarget,
      dailyMeasure: dailyMeasure(table.challengeType, table.scoringMethod),
      minSessions: table.minSessions,
      windowDays: daysBetween(table.startDay, table.endDay),
    }, registrations.map((row) => row.id), rows);
    const values = [...scores].map(([id, entrant]) => ({ id, ...entrant }));
    await manager.query(
      `UPDATE "table_registrations" r
       SET "score" = v."score", "rankScore" = v."rankScore", "targetReachedAt" = v."targetReachedAt", "scoredAt" = v."scoredAt", "qualified" = v."qualified"
       FROM jsonb_to_recordset($1::jsonb) AS v("id" uuid, "score" double precision, "rankScore" double precision,
                                               "targetReachedAt" timestamptz, "scoredAt" timestamptz, "qualified" boolean)
       WHERE r."id" = v."id"`,
      [JSON.stringify(values)],
    );
  }
}
