import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChallengeRewardsAndInvites1729201800000 implements MigrationInterface {
  name = 'ChallengeRewardsAndInvites1729201800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "prizeSplitBps" jsonb NOT NULL DEFAULT '[10000]'::jsonb`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "fundedAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "payment_intents" DROP CONSTRAINT IF EXISTS "payment_intents_purpose_check"`);
    await queryRunner.query(`ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_purpose_check" CHECK ("purpose" IN ('CHALLENGE_ENTRY','WALLET_FUNDING','SPONSOR_FUNDING'))`);
    await queryRunner.query(`ALTER TABLE "prize_awards" DROP CONSTRAINT IF EXISTS "prize_awards_tableId_key"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "prize_awards_table_winner_idx" ON "prize_awards" ("tableId","winnerUserId")`);
    await queryRunner.query(`ALTER TABLE "prize_awards" ADD COLUMN "place" integer NOT NULL DEFAULT 1 CHECK ("place" > 0)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "prize_awards_table_place_idx" ON "prize_awards" ("tableId","place")`);
    await queryRunner.query(`INSERT INTO "table_registrations" ("tableId","userId") SELECT "id","creatorId" FROM "competition_tables" ON CONFLICT ("tableId","userId") DO NOTHING`);
    await queryRunner.query(`INSERT INTO "ledger_accounts" ("code","name","currency","type") VALUES ('sponsor_prize_liability','Funded free-challenge prizes','NGN','liability') ON CONFLICT ("code") DO NOTHING`);
    await queryRunner.query(`
      CREATE TABLE "challenge_invitations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tableId" uuid NOT NULL REFERENCES "competition_tables"("id") ON DELETE CASCADE,
        "invitedUserId" uuid REFERENCES "users"("id") ON DELETE CASCADE,
        "email" varchar(254), "phone" varchar(20),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "challenge_invitation_target_check" CHECK (num_nonnulls("invitedUserId","email","phone") = 1)
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "challenge_invitations_user_idx" ON "challenge_invitations" ("tableId","invitedUserId") WHERE "invitedUserId" IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "challenge_invitations_email_idx" ON "challenge_invitations" ("tableId","email") WHERE "email" IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "challenge_invitations_phone_idx" ON "challenge_invitations" ("tableId","phone") WHERE "phone" IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "challenge_invitations"`);
    await queryRunner.query(`DROP INDEX "prize_awards_table_place_idx"`);
    await queryRunner.query(`ALTER TABLE "prize_awards" DROP COLUMN "place"`);
    await queryRunner.query(`DROP INDEX "prize_awards_table_winner_idx"`);
    await queryRunner.query(`ALTER TABLE "prize_awards" ADD CONSTRAINT "prize_awards_tableId_key" UNIQUE ("tableId")`);
    await queryRunner.query(`ALTER TABLE "payment_intents" DROP CONSTRAINT "payment_intents_purpose_check"`);
    await queryRunner.query(`ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_purpose_check" CHECK ("purpose" IN ('CHALLENGE_ENTRY','WALLET_FUNDING'))`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "fundedAt"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "prizeSplitBps"`);
  }
}
