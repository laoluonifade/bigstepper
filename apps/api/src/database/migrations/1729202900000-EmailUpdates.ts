import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailUpdates1729202900000 implements MigrationInterface {
  name = 'EmailUpdates1729202900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN "emailActivityEnabled" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN "emailDigestEnabled" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN "digestNextAt" timestamptz NOT NULL DEFAULT (now() + interval '3 days')`);
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN "digestClaimedAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN "emailClaimedAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN "emailProcessedAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN "emailSentAt" timestamptz`);
    await queryRunner.query(`UPDATE "notifications" SET "emailProcessedAt"=now()`);
    await queryRunner.query(`CREATE INDEX "notifications_email_pending_idx" ON "notifications" ("createdAt", "id") WHERE "emailProcessedAt" IS NULL`);
    await queryRunner.query(`CREATE INDEX "profiles_digest_due_idx" ON "profiles" ("digestNextAt", "userId") WHERE "emailDigestEnabled"=true`);
    await queryRunner.query(`CREATE FUNCTION notify_competition_join() RETURNS trigger AS $$
      BEGIN
        INSERT INTO "notifications" ("userId","type","title","body")
        SELECT t."creatorId",'COMPETITION_JOIN',COALESCE(p."displayName",'A runner') || ' joined your competition',
               'Open ' || t."title" || ' to see the leaderboard.'
        FROM "competition_tables" t LEFT JOIN "profiles" p ON p."userId"=NEW."userId"
        WHERE t."id"=NEW."tableId" AND t."creatorId"<>NEW."userId";
        RETURN NEW;
      END;
    $$ LANGUAGE plpgsql`);
    await queryRunner.query(`CREATE TRIGGER table_registration_join_notice AFTER INSERT ON "table_registrations"
      FOR EACH ROW EXECUTE FUNCTION notify_competition_join()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER table_registration_join_notice ON "table_registrations"`);
    await queryRunner.query(`DROP FUNCTION notify_competition_join()`);
    await queryRunner.query(`DROP INDEX "profiles_digest_due_idx"`);
    await queryRunner.query(`DROP INDEX "notifications_email_pending_idx"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "emailSentAt"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "emailProcessedAt"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "emailClaimedAt"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "digestClaimedAt"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "digestNextAt"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "emailDigestEnabled"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "emailActivityEnabled"`);
  }
}
