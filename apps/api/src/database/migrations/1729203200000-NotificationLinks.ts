import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationLinks1729203200000 implements MigrationInterface {
  name = 'NotificationLinks1729203200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN "link" varchar(300)`);
    // Older notifications only carry a type, so point the ones with a fixed home at it.
    await queryRunner.query(`UPDATE "notifications" SET "link"='/wallet' WHERE "type" LIKE 'PAYOUT_%'`);
    await queryRunner.query(`UPDATE "notifications" SET "link"='/leagues' WHERE "type"='LEAGUE_RESULT'`);
    await queryRunner.query(`UPDATE "notifications" SET "link"='/creator' WHERE "type" IN ('CREATOR_APPROVED','CREATOR_SUSPENDED')`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION notify_competition_join() RETURNS trigger AS $$
      BEGIN
        INSERT INTO "notifications" ("userId","type","title","body","link")
        SELECT t."creatorId",'COMPETITION_JOIN',COALESCE(p."displayName",'A runner') || ' joined your competition',
               'Open ' || t."title" || ' to see the leaderboard.', '/competitions/' || t."code"
        FROM "competition_tables" t LEFT JOIN "profiles" p ON p."userId"=NEW."userId"
        WHERE t."id"=NEW."tableId" AND t."creatorId"<>NEW."userId";
        RETURN NEW;
      END;
    $$ LANGUAGE plpgsql`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE OR REPLACE FUNCTION notify_competition_join() RETURNS trigger AS $$
      BEGIN
        INSERT INTO "notifications" ("userId","type","title","body")
        SELECT t."creatorId",'COMPETITION_JOIN',COALESCE(p."displayName",'A runner') || ' joined your competition',
               'Open ' || t."title" || ' to see the leaderboard.'
        FROM "competition_tables" t LEFT JOIN "profiles" p ON p."userId"=NEW."userId"
        WHERE t."id"=NEW."tableId" AND t."creatorId"<>NEW."userId";
        RETURN NEW;
      END;
    $$ LANGUAGE plpgsql`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "link"`);
  }
}
