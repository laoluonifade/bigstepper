import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Anti-money-laundering controls.
 *
 * - kyc_verifications: Level 2 identity (BVN validated against a named bank account through Paystack). The
 *   Paystack transfer recipient for that account is made at submission and becomes the payout account on success.
 *   The BVN and account number are never stored, only salted hashes and the last four digits. One BVN can
 *   verify one Jump account (partial unique index), so limits can't be spread across accounts.
 * - aml_settings: every threshold, editable by admins, so they can be tuned to real behaviour.
 * - user_devices: device ids and last IP per account, to spot accounts that share a device.
 * - risk_flags: each suspicious pattern found, with its reason and evidence, and how an admin resolved it.
 * - user_risk: the score from those flags, and whether payouts are held. Once an admin releases a hold, the
 *   system only holds the account again for flags raised after that.
 * - payout_requests gains the hold, escalation and the reviewer's written decision.
 * - payout_recipients records whether the account is the KYC-verified one.
 */
export class AmlControls1729205000000 implements MigrationInterface {
  name = 'AmlControls1729205000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "kyc_verifications" (
        "userId" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE RESTRICT,
        "level" integer NOT NULL DEFAULT 0 CHECK ("level" IN (0, 1, 2)),
        "status" varchar(12) NOT NULL DEFAULT 'NONE' CHECK ("status" IN ('NONE','PENDING','VERIFIED','FAILED')),
        "provider" varchar(20) NOT NULL DEFAULT 'paystack',
        "providerCustomerCode" varchar(64),
        "firstName" varchar(80),
        "lastName" varchar(80),
        "bvnHash" varchar(64),
        "bvnLast4" varchar(4),
        "bankCode" varchar(20),
        "accountHash" varchar(64),
        "accountLast4" varchar(4),
        "accountName" varchar(160),
        "recipientCode" varchar(64),
        "failureReason" varchar(300),
        "submittedAt" timestamptz,
        "verifiedAt" timestamptz,
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_kyc_verified_bvn" ON "kyc_verifications" ("bvnHash") WHERE "status" = 'VERIFIED'`);
    await queryRunner.query(`CREATE INDEX "IDX_kyc_customer" ON "kyc_verifications" ("providerCustomerCode")`);
    await queryRunner.query(`CREATE INDEX "IDX_kyc_account" ON "kyc_verifications" ("accountHash")`);

    await queryRunner.query(`
      CREATE TABLE "aml_settings" (
        "id" integer PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
        "values" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "updatedByUserId" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`INSERT INTO "aml_settings" ("id") VALUES (1)`);

    await queryRunner.query(`
      CREATE TABLE "user_devices" (
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "deviceId" varchar(64) NOT NULL,
        "lastIp" varchar(64),
        "firstSeenAt" timestamptz NOT NULL DEFAULT now(),
        "lastSeenAt" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("userId", "deviceId")
      )`);
    await queryRunner.query(`CREATE INDEX "IDX_user_devices_device" ON "user_devices" ("deviceId")`);

    await queryRunner.query(`
      CREATE TABLE "risk_flags" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "rule" varchar(40) NOT NULL,
        "severity" integer NOT NULL CHECK ("severity" BETWEEN 1 AND 3),
        "userId" uuid REFERENCES "users"("id") ON DELETE CASCADE,
        "relatedUserIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "tableId" uuid REFERENCES "competition_tables"("id") ON DELETE SET NULL,
        "payoutRequestId" uuid REFERENCES "payout_requests"("id") ON DELETE SET NULL,
        "reason" varchar(400) NOT NULL,
        "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "fingerprint" varchar(200) NOT NULL UNIQUE,
        "status" varchar(12) NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','DISMISSED','CONFIRMED','ESCALATED')),
        "reviewedByUserId" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "reviewNote" varchar(1000),
        "reviewedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`CREATE INDEX "IDX_risk_flags_user" ON "risk_flags" ("userId", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_risk_flags_open" ON "risk_flags" ("status", "createdAt" DESC)`);

    await queryRunner.query(`
      CREATE TABLE "user_risk" (
        "userId" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "score" integer NOT NULL DEFAULT 0 CHECK ("score" BETWEEN 0 AND 100),
        "level" varchar(8) NOT NULL DEFAULT 'LOW' CHECK ("level" IN ('LOW','MEDIUM','HIGH')),
        "payoutHold" boolean NOT NULL DEFAULT false,
        "holdReason" varchar(300),
        "holdSetBy" varchar(10) CHECK ("holdSetBy" IN ('system','admin')),
        "holdReleasedAt" timestamptz,
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      ALTER TABLE "payout_requests"
        ADD COLUMN "riskHold" boolean NOT NULL DEFAULT false,
        ADD COLUMN "holdReasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN "escalatedAt" timestamptz,
        ADD COLUMN "escalatedByUserId" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        ADD COLUMN "decisionNote" varchar(1000)`);
    await queryRunner.query(`ALTER TABLE "payout_recipients" ADD COLUMN "kycVerified" boolean NOT NULL DEFAULT false, ADD COLUMN "accountHash" varchar(64)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payout_recipients" DROP COLUMN "accountHash", DROP COLUMN "kycVerified"`);
    await queryRunner.query(`ALTER TABLE "payout_requests" DROP COLUMN "decisionNote", DROP COLUMN "escalatedByUserId", DROP COLUMN "escalatedAt", DROP COLUMN "holdReasons", DROP COLUMN "riskHold"`);
    await queryRunner.query(`DROP TABLE "user_risk"`);
    await queryRunner.query(`DROP TABLE "risk_flags"`);
    await queryRunner.query(`DROP TABLE "user_devices"`);
    await queryRunner.query(`DROP TABLE "aml_settings"`);
    await queryRunner.query(`DROP TABLE "kyc_verifications"`);
  }
}
