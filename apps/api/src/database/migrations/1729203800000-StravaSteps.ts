import { MigrationInterface, QueryRunner } from 'typeorm';

export class StravaSteps1729203800000 implements MigrationInterface {
  name = 'StravaSteps1729203800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "activities" a SET
        "recordedSteps" = est.steps,
        "validatedSteps" = CASE WHEN a."verificationStatus" = 'VERIFIED' THEN est.steps ELSE a."validatedSteps" END,
        "stepDistanceMetres" = CASE WHEN a."verificationStatus" = 'VERIFIED' THEN round(est.steps * est.stride)::integer ELSE a."stepDistanceMetres" END
      FROM (
        SELECT "id", CASE WHEN "activityType" = 'run' THEN 1.0 ELSE 0.72 END AS stride,
               LEAST(round(COALESCE("validatedDistanceMetres", "recordedDistanceMetres", 0) / CASE WHEN "activityType" = 'run' THEN 1.0 ELSE 0.72 END),
                     COALESCE("movingSeconds", "elapsedSeconds", 0) * 4)::integer AS steps
        FROM "activities"
        WHERE "source" = 'strava' AND "activityType" IN ('walk', 'run') AND COALESCE("recordedSteps", 0) = 0
      ) est
      WHERE a."id" = est."id"`);

    await queryRunner.query(`
      INSERT INTO "table_activity_credits" ("tableId", "registrationId", "activityId", "creditedDistanceMetres", "creditedSteps", "completionTimeSeconds")
      SELECT t."id", r."id", a."id",
        CASE WHEN t."scoringMethod"='FARTHEST_DISTANCE' THEN LEAST(
          CASE WHEN t."type"='free' THEN GREATEST(a."validatedDistanceMetres", a."stepDistanceMetres") ELSE a."validatedDistanceMetres" END,
          COALESCE(t."distanceCapMetres", 2147483647)) ELSE 0 END,
        CASE WHEN t."scoringMethod"='MOST_STEPS' THEN a."validatedSteps" ELSE 0 END,
        CASE WHEN t."scoringMethod" IN ('FASTEST_FIXED_DISTANCE','FASTEST_TIME') AND a."validatedDistanceMetres">=t."targetDistanceMetres" THEN a."movingSeconds" ELSE NULL END
      FROM "activities" a
      JOIN "table_registrations" r ON r."userId" = a."userId" AND r."joinedAt" <= a."startedAt"
      JOIN "competition_tables" t ON t."id" = r."tableId"
      WHERE a."source" = 'strava' AND a."verificationStatus" = 'VERIFIED'
        AND t."status" IN ('OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED')
        AND ((a."activityType"='cycle' AND t."challengeType"='CYCLING') OR
             (a."activityType" IN ('walk','run') AND (t."challengeType" IN ('DISTANCE','STEP','TIMED') OR
              (t."challengeType"='WALK' AND a."activityType"='walk') OR (t."challengeType"='RUN' AND a."activityType"='run'))))
        AND a."startedAt" >= COALESCE(t."startsAt", '-infinity'::timestamptz)
        AND a."finishedAt" <= COALESCE(t."scoringClosesAt", 'infinity'::timestamptz)
      ON CONFLICT ("tableId", "activityId") DO NOTHING`);

    await queryRunner.query(`
      UPDATE "table_activity_credits" c SET "creditedSteps" = a."validatedSteps"
      FROM "activities" a, "competition_tables" t
      WHERE c."activityId" = a."id" AND t."id" = c."tableId"
        AND a."source" = 'strava' AND a."verificationStatus" = 'VERIFIED'
        AND t."scoringMethod" = 'MOST_STEPS' AND c."creditedSteps" = 0
        AND t."status" IN ('OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED')`);

    await queryRunner.query(`
      UPDATE "table_registrations" r
      SET "creditedDistanceMetres" = totals.distance, "creditedSteps" = totals.steps, "completionTimeSeconds" = totals.best_time
      FROM (
        SELECT c."registrationId", SUM(c."creditedDistanceMetres")::integer AS distance,
               SUM(c."creditedSteps")::integer AS steps, MIN(c."completionTimeSeconds")::integer AS best_time
        FROM "table_activity_credits" c
        JOIN "competition_tables" t ON t."id" = c."tableId"
        WHERE t."status" IN ('OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED')
          AND c."tableId" IN (SELECT c2."tableId" FROM "table_activity_credits" c2 JOIN "activities" a ON a."id" = c2."activityId" WHERE a."source" = 'strava')
        GROUP BY c."registrationId"
      ) totals
      WHERE r."id" = totals."registrationId"`);
  }

  async down(): Promise<void> {
  }
}
