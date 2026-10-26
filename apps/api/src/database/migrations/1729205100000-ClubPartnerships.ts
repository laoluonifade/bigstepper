import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClubPartnerships1729205100000 implements MigrationInterface {
  name = 'ClubPartnerships1729205100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_competition_tables_sponsor"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "sponsorId", DROP COLUMN "sponsorCommittedAt"`);
    await queryRunner.query(`DROP TABLE "sponsor_members"`);
    await queryRunner.query(`DROP TABLE "sponsors"`);

    await queryRunner.query(`
      CREATE TABLE "club_follows" (
        "clubId" uuid NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("clubId", "userId")
      )`);
    await queryRunner.query(`CREATE INDEX "IDX_club_follows_user" ON "club_follows" ("userId")`);
    await queryRunner.query(`INSERT INTO "club_follows" ("clubId","userId","createdAt") SELECT "clubId","userId","joinedAt" FROM "club_memberships" ON CONFLICT DO NOTHING`);

    await queryRunner.query(`
      ALTER TABLE "clubs"
        ADD COLUMN "plan" varchar(12) NOT NULL DEFAULT 'free' CHECK ("plan" IN ('free','pro')),
        ADD COLUMN "planRenewsAt" timestamptz,
        ADD COLUMN "suspendedAt" timestamptz,
        ADD COLUMN "suspendedReason" varchar(300)`);

    await queryRunner.query(`
      CREATE TABLE "challenge_series" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "clubId" uuid NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
        "title" varchar(120) NOT NULL,
        "cadence" varchar(8) NOT NULL CHECK ("cadence" IN ('weekly','monthly')),
        "template" jsonb NOT NULL,
        "autoPublish" boolean NOT NULL DEFAULT true,
        "leadDays" integer NOT NULL DEFAULT 7 CHECK ("leadDays" BETWEEN 0 AND 30),
        "nextStartsAt" timestamptz NOT NULL,
        "lastEdition" integer NOT NULL DEFAULT 1,
        "active" boolean NOT NULL DEFAULT true,
        "createdByUserId" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`CREATE INDEX "IDX_challenge_series_club" ON "challenge_series" ("clubId")`);
    await queryRunner.query(`CREATE INDEX "IDX_challenge_series_due" ON "challenge_series" ("nextStartsAt") WHERE "active"`);

    await queryRunner.query(`
      ALTER TABLE "competition_tables"
        ADD COLUMN "seriesId" uuid REFERENCES "challenge_series"("id") ON DELETE SET NULL,
        ADD COLUMN "edition" integer,
        ADD COLUMN "publishAt" timestamptz,
        ADD COLUMN "eligibleCountries" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN "prizeSelection" varchar(8) NOT NULL DEFAULT 'top' CHECK ("prizeSelection" IN ('top','draw')),
        ADD COLUMN "autoEnrolClub" boolean NOT NULL DEFAULT false,
        ADD COLUMN "promotedUntil" timestamptz`);
    await queryRunner.query(`CREATE INDEX "IDX_competition_tables_series" ON "competition_tables" ("seriesId", "edition") WHERE "seriesId" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_competition_tables_publish" ON "competition_tables" ("publishAt") WHERE "status" = 'SCHEDULED'`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP CONSTRAINT "competition_tables_prizeFulfilment_check", DROP CONSTRAINT "competition_tables_prizeShipping_check"`);
    await queryRunner.query(`
      ALTER TABLE "competition_tables"
        ADD CONSTRAINT "competition_tables_prizeFulfilment_check" CHECK ("prizeFulfilment" IN ('club','jump')),
        ADD CONSTRAINT "competition_tables_prizeShipping_check" CHECK ("prizeShipping" IN ('club','jump','other'))`);

    await queryRunner.query(`
      ALTER TABLE "competition_prizes"
        ADD COLUMN "kind" varchar(12) NOT NULL DEFAULT 'product' CHECK ("kind" IN ('product','discount','experience')),
        ADD COLUMN "redeemInstructions" varchar(600)`);
    await queryRunner.query(`DROP INDEX "UQ_product_awards_live_position"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_product_awards_live_winner" ON "product_awards" ("tableId", "userId") WHERE "status" <> 'FORFEITED'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_product_awards_live_winner"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_product_awards_live_position" ON "product_awards" ("tableId", "position") WHERE "status" <> 'FORFEITED'`);
    await queryRunner.query(`ALTER TABLE "competition_prizes" DROP COLUMN "redeemInstructions", DROP COLUMN "kind"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP CONSTRAINT "competition_tables_prizeFulfilment_check", DROP CONSTRAINT "competition_tables_prizeShipping_check"`);
    await queryRunner.query(`
      ALTER TABLE "competition_tables"
        ADD CONSTRAINT "competition_tables_prizeFulfilment_check" CHECK ("prizeFulfilment" IN ('sponsor','jump')),
        ADD CONSTRAINT "competition_tables_prizeShipping_check" CHECK ("prizeShipping" IN ('sponsor','jump','other'))`);
    await queryRunner.query(`DROP INDEX "IDX_competition_tables_publish"`);
    await queryRunner.query(`DROP INDEX "IDX_competition_tables_series"`);
    await queryRunner.query(`
      ALTER TABLE "competition_tables" DROP COLUMN "promotedUntil", DROP COLUMN "autoEnrolClub", DROP COLUMN "prizeSelection",
        DROP COLUMN "eligibleCountries", DROP COLUMN "publishAt", DROP COLUMN "edition", DROP COLUMN "seriesId"`);
    await queryRunner.query(`DROP TABLE "challenge_series"`);
    await queryRunner.query(`ALTER TABLE "clubs" DROP COLUMN "suspendedReason", DROP COLUMN "suspendedAt", DROP COLUMN "planRenewsAt", DROP COLUMN "plan"`);
    await queryRunner.query(`DROP TABLE "club_follows"`);
    await queryRunner.query(`
      CREATE TABLE "sponsors" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "kind" varchar(10) NOT NULL CHECK ("kind" IN ('brand','club')), "name" varchar(120) NOT NULL,
        "slug" varchar(60) NOT NULL UNIQUE, "logoUrl" text, "website" varchar(200), "description" varchar(600), "contactEmail" varchar(200),
        "clubId" uuid REFERENCES "clubs"("id") ON DELETE SET NULL, "deliveryCountries" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "status" varchar(12) NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','ACTIVE','SUSPENDED')),
        "createdByUserId" uuid REFERENCES "users"("id") ON DELETE SET NULL, "reviewedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`
      CREATE TABLE "sponsor_members" (
        "sponsorId" uuid NOT NULL REFERENCES "sponsors"("id") ON DELETE CASCADE, "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role" varchar(10) NOT NULL DEFAULT 'manager' CHECK ("role" IN ('owner','manager')), "createdAt" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("sponsorId", "userId")
      )`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "sponsorId" uuid REFERENCES "sponsors"("id") ON DELETE RESTRICT, ADD COLUMN "sponsorCommittedAt" timestamptz`);
  }
}
