import { MigrationInterface, QueryRunner } from 'typeorm';

export class AnnounceEvents1729207300000 implements MigrationInterface {
  name = 'AnnounceEvents1729207300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "notifications" ("userId","type","title","body","link","emailProcessedAt")
      SELECT p."userId", 'FEATURE_EVENTS', 'Events are live on Jump',
             'Find club runs near you, get your pass and a reminder before each one. Run a club? Post yours from Explore.', '/competitions?lens=events', now()
        FROM "profiles" p
       WHERE NOT EXISTS (SELECT 1 FROM "notifications" n WHERE n."userId" = p."userId" AND n."type" = 'FEATURE_EVENTS')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "notifications" WHERE "type" = 'FEATURE_EVENTS'`);
  }
}
