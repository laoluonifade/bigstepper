import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The admin console moves to admin.startajump.com with its own sign-in: a one-time code emailed to a
 * provisioned admin. Sessions now say which app they belong to, and admin endpoints only accept admin
 * sessions, so signing in to the runner app (even as an admin) never reaches them.
 *
 * Admins are still users with the admin (or compliance) role; the one existing admin keeps theirs.
 */
export class AdminConsole1729204600000 implements MigrationInterface {
  name = 'AdminConsole1729204600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "auth_sessions" ADD COLUMN "scope" varchar(10) NOT NULL DEFAULT 'app' CHECK ("scope" IN ('app','admin'))`);
    await queryRunner.query(`
      CREATE TABLE "admin_login_codes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "purpose" varchar(10) NOT NULL CHECK ("purpose" IN ('login','confirm')),
        "codeHash" varchar(64) NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "expiresAt" timestamptz NOT NULL,
        "usedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`CREATE INDEX "IDX_admin_login_codes_user" ON "admin_login_codes" ("userId", "purpose", "createdAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "admin_login_codes"`);
    await queryRunner.query(`ALTER TABLE "auth_sessions" DROP COLUMN "scope"`);
  }
}
