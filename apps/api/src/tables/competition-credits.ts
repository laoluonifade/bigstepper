import { EntityManager } from 'typeorm';
import { ChallengeType, countsAppleHealth, DAILY_HEALTH_METHODS, dailyMeasure, ScoringMethod } from './competition-rules';
import { daysBetween, ScoredActivity, scoreEntrants } from './scoring-engine';
import { timeEfforts } from './best-effort';
import { COUNTED_STATUSES, countedMetres, countedSteps } from '../running/counted';

export const HEALTH_ELIGIBLE = (alias: string) =>
  `(${alias}."type" = 'free' AND ${alias}."challengeType" IN ('STEP', 'WALK', 'DISTANCE') AND ${alias}."scoringMethod" IN (${DAILY_HEALTH_METHODS.map((method) => `'${method}'`).join(', ')}))`;

export async function creditActivities(manager: EntityManager, scope: { activityId: string } | { tableId: string; userId: string }) {
  const [filter, params] = 'activityId' in scope
    ? ['a."id" = $1', [scope.activityId]]
    : ['t."id" = $1 AND a."userId" = $2', [scope.tableId, scope.userId]];
  const credited = await manager.query(
    `INSERT INTO "table_activity_credits" ("tableId", "registrationId", "activityId", "creditedDistanceMetres", "creditedSteps", "completionTimeSeconds")
     SELECT t."id", r."id", a."id",
       LEAST(CASE WHEN a."verificationStatus" = 'PENDING_VERIFICATION' THEN a."recordedDistanceMetres"
                  WHEN t."rulesVersion" = 1 AND t."type"='free' THEN GREATEST(a."validatedDistanceMetres", a."stepDistanceMetres") ELSE a."validatedDistanceMetres" END,
             COALESCE(t."distanceCapMetres", 2147483647)),
       CASE WHEN t."rulesVersion" >= 2 AND a."stepsSource" IS DISTINCT FROM 'sensor' AND a."verificationStatus" <> 'PENDING_VERIFICATION' THEN 0 ELSE ${countedSteps()} END,
       NULL
     FROM "activities" a
     JOIN "table_registrations" r ON r."userId" = a."userId"
     JOIN "competition_tables" t ON t."id" = r."tableId"
     WHERE ${filter}
       AND a."verificationStatus" IN ${COUNTED_STATUSES}
       AND t."status" IN ('OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED')
       AND t."eligibleActivities" ? a."activityType"
       AND a."startedAt" >= COALESCE(t."startsAt", '-infinity'::timestamptz)
       AND a."finishedAt" <= COALESCE(t."scoringClosesAt", 'infinity'::timestamptz)
       AND ${countedMetres()} >= COALESCE(t."minActivityMetres", 0)
       AND a."movingSeconds" >= COALESCE(t."minActivitySeconds", 0)
       AND (t."rulesVersion" = 1 OR NOT EXISTS (
         SELECT 1 FROM "table_activity_credits" c2 JOIN "activities" a2 ON a2."id" = c2."activityId"
         WHERE c2."registrationId" = r."id" AND a2."id" <> a."id" AND a2."startedAt" < a."finishedAt" AND a2."finishedAt" > a."startedAt"))
     ON CONFLICT ("tableId", "activityId") DO UPDATE
       SET "creditedDistanceMetres" = EXCLUDED."creditedDistanceMetres", "creditedSteps" = EXCLUDED."creditedSteps"
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
     SET "creditedDistanceMetres" = COALESCE(merged.metres, totals.distance, 0), "creditedSteps" = COALESCE(merged.steps, totals.steps, 0), "completionTimeSeconds" = totals.best_time
     FROM "table_registrations" own
     JOIN "competition_tables" t ON t."id" = own."tableId"
     LEFT JOIN LATERAL (
       SELECT SUM(GREATEST(COALESCE(a.steps, 0), COALESCE(h.steps, 0)))::integer AS steps,
              SUM(GREATEST(COALESCE(a.metres, 0), COALESCE(h.metres, 0)))::integer AS metres
       FROM (
         SELECT (act."startedAt" AT TIME ZONE t."timeZone")::date AS day, SUM(c."creditedSteps") AS steps, SUM(c."creditedDistanceMetres") AS metres
         FROM "table_activity_credits" c JOIN "activities" act ON act."id" = c."activityId"
         WHERE c."registrationId" = own."id" GROUP BY 1
       ) a
       FULL OUTER JOIN (
         SELECT d."day", d."countedSteps" AS steps, d."countedMetres" AS metres FROM "daily_steps" d
         WHERE d."userId" = own."userId" AND (d."countedSteps" > 0 OR d."countedMetres" > 0)
           AND d."day" BETWEEN (COALESCE(t."startsAt", t."createdAt") AT TIME ZONE t."timeZone")::date
                           AND (LEAST(now(), COALESCE(t."scoringClosesAt", 'infinity'::timestamptz)) AT TIME ZONE t."timeZone")::date
       ) h ON h."day" = a.day
       WHERE ${HEALTH_ELIGIBLE('t')} AND EXISTS (
         SELECT 1 FROM "daily_steps" d WHERE d."userId" = own."userId" AND (d."countedSteps" > 0 OR d."countedMetres" > 0)
           AND d."day" BETWEEN (COALESCE(t."startsAt", t."createdAt") AT TIME ZONE t."timeZone")::date
                           AND (LEAST(now(), COALESCE(t."scoringClosesAt", 'infinity'::timestamptz)) AT TIME ZONE t."timeZone")::date)
     ) merged ON true
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
  type: string;
  startDay: string;
  endDay: string;
}

export async function rescore(manager: EntityManager, tableIds: string[]) {
  for (const tableId of tableIds) {
    const [table] = await manager.query(
      `SELECT "id", "challengeType", "scoringMethod", "rulesVersion", "targetDistanceMetres", "targetSteps", "targetSeconds",
              "targetSessions", "dailyTarget", "minSessions", "timeZone", "type",
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
    const scored = countsAppleHealth(table) ? withHealthDays(rows, await healthRows(manager, table)) : rows;
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
    }, registrations.map((row) => row.id), scored);
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

