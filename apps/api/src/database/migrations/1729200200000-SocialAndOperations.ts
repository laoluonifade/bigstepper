import { MigrationInterface, QueryRunner } from 'typeorm';

export class SocialAndOperations1729200200000 implements MigrationInterface {
  name = 'SocialAndOperations1729200200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "role" varchar NOT NULL DEFAULT 'runner' CHECK ("role" IN ('runner', 'admin', 'compliance'))`);
    await queryRunner.query(`
      CREATE TABLE "consents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" varchar NOT NULL, "version" varchar NOT NULL, "acceptedAt" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("userId", "type", "version")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "user_eligibility" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "adultVerified" boolean NOT NULL DEFAULT false, "countryCode" varchar(2) NOT NULL DEFAULT 'NG',
        "paidCompetitionEligible" boolean NOT NULL DEFAULT false, "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "clubs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "slug" varchar NOT NULL UNIQUE, "name" varchar NOT NULL,
        "ownerUserId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT, "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "club_memberships" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "clubId" uuid NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "role" varchar NOT NULL DEFAULT 'member' CHECK ("role" IN ('owner','admin','member')),
        "joinedAt" timestamptz NOT NULL DEFAULT now(), UNIQUE ("clubId", "userId")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "league_divisions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "name" varchar NOT NULL UNIQUE, "level" integer NOT NULL UNIQUE
      )
    `);
    await queryRunner.query(`INSERT INTO "league_divisions" ("name", "level") VALUES ('Bronze',1),('Silver',2),('Gold',3),('Platinum',4),('Elite',5)`);
    await queryRunner.query(`
      CREATE TABLE "league_seasons" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "name" varchar NOT NULL, "startsAt" timestamptz NOT NULL,
        "endsAt" timestamptz NOT NULL, "status" varchar NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('SCHEDULED','ACTIVE','FINALIZED'))
      )
    `);
    await queryRunner.query(`INSERT INTO "league_seasons" ("name", "startsAt", "endsAt") VALUES ('Founding Season', date_trunc('month', now()), date_trunc('month', now()) + interval '3 months')`);
    await queryRunner.query(`
      CREATE TABLE "league_memberships" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "seasonId" uuid NOT NULL REFERENCES "league_seasons"("id") ON DELETE CASCADE,
        "divisionId" uuid NOT NULL REFERENCES "league_divisions"("id") ON DELETE RESTRICT, "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "creditedDistanceMetres" integer NOT NULL DEFAULT 0 CHECK ("creditedDistanceMetres" >= 0), UNIQUE ("seasonId", "userId")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "league_memberships" ("seasonId", "divisionId", "userId")
      SELECT s."id", d."id", u."id" FROM "users" u CROSS JOIN "league_seasons" s CROSS JOIN "league_divisions" d
      WHERE s."status" = 'ACTIVE' AND d."level" = 1
    `);
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" varchar NOT NULL, "title" varchar NOT NULL, "body" varchar NOT NULL, "readAt" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "notifications_user_unread_idx" ON "notifications" ("userId", "createdAt" DESC) WHERE "readAt" IS NULL`);

    await queryRunner.query(`
      CREATE TABLE "idempotency_keys" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid REFERENCES "users"("id") ON DELETE CASCADE,
        "key" varchar NOT NULL, "scope" varchar NOT NULL, "responseStatus" integer, "responseBody" jsonb,
        "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE ("userId", "scope", "key")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "payment_intents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "tableId" uuid NOT NULL REFERENCES "competition_tables"("id") ON DELETE RESTRICT, "reference" varchar NOT NULL UNIQUE,
        "amountKobo" bigint NOT NULL CHECK ("amountKobo" > 0), "currency" varchar(3) NOT NULL DEFAULT 'NGN',
        "status" varchar NOT NULL DEFAULT 'INITIATED', "providerStatus" varchar, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "provider_webhook_inbox" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "provider" varchar NOT NULL, "dedupeKey" varchar NOT NULL,
        "eventType" varchar NOT NULL, "payload" jsonb NOT NULL, "processedAt" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("provider", "dedupeKey")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "payment_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "paymentIntentId" uuid NOT NULL REFERENCES "payment_intents"("id") ON DELETE RESTRICT,
        "eventType" varchar NOT NULL, "providerEventId" varchar, "payload" jsonb NOT NULL DEFAULT '{}'::jsonb, "createdAt" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("providerEventId")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "ledger_accounts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "code" varchar NOT NULL UNIQUE, "name" varchar NOT NULL,
        "currency" varchar(3) NOT NULL, "type" varchar NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "ledger_journals" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "reference" varchar NOT NULL UNIQUE, "description" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'POSTED' CHECK ("status" IN ('POSTED','REVERSED')), "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "ledger_entries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "journalId" uuid NOT NULL REFERENCES "ledger_journals"("id") ON DELETE RESTRICT,
        "accountId" uuid NOT NULL REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT, "currency" varchar(3) NOT NULL,
        "amountKobo" bigint NOT NULL CHECK ("amountKobo" <> 0), "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ledger_entries"`);
    await queryRunner.query(`DROP TABLE "ledger_journals"`);
    await queryRunner.query(`DROP TABLE "ledger_accounts"`);
    await queryRunner.query(`DROP TABLE "payment_events"`);
    await queryRunner.query(`DROP TABLE "provider_webhook_inbox"`);
    await queryRunner.query(`DROP TABLE "payment_intents"`);
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TABLE "league_memberships"`);
    await queryRunner.query(`DROP TABLE "league_seasons"`);
    await queryRunner.query(`DROP TABLE "league_divisions"`);
    await queryRunner.query(`DROP TABLE "club_memberships"`);
    await queryRunner.query(`DROP TABLE "clubs"`);
    await queryRunner.query(`DROP TABLE "user_eligibility"`);
    await queryRunner.query(`DROP TABLE "consents"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
  }
}
