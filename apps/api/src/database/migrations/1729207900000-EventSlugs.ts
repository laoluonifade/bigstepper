import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventSlugs1729207900000 implements MigrationInterface {
  name = 'EventSlugs1729207900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "club_events" ADD "slug" varchar(90)`);
    await queryRunner.query(`
      WITH base AS (
        SELECT "id", "createdAt", left(trim(both '-' FROM regexp_replace(lower("title"), '[^a-z0-9]+', '-', 'g')), 80) AS "name" FROM "club_events"
      ), named AS (
        SELECT "id", CASE WHEN "name" IN ('', 'drafts') THEN 'event' ELSE "name" END AS "name", "createdAt" FROM base
      ), ranked AS (
        SELECT "id", "name", row_number() OVER (PARTITION BY "name" ORDER BY "createdAt", "id") AS "n" FROM named
      )
      UPDATE "club_events" e SET "slug" = CASE WHEN r."n" = 1 THEN r."name" ELSE r."name" || '-' || left(replace(e."id"::text, '-', ''), 4) END
      FROM ranked r WHERE r."id" = e."id"`);
    await queryRunner.query(`ALTER TABLE "club_events" ALTER COLUMN "slug" SET NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "club_events_slug_idx" ON "club_events" ("slug")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "club_events_slug_idx"`);
    await queryRunner.query(`ALTER TABLE "club_events" DROP COLUMN "slug"`);
  }
}
