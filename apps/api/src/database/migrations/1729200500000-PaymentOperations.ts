import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentOperations1729200500000 implements MigrationInterface {
  name = 'PaymentOperations1729200500000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_intents" ADD COLUMN "providerTransactionId" varchar`);
    await queryRunner.query(`ALTER TABLE "payment_intents" ADD COLUMN "expiresAt" timestamptz NOT NULL DEFAULT (now() + interval '20 minutes')`);
    await queryRunner.query(`CREATE INDEX "payment_intents_user_table_idx" ON "payment_intents" ("userId","tableId")`);
    await queryRunner.query(`ALTER TABLE "table_registrations" ADD COLUMN "paymentIntentId" uuid UNIQUE REFERENCES "payment_intents"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`
      CREATE TABLE "refund_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "paymentIntentId" uuid NOT NULL REFERENCES "payment_intents"("id") ON DELETE RESTRICT,
        "amountKobo" bigint NOT NULL CHECK ("amountKobo" > 0), "currency" varchar(3) NOT NULL,
        "status" varchar NOT NULL DEFAULT 'PENDING', "providerRefundId" varchar, "reason" varchar NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "refund_one_active_per_payment" ON "refund_requests" ("paymentIntentId") WHERE "status" IN ('PENDING','PROCESSING','SUCCEEDED')`);
    await queryRunner.query(`
      CREATE TABLE "prize_awards" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tableId" uuid NOT NULL REFERENCES "competition_tables"("id") ON DELETE RESTRICT,
        "winnerUserId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT, "amountKobo" bigint NOT NULL CHECK ("amountKobo" > 0),
        "currency" varchar(3) NOT NULL DEFAULT 'NGN', "status" varchar NOT NULL DEFAULT 'PENDING_APPROVAL', "createdAt" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("tableId")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "payout_recipients" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE RESTRICT,
        "providerRecipientCode" varchar NOT NULL UNIQUE, "accountName" varchar NOT NULL, "bankCode" varchar NOT NULL,
        "accountLast4" varchar(4) NOT NULL, "currency" varchar(3) NOT NULL DEFAULT 'NGN', "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "payout_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "awardId" uuid NOT NULL UNIQUE REFERENCES "prize_awards"("id") ON DELETE RESTRICT,
        "recipientId" uuid NOT NULL REFERENCES "payout_recipients"("id") ON DELETE RESTRICT, "status" varchar NOT NULL DEFAULT 'PENDING_APPROVAL',
        "approvedByUserId" uuid REFERENCES "users"("id") ON DELETE RESTRICT, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "payout_attempts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "payoutRequestId" uuid NOT NULL REFERENCES "payout_requests"("id") ON DELETE RESTRICT,
        "reference" varchar NOT NULL UNIQUE, "providerTransferCode" varchar, "status" varchar NOT NULL DEFAULT 'INITIATED',
        "providerPayload" jsonb NOT NULL DEFAULT '{}'::jsonb, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "reconciliation_runs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "provider" varchar NOT NULL, "status" varchar NOT NULL DEFAULT 'RUNNING',
        "summary" jsonb NOT NULL DEFAULT '{}'::jsonb, "startedAt" timestamptz NOT NULL DEFAULT now(), "completedAt" timestamptz
      )
    `);
    await queryRunner.query(`INSERT INTO "ledger_accounts" ("code","name","currency","type") VALUES ('processor_clearing','Paystack clearing','NGN','asset'),('contest_entry_liability','Contest entry liability','NGN','liability') ON CONFLICT ("code") DO NOTHING`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "reconciliation_runs"`);
    await queryRunner.query(`DROP TABLE "payout_attempts"`);
    await queryRunner.query(`DROP TABLE "payout_requests"`);
    await queryRunner.query(`DROP TABLE "payout_recipients"`);
    await queryRunner.query(`DROP TABLE "prize_awards"`);
    await queryRunner.query(`DROP TABLE "refund_requests"`);
    await queryRunner.query(`ALTER TABLE "table_registrations" DROP COLUMN "paymentIntentId"`);
    await queryRunner.query(`DROP INDEX "payment_intents_user_table_idx"`);
    await queryRunner.query(`ALTER TABLE "payment_intents" DROP COLUMN "expiresAt"`);
    await queryRunner.query(`ALTER TABLE "payment_intents" DROP COLUMN "providerTransactionId"`);
  }
}
