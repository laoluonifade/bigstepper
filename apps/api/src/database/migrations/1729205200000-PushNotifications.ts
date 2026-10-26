import { MigrationInterface, QueryRunner } from 'typeorm';

export class PushNotifications1729205200000 implements MigrationInterface {
  name = 'PushNotifications1729205200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "push_tokens" (
      "token" varchar(255) PRIMARY KEY,
      "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "platform" varchar(16) NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "lastSeenAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_push_tokens_user" ON "push_tokens" ("userId")`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN "pushClaimedAt" timestamptz, ADD COLUMN "pushProcessedAt" timestamptz`);
    await queryRunner.query(`UPDATE "notifications" SET "pushProcessedAt"=now()`);
    await queryRunner.query(`CREATE INDEX "IDX_notifications_push_pending" ON "notifications" ("createdAt") WHERE "pushProcessedAt" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_notifications_push_pending"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "pushProcessedAt", DROP COLUMN "pushClaimedAt"`);
    await queryRunner.query(`DROP TABLE "push_tokens"`);
  }
}
