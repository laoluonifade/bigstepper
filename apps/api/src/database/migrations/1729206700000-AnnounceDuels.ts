import { MigrationInterface, QueryRunner } from 'typeorm';

export class AnnounceDuels1729206700000 implements MigrationInterface {
  name = 'AnnounceDuels1729206700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "notifications" ("userId","type","title","body","link","emailProcessedAt")
      SELECT p."userId", 'FEATURE_DUELS', 'Duels are live on Jump',
             'Challenge a friend: open any chat, tap the swords, set the distance and the clock. First there wins.', '/messages', now()
        FROM "profiles" p
       WHERE NOT EXISTS (SELECT 1 FROM "notifications" n WHERE n."userId" = p."userId" AND n."type" = 'FEATURE_DUELS')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "notifications" WHERE "type" = 'FEATURE_DUELS'`);
  }
}
