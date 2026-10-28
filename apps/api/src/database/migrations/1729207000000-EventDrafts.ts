import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventDrafts1729207000000 implements MigrationInterface {
  name = 'EventDrafts1729207000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "club_events" ADD "publishedAt" timestamptz`);
    await queryRunner.query(`UPDATE "club_events" SET "publishedAt" = "createdAt"`);
    for (const column of ['venue', 'latitude', 'longitude']) {
      await queryRunner.query(`ALTER TABLE "club_events" ALTER COLUMN "${column}" DROP NOT NULL`);
    }
    await queryRunner.query(`ALTER TABLE "club_events" ADD CONSTRAINT "club_events_published_place" CHECK (
      "publishedAt" IS NULL OR ("venue" IS NOT NULL AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "club_events" DROP CONSTRAINT "club_events_published_place"`);
    await queryRunner.query(`DELETE FROM "club_events" WHERE "venue" IS NULL OR "latitude" IS NULL OR "longitude" IS NULL`);
    for (const column of ['venue', 'latitude', 'longitude']) {
      await queryRunner.query(`ALTER TABLE "club_events" ALTER COLUMN "${column}" SET NOT NULL`);
    }
    await queryRunner.query(`ALTER TABLE "club_events" DROP COLUMN "publishedAt"`);
  }
}
