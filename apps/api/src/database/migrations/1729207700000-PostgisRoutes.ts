import { MigrationInterface, QueryRunner } from 'typeorm';

export class PostgisRoutes1729207700000 implements MigrationInterface {
  name = 'PostgisRoutes1729207700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ available }] = await queryRunner.query(`SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') AS "available"`) as Array<{ available: boolean }>;
    if (!available) return;
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
    await queryRunner.query(`ALTER TABLE "activities" ADD "route" geography(LineString, 4326)`);
    await queryRunner.query(`ALTER TABLE "club_events" ADD "place" geography(Point, 4326) GENERATED ALWAYS AS (
      CASE WHEN "latitude" IS NULL OR "longitude" IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography END) STORED`);
    await queryRunner.query(`CREATE INDEX "club_events_place_idx" ON "club_events" USING GIST ("place")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "club_events_place_idx"`);
    await queryRunner.query(`ALTER TABLE "club_events" DROP COLUMN IF EXISTS "place"`);
    await queryRunner.query(`ALTER TABLE "activities" DROP COLUMN IF EXISTS "route"`);
  }
}
