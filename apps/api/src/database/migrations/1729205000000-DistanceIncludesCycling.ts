import { MigrationInterface, QueryRunner } from 'typeorm';
import { retotal } from '../../tables/competition-credits';

/** Distance competitions count verified runs, walks and rides, including activities recorded before joining. */
export class DistanceIncludesCycling1729205000000 implements MigrationInterface {
  name = 'DistanceIncludesCycling1729205000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "competition_tables"
      SET "eligibleActivities" = '["run","walk","cycle"]'::jsonb
      WHERE "challengeType" = 'DISTANCE'
        AND "eligibleActivities" <> '["run","walk","cycle"]'::jsonb`);

    // One set-based backfill; finished/settled boards are not rewritten.
    const credited = await queryRunner.manager.query(`
      INSERT INTO "table_activity_credits"
        ("tableId", "registrationId", "activityId", "creditedDistanceMetres", "creditedSteps", "completionTimeSeconds")
      SELECT t."id", r."id", a."id",
             LEAST(CASE WHEN t."rulesVersion" = 1 AND t."type" = 'free'
                        THEN GREATEST(a."validatedDistanceMetres", a."stepDistanceMetres")
                        ELSE a."validatedDistanceMetres" END,
                   COALESCE(t."distanceCapMetres", 2147483647)),
             0, NULL
      FROM "activities" a
      JOIN "table_registrations" r ON r."userId" = a."userId"
      JOIN "competition_tables" t ON t."id" = r."tableId"
      WHERE t."challengeType" = 'DISTANCE' AND a."activityType" = 'cycle'
        AND a."verificationStatus" = 'VERIFIED'
        AND t."status" IN ('OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED')
        AND a."startedAt" >= COALESCE(t."startsAt", '-infinity'::timestamptz)
        AND a."finishedAt" <= COALESCE(t."scoringClosesAt", 'infinity'::timestamptz)
        AND a."validatedDistanceMetres" >= COALESCE(t."minActivityMetres", 0)
        AND a."movingSeconds" >= COALESCE(t."minActivitySeconds", 0)
        -- Leave ambiguous overlapping historical rides for review rather than double-counting them.
        AND NOT EXISTS (
          SELECT 1 FROM "activities" other
          WHERE other."userId" = a."userId" AND other."id" <> a."id"
            AND other."verificationStatus" = 'VERIFIED'
            AND other."startedAt" < a."finishedAt" AND other."finishedAt" > a."startedAt")
        AND (t."rulesVersion" = 1 OR NOT EXISTS (
          SELECT 1 FROM "table_activity_credits" c2 JOIN "activities" a2 ON a2."id" = c2."activityId"
          WHERE c2."registrationId" = r."id" AND a2."id" <> a."id"
            AND a2."startedAt" < a."finishedAt" AND a2."finishedAt" > a."startedAt"))
      ON CONFLICT ("tableId", "activityId") DO NOTHING
      RETURNING "tableId"`) as Array<{ tableId: string }>;

    const tableIds = [...new Set(credited.map((row) => row.tableId))];
    if (tableIds.length) await retotal(queryRunner.manager, tableIds);
  }

  async down(): Promise<void> {
    // Scored rides cannot be removed from settled cash results safely.
  }
}
