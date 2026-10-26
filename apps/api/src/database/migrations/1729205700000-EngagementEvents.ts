import { MigrationInterface, QueryRunner } from 'typeorm';

export class EngagementEvents1729205700000 implements MigrationInterface {
  name = 'EngagementEvents1729205700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "engagement_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "type" varchar(16) NOT NULL,
        "clubId" uuid REFERENCES "clubs"("id") ON DELETE CASCADE,
        "tableId" uuid REFERENCES "competition_tables"("id") ON DELETE CASCADE,
        "viewerId" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "anonKey" varchar(64),
        "channel" varchar(16),
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`CREATE INDEX "engagement_events_club_idx" ON "engagement_events" ("clubId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "engagement_events_table_idx" ON "engagement_events" ("tableId", "createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "engagement_events"`);
  }
}
