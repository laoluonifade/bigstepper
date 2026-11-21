import { MigrationInterface, QueryRunner } from 'typeorm';
import { recordResults, RESULTS_GRACE_HOURS } from '../../tables/trophies';

export class CompetitionEditions1793448800000 implements MigrationInterface {
  name = 'CompetitionEditions1793448800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "challenge_series" DROP CONSTRAINT IF EXISTS "challenge_series_cadence_check"`);
    await queryRunner.query(`
      ALTER TABLE "challenge_series"
        ALTER COLUMN "cadence" TYPE varchar(8),
        ADD CONSTRAINT "challenge_series_cadence_check" CHECK ("cadence" IN ('daily','weekly','monthly','custom')),
        ADD COLUMN "intervalDays" integer CHECK ("intervalDays" BETWEEN 1 AND 365),
        ADD COLUMN "fillsPeriod" boolean NOT NULL DEFAULT false,
        ADD COLUMN "carryOver" boolean NOT NULL DEFAULT true,
        ADD COLUMN "hostJoins" boolean NOT NULL DEFAULT true,
        ADD CONSTRAINT "challenge_series_custom_interval" CHECK ("cadence" <> 'custom' OR "intervalDays" IS NOT NULL)`);

    await queryRunner.query(`
      ALTER TABLE "competition_tables"
        ADD COLUMN "resultsFinalizedAt" timestamptz,
        ADD COLUMN "medalRule" varchar(10) NOT NULL DEFAULT 'podium' CHECK ("medalRule" IN ('podium','completion')),
        ADD COLUMN "hourFrom" smallint CHECK ("hourFrom" BETWEEN 0 AND 23),
        ADD COLUMN "hourTo" smallint CHECK ("hourTo" BETWEEN 1 AND 24),
        ADD CONSTRAINT "competition_tables_hour_window" CHECK (("hourFrom" IS NULL) = ("hourTo" IS NULL) AND ("hourFrom" IS NULL OR "hourFrom" < "hourTo"))`);
    await queryRunner.query(`CREATE INDEX "IDX_competition_tables_unfinalized" ON "competition_tables" ("scoringClosesAt") WHERE "resultsFinalizedAt" IS NULL AND "deletedAt" IS NULL`);

    await queryRunner.query(`
      CREATE TABLE "competition_results" (
        "tableId" uuid NOT NULL REFERENCES "competition_tables"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "rank" integer NOT NULL,
        "entrants" integer NOT NULL,
        "score" double precision,
        "completed" boolean NOT NULL DEFAULT false,
        "medal" varchar(10) CHECK ("medal" IN ('gold','silver','bronze','completion')),
        "finalizedAt" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("tableId", "userId")
      )`);
    await queryRunner.query(`CREATE INDEX "IDX_competition_results_medals" ON "competition_results" ("userId", "finalizedAt" DESC) WHERE "medal" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_competition_results_board" ON "competition_results" ("tableId", "rank")`);

    await queryRunner.query(`
      CREATE TABLE "hourly_steps" (
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "hour" timestamptz NOT NULL,
        "steps" integer NOT NULL CHECK ("steps" >= 0),
        "countedSteps" integer NOT NULL DEFAULT 0 CHECK ("countedSteps" >= 0),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("userId", "hour")
      )`);

    const ended = await queryRunner.query(
      `SELECT t."id" FROM "competition_tables" t
       WHERE t."deletedAt" IS NULL AND t."status" NOT IN ('CANCELLED','DRAFT','SCHEDULED','PENDING_FUNDING','PENDING_APPROVAL')
         AND (t."status" = 'SETTLED' OR (t."type" = 'free' AND t."scoringClosesAt" <= now() - interval '${RESULTS_GRACE_HOURS} hours'))`,
    ) as Array<{ id: string }>;
    for (let index = 0; index < ended.length; index += 500) {
      const ids = ended.slice(index, index + 500).map((row) => row.id);
      await recordResults(queryRunner.manager, ids);
      await queryRunner.query(
        `UPDATE "competition_tables" SET "resultsFinalizedAt" = now(), "podiumAnnouncedAt" = COALESCE("podiumAnnouncedAt", now()) WHERE "id" = ANY($1::uuid[])`,
        [ids],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "hourly_steps"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "competition_results"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_competition_tables_unfinalized"`);
    await queryRunner.query(`
      ALTER TABLE "competition_tables"
        DROP CONSTRAINT IF EXISTS "competition_tables_hour_window",
        DROP COLUMN IF EXISTS "hourTo",
        DROP COLUMN IF EXISTS "hourFrom",
        DROP COLUMN IF EXISTS "medalRule",
        DROP COLUMN IF EXISTS "resultsFinalizedAt"`);
    await queryRunner.query(`DELETE FROM "challenge_series" WHERE "cadence" IN ('daily','custom')`);
    await queryRunner.query(`
      ALTER TABLE "challenge_series"
        DROP CONSTRAINT IF EXISTS "challenge_series_custom_interval",
        DROP CONSTRAINT IF EXISTS "challenge_series_cadence_check",
        DROP COLUMN IF EXISTS "hostJoins",
        DROP COLUMN IF EXISTS "carryOver",
        DROP COLUMN IF EXISTS "fillsPeriod",
        DROP COLUMN IF EXISTS "intervalDays",
        ADD CONSTRAINT "challenge_series_cadence_check" CHECK ("cadence" IN ('weekly','monthly'))`);
  }
}
