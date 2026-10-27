import { MigrationInterface, QueryRunner } from 'typeorm';

export class SafetyTools1729206300000 implements MigrationInterface {
  name = 'SafetyTools1729206300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_blocks" (
        "blockerId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "blockedId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("blockerId", "blockedId"),
        CONSTRAINT "user_blocks_not_self" CHECK ("blockerId" <> "blockedId")
      )`);
    await queryRunner.query(`CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks" ("blockedId", "blockerId")`);
    await queryRunner.query(`
      CREATE TABLE "content_reports" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "reporterId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "targetType" varchar(16) NOT NULL CHECK ("targetType" IN ('rant','comment','message','profile')),
        "targetId" uuid NOT NULL,
        "targetUserId" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "reason" varchar(24) NOT NULL CHECK ("reason" IN ('harassment','spam','inappropriate','cheating','impersonation','other')),
        "note" varchar(500),
        "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "status" varchar(16) NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','DISMISSED','ACTIONED')),
        "resolution" varchar(16),
        "resolutionNote" varchar(500),
        "resolvedByUserId" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "resolvedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "content_reports_once" UNIQUE ("reporterId", "targetType", "targetId")
      )`);
    await queryRunner.query(`CREATE INDEX "content_reports_queue_idx" ON "content_reports" ("status", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "content_reports_target_idx" ON "content_reports" ("targetType", "targetId")`);
    await queryRunner.query(`ALTER TABLE "users" ADD "suspendedAt" timestamptz, ADD "suspendedReason" varchar(500)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "suspendedReason", DROP COLUMN "suspendedAt"`);
    await queryRunner.query(`DROP TABLE "content_reports"`);
    await queryRunner.query(`DROP TABLE "user_blocks"`);
  }
}
