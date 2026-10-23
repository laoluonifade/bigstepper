import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Product prize sponsorship: brands and run clubs (sponsors) put products up as prizes for a competition's
 * top places, instead of cash.
 *
 * - sponsors / sponsor_members: the brand or club, its default delivery countries, and who acts for it.
 * - competition_tables gains the prize terms: which sponsor, where prizes can be delivered, who delivers
 *   and pays shipping, the eligibility notes, how long winners have to claim, and when the sponsor committed.
 * - competition_prizes: the product for each winning position.
 * - product_awards: one row per winner and prize, holding the delivery details (only ever shown to the
 *   winner, whoever delivers, and Jump admins) and the fulfilment status.
 */
export class ProductSponsorship1729204900000 implements MigrationInterface {
  name = 'ProductSponsorship1729204900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sponsors" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "kind" varchar(10) NOT NULL CHECK ("kind" IN ('brand','club')),
        "name" varchar(120) NOT NULL,
        "slug" varchar(60) NOT NULL UNIQUE,
        "logoUrl" text,
        "website" varchar(200),
        "description" varchar(600),
        "contactEmail" varchar(200),
        "clubId" uuid REFERENCES "clubs"("id") ON DELETE SET NULL,
        "deliveryCountries" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "status" varchar(12) NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','ACTIVE','SUSPENDED')),
        "createdByUserId" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "reviewedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`
      CREATE TABLE "sponsor_members" (
        "sponsorId" uuid NOT NULL REFERENCES "sponsors"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role" varchar(10) NOT NULL DEFAULT 'manager' CHECK ("role" IN ('owner','manager')),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("sponsorId", "userId")
      )`);
    await queryRunner.query(`CREATE INDEX "IDX_sponsor_members_user" ON "sponsor_members" ("userId")`);

    await queryRunner.query(`
      ALTER TABLE "competition_tables"
        ADD COLUMN "sponsorId" uuid REFERENCES "sponsors"("id") ON DELETE RESTRICT,
        ADD COLUMN "prizeDeliveryCountries" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN "prizeFulfilment" varchar(10) CHECK ("prizeFulfilment" IN ('sponsor','jump')),
        ADD COLUMN "prizeShipping" varchar(16) CHECK ("prizeShipping" IN ('sponsor','jump','other')),
        ADD COLUMN "prizeShippingNote" varchar(300),
        ADD COLUMN "prizeEligibilityNote" varchar(600),
        ADD COLUMN "prizeClaimDays" integer NOT NULL DEFAULT 14 CHECK ("prizeClaimDays" BETWEEN 3 AND 60),
        ADD COLUMN "sponsorCommittedAt" timestamptz,
        ADD COLUMN "prizesFinalizedAt" timestamptz`);
    await queryRunner.query(`CREATE INDEX "IDX_competition_tables_sponsor" ON "competition_tables" ("sponsorId") WHERE "sponsorId" IS NOT NULL`);

    await queryRunner.query(`
      CREATE TABLE "competition_prizes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tableId" uuid NOT NULL REFERENCES "competition_tables"("id") ON DELETE CASCADE,
        "position" integer NOT NULL CHECK ("position" BETWEEN 1 AND 100),
        "productName" varchar(120) NOT NULL,
        "description" varchar(600),
        "imageUrl" text,
        "quantity" integer NOT NULL DEFAULT 1 CHECK ("quantity" BETWEEN 1 AND 1000),
        "estimatedValue" integer CHECK ("estimatedValue" >= 0),
        "currency" varchar(3) NOT NULL DEFAULT 'NGN',
        UNIQUE ("tableId", "position")
      )`);

    await queryRunner.query(`
      CREATE TABLE "product_awards" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tableId" uuid NOT NULL REFERENCES "competition_tables"("id") ON DELETE CASCADE,
        "prizeId" uuid NOT NULL REFERENCES "competition_prizes"("id") ON DELETE CASCADE,
        "position" integer NOT NULL,
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "standingRank" integer NOT NULL,
        "status" varchar(24) NOT NULL DEFAULT 'AWAITING_DETAILS' CHECK ("status" IN
          ('AWAITING_DETAILS','DETAILS_SUBMITTED','READY_FOR_DISPATCH','SHIPPED','DELIVERED','FORFEITED','ISSUE')),
        "detailsDueAt" timestamptz NOT NULL,
        "fullName" varchar(120),
        "phone" varchar(30),
        "address" varchar(300),
        "city" varchar(80),
        "region" varchar(80),
        "country" varchar(2),
        "deliveryNotes" varchar(300),
        "trackingNote" varchar(300),
        "issueNote" varchar(500),
        "forfeitReason" varchar(200),
        "submittedAt" timestamptz,
        "shippedAt" timestamptz,
        "deliveredAt" timestamptz,
        "lastReminderAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);
    // One live winner per prize position; forfeited rows stay as history.
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_product_awards_live_position" ON "product_awards" ("tableId", "position") WHERE "status" <> 'FORFEITED'`);
    await queryRunner.query(`CREATE INDEX "IDX_product_awards_user" ON "product_awards" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_product_awards_due" ON "product_awards" ("detailsDueAt") WHERE "status" = 'AWAITING_DETAILS'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "product_awards"`);
    await queryRunner.query(`DROP TABLE "competition_prizes"`);
    await queryRunner.query(`DROP INDEX "IDX_competition_tables_sponsor"`);
    await queryRunner.query(`
      ALTER TABLE "competition_tables" DROP COLUMN "prizesFinalizedAt", DROP COLUMN "sponsorCommittedAt", DROP COLUMN "prizeClaimDays",
        DROP COLUMN "prizeEligibilityNote", DROP COLUMN "prizeShippingNote", DROP COLUMN "prizeShipping", DROP COLUMN "prizeFulfilment",
        DROP COLUMN "prizeDeliveryCountries", DROP COLUMN "sponsorId"`);
    await queryRunner.query(`DROP TABLE "sponsor_members"`);
    await queryRunner.query(`DROP TABLE "sponsors"`);
  }
}
