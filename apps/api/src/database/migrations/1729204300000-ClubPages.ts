import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClubPages1729204300000 implements MigrationInterface {
  name = 'ClubPages1729204300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clubs"
        ADD COLUMN "description" varchar(600),
        ADD COLUMN "logoUrl" text,
        ADD COLUMN "accentColor" varchar(7) NOT NULL DEFAULT '#FF5A1F' CHECK ("accentColor" ~ '^#[0-9A-Fa-f]{6}$'),
        ADD COLUMN "location" varchar(80),
        ADD COLUMN "website" varchar(200),
        ADD COLUMN "instagram" varchar(40),
        ADD COLUMN "privacy" varchar(10) NOT NULL DEFAULT 'open' CHECK ("privacy" IN ('open','invite')),
        ADD COLUMN "inviteCode" varchar(16),
        ADD COLUMN "updatedAt" timestamptz NOT NULL DEFAULT now()`);
    await queryRunner.query(`UPDATE "clubs" SET "inviteCode" = upper(substr(md5(random()::text || "id"::text), 1, 10))`);
    await queryRunner.query(`ALTER TABLE "clubs" ALTER COLUMN "inviteCode" SET NOT NULL, ADD CONSTRAINT "UQ_clubs_invite_code" UNIQUE ("inviteCode")`);
    await queryRunner.query(`CREATE INDEX "IDX_club_memberships_user" ON "club_memberships" ("userId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_club_memberships_user"`);
    await queryRunner.query(`
      ALTER TABLE "clubs" DROP CONSTRAINT "UQ_clubs_invite_code", DROP COLUMN "updatedAt", DROP COLUMN "inviteCode", DROP COLUMN "privacy",
        DROP COLUMN "instagram", DROP COLUMN "website", DROP COLUMN "location", DROP COLUMN "accentColor", DROP COLUMN "logoUrl", DROP COLUMN "description"`);
  }
}
