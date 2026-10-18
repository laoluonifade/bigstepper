import { MigrationInterface, QueryRunner } from 'typeorm';

export class JumpCreatorsWalletsAndScoring1729200700000 implements MigrationInterface {
  name = 'JumpCreatorsWalletsAndScoring1729200700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "creator_profiles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "creatorType" varchar NOT NULL CHECK ("creatorType" IN ('influencer','community_manager','run_club','other')),
        "displayName" varchar NOT NULL, "socialUrl" varchar, "bio" varchar(500),
        "status" varchar NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','SUSPENDED')),
        "commissionBps" integer NOT NULL DEFAULT 500 CHECK ("commissionBps" = 500),
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`ALTER TABLE "running_sessions" ADD COLUMN "activityType" varchar NOT NULL DEFAULT 'run' CHECK ("activityType" IN ('walk','run'))`);
    await queryRunner.query(`ALTER TABLE "running_sessions" ADD COLUMN "stepCount" integer NOT NULL DEFAULT 0 CHECK ("stepCount" >= 0)`);
    await queryRunner.query(`ALTER TABLE "gps_samples" ADD COLUMN "stepCount" integer CHECK ("stepCount" >= 0)`);
    await queryRunner.query(`ALTER TABLE "activities" ADD COLUMN "activityType" varchar NOT NULL DEFAULT 'run' CHECK ("activityType" IN ('walk','run'))`);
    await queryRunner.query(`ALTER TABLE "activities" ADD COLUMN "recordedSteps" integer NOT NULL DEFAULT 0 CHECK ("recordedSteps" >= 0)`);
    await queryRunner.query(`ALTER TABLE "activities" ADD COLUMN "validatedSteps" integer NOT NULL DEFAULT 0 CHECK ("validatedSteps" >= 0)`);

    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "challengeType" varchar NOT NULL DEFAULT 'RUN' CHECK ("challengeType" IN ('WALK','RUN','DISTANCE','STEP','TIMED'))`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "scoringMethod" varchar NOT NULL DEFAULT 'FARTHEST_DISTANCE' CHECK ("scoringMethod" IN ('MOST_STEPS','FARTHEST_DISTANCE','FASTEST_FIXED_DISTANCE','FASTEST_TIME'))`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "targetDistanceMetres" integer CHECK ("targetDistanceMetres" > 0)`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "communityId" uuid REFERENCES "clubs"("id") ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "platformFeeBps" integer NOT NULL DEFAULT 3000 CHECK ("platformFeeBps" IN (3000,3500))`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "creatorCommissionBps" integer NOT NULL DEFAULT 0 CHECK ("creatorCommissionBps" IN (0,500))`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD CONSTRAINT "competition_creator_fee_check" CHECK (("creatorCommissionBps"=0 AND "platformFeeBps"=3000) OR ("creatorCommissionBps"=500 AND "platformFeeBps"=3500))`);

    await queryRunner.query(`ALTER TABLE "table_registrations" ADD COLUMN "creditedSteps" integer NOT NULL DEFAULT 0 CHECK ("creditedSteps" >= 0)`);
    await queryRunner.query(`ALTER TABLE "table_registrations" ADD COLUMN "completionTimeSeconds" integer CHECK ("completionTimeSeconds" > 0)`);
    await queryRunner.query(`ALTER TABLE "table_activity_credits" ADD COLUMN "creditedSteps" integer NOT NULL DEFAULT 0 CHECK ("creditedSteps" >= 0)`);
    await queryRunner.query(`ALTER TABLE "table_activity_credits" ADD COLUMN "completionTimeSeconds" integer CHECK ("completionTimeSeconds" > 0)`);

    await queryRunner.query(`ALTER TABLE "payment_intents" ALTER COLUMN "tableId" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "payment_intents" ADD COLUMN "purpose" varchar NOT NULL DEFAULT 'CHALLENGE_ENTRY' CHECK ("purpose" IN ('CHALLENGE_ENTRY','WALLET_FUNDING'))`);

    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE RESTRICT,
        "balanceKobo" bigint NOT NULL DEFAULT 0 CHECK ("balanceKobo" >= 0), "currency" varchar(3) NOT NULL DEFAULT 'NGN',
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "wallet_transactions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "walletId" uuid NOT NULL REFERENCES "wallets"("id") ON DELETE RESTRICT,
        "type" varchar NOT NULL CHECK ("type" IN ('FUNDING','CHALLENGE_ENTRY','REFUND')),
        "amountKobo" bigint NOT NULL CHECK ("amountKobo" <> 0), "balanceAfterKobo" bigint NOT NULL CHECK ("balanceAfterKobo" >= 0),
        "reference" varchar NOT NULL UNIQUE, "description" varchar NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`ALTER TABLE "prize_awards" ADD COLUMN "grossPrizeKobo" bigint`);
    await queryRunner.query(`ALTER TABLE "prize_awards" ADD COLUMN "platformFeeKobo" bigint NOT NULL DEFAULT 0 CHECK ("platformFeeKobo" >= 0)`);
    await queryRunner.query(`ALTER TABLE "prize_awards" ADD COLUMN "creatorCommissionKobo" bigint NOT NULL DEFAULT 0 CHECK ("creatorCommissionKobo" >= 0)`);
    await queryRunner.query(`UPDATE "prize_awards" SET "grossPrizeKobo"="amountKobo"`);
    await queryRunner.query(`ALTER TABLE "prize_awards" ALTER COLUMN "grossPrizeKobo" SET NOT NULL`);
    await queryRunner.query(`
      CREATE TABLE "creator_earnings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "creatorProfileId" uuid NOT NULL REFERENCES "creator_profiles"("id") ON DELETE RESTRICT,
        "tableId" uuid NOT NULL UNIQUE REFERENCES "competition_tables"("id") ON DELETE RESTRICT,
        "grossPrizeKobo" bigint NOT NULL CHECK ("grossPrizeKobo" > 0), "amountKobo" bigint NOT NULL CHECK ("amountKobo" > 0),
        "currency" varchar(3) NOT NULL DEFAULT 'NGN', "status" varchar NOT NULL DEFAULT 'EARNED',
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`INSERT INTO "ledger_accounts" ("code","name","currency","type") VALUES ('wallet_liability','Non-withdrawable user wallet liability','NGN','liability'),('platform_fee_income','Platform fee income','NGN','income'),('creator_commission_payable','Creator commission payable','NGN','liability') ON CONFLICT ("code") DO NOTHING`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "creator_earnings"`);
    await queryRunner.query(`ALTER TABLE "prize_awards" DROP COLUMN "creatorCommissionKobo"`);
    await queryRunner.query(`ALTER TABLE "prize_awards" DROP COLUMN "platformFeeKobo"`);
    await queryRunner.query(`ALTER TABLE "prize_awards" DROP COLUMN "grossPrizeKobo"`);
    await queryRunner.query(`DROP TABLE "wallet_transactions"`);
    await queryRunner.query(`DROP TABLE "wallets"`);
    await queryRunner.query(`ALTER TABLE "payment_intents" DROP COLUMN "purpose"`);
    await queryRunner.query(`ALTER TABLE "payment_intents" ALTER COLUMN "tableId" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "table_activity_credits" DROP COLUMN "completionTimeSeconds"`);
    await queryRunner.query(`ALTER TABLE "table_activity_credits" DROP COLUMN "creditedSteps"`);
    await queryRunner.query(`ALTER TABLE "table_registrations" DROP COLUMN "completionTimeSeconds"`);
    await queryRunner.query(`ALTER TABLE "table_registrations" DROP COLUMN "creditedSteps"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP CONSTRAINT "competition_creator_fee_check"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "creatorCommissionBps"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "platformFeeBps"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "communityId"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "targetDistanceMetres"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "scoringMethod"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "challengeType"`);
    await queryRunner.query(`ALTER TABLE "activities" DROP COLUMN "validatedSteps"`);
    await queryRunner.query(`ALTER TABLE "activities" DROP COLUMN "recordedSteps"`);
    await queryRunner.query(`ALTER TABLE "activities" DROP COLUMN "activityType"`);
    await queryRunner.query(`ALTER TABLE "gps_samples" DROP COLUMN "stepCount"`);
    await queryRunner.query(`ALTER TABLE "running_sessions" DROP COLUMN "stepCount"`);
    await queryRunner.query(`ALTER TABLE "running_sessions" DROP COLUMN "activityType"`);
    await queryRunner.query(`DROP TABLE "creator_profiles"`);
  }
}
