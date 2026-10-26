import { MigrationInterface, QueryRunner } from 'typeorm';

export class CountActivitiesBeforeJoining1729204000000 implements MigrationInterface {
  name = 'CountActivitiesBeforeJoining1729204000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const live = `t."status" IN ('OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED')`;
    await queryRunner.query(`
      INSERT INTO "table_activity_credits" ("tableId", "registrationId", "activityId", "creditedDistanceMetres", "creditedSteps", "completionTimeSeconds")
      SELECT t."id", r."id", a."id",
        LEAST(CASE WHEN t."type"='free' THEN GREATEST(a."validatedDistanceMetres", a."stepDistanceMetres") ELSE a."validatedDistanceMetres" END,
              COALESCE(t."distanceCapMetres", 2147483647)),
        a."validatedSteps",
        CASE WHEN t."scoringMethod" IN ('FASTEST_FIXED_DISTANCE','FASTEST_TIME') AND a."validatedDistanceMetres">=t."targetDistanceMetres" THEN a."movingSeconds" ELSE NULL END
      FROM "activities" a
      JOIN "table_registrations" r ON r."userId" = a."userId"
      JOIN "competition_tables" t ON t."id" = r."tableId"
      WHERE a."verificationStatus" = 'VERIFIED' AND ${live}
        AND ((a."activityType"='cycle' AND t."challengeType"='CYCLING') OR
             (a."activityType" IN ('walk','run') AND (t."challengeType" IN ('DISTANCE','STEP','TIMED') OR
              (t."challengeType"='WALK' AND a."activityType"='walk') OR (t."challengeType"='RUN' AND a."activityType"='run'))))
        AND a."startedAt" >= COALESCE(t."startsAt", '-infinity'::timestamptz)
        AND a."finishedAt" <= COALESCE(t."scoringClosesAt", 'infinity'::timestamptz)
      ON CONFLICT ("tableId", "activityId") DO NOTHING`);

    await queryRunner.query(`
      UPDATE "table_registrations" r
      SET "creditedDistanceMetres" = totals.distance, "creditedSteps" = totals.steps, "completionTimeSeconds" = totals.best_time
      FROM (
        SELECT c."registrationId", SUM(c."creditedDistanceMetres")::integer AS distance,
               SUM(c."creditedSteps")::integer AS steps, MIN(c."completionTimeSeconds")::integer AS best_time
        FROM "table_activity_credits" c JOIN "competition_tables" t ON t."id" = c."tableId"
        WHERE ${live}
        GROUP BY c."registrationId"
      ) totals
      WHERE r."id" = totals."registrationId"`);
  }

  async down(): Promise<void> {
  }
}
