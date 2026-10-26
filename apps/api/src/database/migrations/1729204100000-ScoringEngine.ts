import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScoringEngine1729204100000 implements MigrationInterface {
  name = 'ScoringEngine1729204100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "competition_tables"
        ADD COLUMN "targetSteps" integer,
        ADD COLUMN "targetSeconds" integer,
        ADD COLUMN "targetSessions" integer,
        ADD COLUMN "dailyTarget" integer,
        ADD COLUMN "minSessions" integer,
        ADD COLUMN "minActivityMetres" integer,
        ADD COLUMN "minActivitySeconds" integer,
        ADD COLUMN "eligibleActivities" jsonb,
        ADD COLUMN "format" varchar(16) NOT NULL DEFAULT 'open',
        ADD COLUMN "timeZone" varchar(64) NOT NULL DEFAULT 'Africa/Lagos',
        ADD COLUMN "rulesVersion" integer NOT NULL DEFAULT 1`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ALTER COLUMN "rulesVersion" SET DEFAULT 2`);
    await queryRunner.query(`
      UPDATE "competition_tables" SET
        "eligibleActivities" = CASE "challengeType"
          WHEN 'RUN' THEN '["run"]'::jsonb WHEN 'WALK' THEN '["walk"]'::jsonb WHEN 'CYCLING' THEN '["cycle"]'::jsonb
          ELSE '["run","walk"]'::jsonb END,
        "format" = CASE WHEN "capacity" = 2 THEN 'head_to_head' WHEN "visibility" = 'private' THEN 'invite' ELSE 'open' END,
        "timeZone" = COALESCE("reminderTimeZone", 'Africa/Lagos')`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ALTER COLUMN "eligibleActivities" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP CONSTRAINT "competition_tables_scoringMethod_check"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD CONSTRAINT "competition_tables_scoringMethod_check" CHECK ("scoringMethod" IN ('FARTHEST_DISTANCE','FIRST_TO_DISTANCE','FASTEST_FIXED_DISTANCE','FASTEST_TIME','BEST_PACE','BEST_AVERAGE_SPEED','LONGEST_SINGLE','MOST_ELEVATION','MOST_SESSIONS','FIRST_TO_SESSIONS','MOST_ACTIVE_DAYS','MOST_TIME','FIRST_TO_TIME','LONGEST_SESSION','LONGEST_STREAK','TARGET_DAYS','PACE_CONSISTENCY','DAILY_CONSISTENCY','WEEKLY_CONSISTENCY','MOST_STEPS','FIRST_TO_STEPS','MOST_STEPS_ONE_DAY','AVERAGE_DAILY_STEPS'))`);
    await queryRunner.query(`
      ALTER TABLE "competition_tables"
        ADD CONSTRAINT "competition_tables_format_check" CHECK ("format" IN ('open','invite','head_to_head')),
        ADD CONSTRAINT "competition_tables_rules_version_check" CHECK ("rulesVersion" IN (1,2)),
        ADD CONSTRAINT "competition_tables_targets_check" CHECK (
          COALESCE("targetSteps", 1) > 0 AND COALESCE("targetSeconds", 1) > 0 AND COALESCE("targetSessions", 1) > 0 AND
          COALESCE("dailyTarget", 1) > 0 AND COALESCE("minSessions", 1) > 0 AND
          COALESCE("minActivityMetres", 0) >= 0 AND COALESCE("minActivitySeconds", 0) >= 0)`);

    await queryRunner.query(`
      ALTER TABLE "table_registrations"
        ADD COLUMN "score" double precision,
        ADD COLUMN "rankScore" double precision,
        ADD COLUMN "targetReachedAt" timestamptz,
        ADD COLUMN "scoredAt" timestamptz,
        ADD COLUMN "qualified" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`
      UPDATE "table_registrations" r SET
        "score" = CASE WHEN t."scoringMethod" = 'MOST_STEPS' THEN r."creditedSteps"
                       WHEN t."scoringMethod" = 'FARTHEST_DISTANCE' THEN r."creditedDistanceMetres"
                       ELSE r."completionTimeSeconds" END,
        "rankScore" = CASE WHEN t."scoringMethod" = 'MOST_STEPS' THEN r."creditedSteps"
                           WHEN t."scoringMethod" = 'FARTHEST_DISTANCE' THEN r."creditedDistanceMetres"
                           ELSE -r."completionTimeSeconds" END
      FROM "competition_tables" t WHERE t."id" = r."tableId"`);
    await queryRunner.query(`CREATE INDEX "IDX_registrations_rank" ON "table_registrations" ("tableId", "rankScore")`);

    await queryRunner.query(`
      ALTER TABLE "activities" ADD COLUMN "elevationGainMetres" integer CHECK ("elevationGainMetres" >= 0),
        ADD COLUMN "stepsSource" varchar(12) CHECK ("stepsSource" IN ('sensor','estimate'))`);
    await queryRunner.query(`
      UPDATE "activities" SET "stepsSource" = CASE
        WHEN "source" = 'jump' AND "recordedSteps" > 0 THEN 'sensor'
        WHEN "source" = 'strava' AND "activityType" <> 'cycle' THEN 'estimate' END`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "activities" DROP COLUMN "stepsSource", DROP COLUMN "elevationGainMetres"`);
    await queryRunner.query(`DROP INDEX "IDX_registrations_rank"`);
    await queryRunner.query(`
      ALTER TABLE "table_registrations" DROP COLUMN "qualified", DROP COLUMN "scoredAt", DROP COLUMN "targetReachedAt",
        DROP COLUMN "rankScore", DROP COLUMN "score"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP CONSTRAINT "competition_tables_scoringMethod_check"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD CONSTRAINT "competition_tables_scoringMethod_check" CHECK ("scoringMethod" IN ('MOST_STEPS','FARTHEST_DISTANCE','FASTEST_FIXED_DISTANCE','FASTEST_TIME'))`);
    await queryRunner.query(`
      ALTER TABLE "competition_tables" DROP CONSTRAINT "competition_tables_targets_check", DROP CONSTRAINT "competition_tables_rules_version_check",
        DROP CONSTRAINT "competition_tables_format_check"`);
    await queryRunner.query(`
      ALTER TABLE "competition_tables" DROP COLUMN "rulesVersion", DROP COLUMN "timeZone", DROP COLUMN "format",
        DROP COLUMN "eligibleActivities", DROP COLUMN "minActivitySeconds", DROP COLUMN "minActivityMetres",
        DROP COLUMN "minSessions", DROP COLUMN "dailyTarget", DROP COLUMN "targetSessions", DROP COLUMN "targetSeconds", DROP COLUMN "targetSteps"`);
  }
}
