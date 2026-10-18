import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinancialSecurityHardening1729200900000 implements MigrationInterface {
  name = 'FinancialSecurityHardening1729200900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payout_recipients" ADD COLUMN "availableForPayoutAt" timestamptz NOT NULL DEFAULT now()`);
    await queryRunner.query(`ALTER TABLE "payout_recipients" ADD COLUMN "updatedAt" timestamptz NOT NULL DEFAULT now()`);
    await queryRunner.query(`ALTER TABLE "wallets" ADD COLUMN "frozenAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "wallets" ADD COLUMN "freezeReason" varchar`);
    await queryRunner.query(`CREATE UNIQUE INDEX "payout_attempts_one_per_request_idx" ON "payout_attempts" ("payoutRequestId")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "payment_intents_provider_transaction_idx" ON "payment_intents" ("providerTransactionId") WHERE "providerTransactionId" IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "payment_intents_provider_transaction_idx"`);
    await queryRunner.query(`DROP INDEX "payout_attempts_one_per_request_idx"`);
    await queryRunner.query(`ALTER TABLE "wallets" DROP COLUMN "freezeReason"`);
    await queryRunner.query(`ALTER TABLE "wallets" DROP COLUMN "frozenAt"`);
    await queryRunner.query(`ALTER TABLE "payout_recipients" DROP COLUMN "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "payout_recipients" DROP COLUMN "availableForPayoutAt"`);
  }
}