function healthRows(manager: EntityManager, table: TableRules) {
  return manager.query(
    `SELECT r."id" AS "registrationId", 'day:' || to_char(d."day", 'YYYY-MM-DD') AS "activityId",
            d."day"::timestamp AT TIME ZONE $2 AS "startedAt",
            LEAST(d."updatedAt", (d."day" + 1)::timestamp AT TIME ZONE $2) AS "finishedAt",
            to_char(d."day", 'YYYY-MM-DD') AS "day", d."countedMetres" AS "distance", d."countedSteps" AS "steps", 0 AS "movingSeconds", 0 AS "elapsedSeconds",
            NULL AS "elevation", NULL AS "completionSeconds"
     FROM "table_registrations" r JOIN "daily_steps" d ON d."userId" = r."userId"
     WHERE r."tableId" = $1 AND d."day" BETWEEN $3::date AND $4::date AND (d."countedSteps" > 0 OR d."countedMetres" > 0)`,
    [table.id, table.timeZone, table.startDay, table.endDay],
  ) as Promise<ScoredActivity[]>;
}

export function withHealthDays(activities: ScoredActivity[], days: ScoredActivity[]) {
  const healthDays = new Set(days.map((day) => `${day.registrationId}:${day.day}`));
  const kept = activities.filter((activity) => !healthDays.has(`${activity.registrationId}:${activity.day}`));
  const merged = days.map((day) => {
    const same = activities.filter((activity) => activity.registrationId === day.registrationId && activity.day === day.day);
    const steps = same.reduce((sum, activity) => sum + activity.steps, 0);
    const distance = same.reduce((sum, activity) => sum + activity.distance, 0);
    const finished = same.reduce((latest, activity) => (activity.finishedAt > latest ? activity.finishedAt : latest), day.finishedAt);
    return { ...day, steps: Math.max(steps, day.steps), distance: Math.max(distance, day.distance), finishedAt: finished };
  });
  return [...kept, ...merged];
}
