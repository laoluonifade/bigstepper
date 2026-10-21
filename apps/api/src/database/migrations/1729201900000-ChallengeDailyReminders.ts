import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChallengeDailyReminders1729201900000 implements MigrationInterface {
  name = 'ChallengeDailyReminders1729201900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "reminderTime" time`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "reminderTimeZone" varchar(64)`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD CONSTRAINT "challenge_reminder_both_or_neither" CHECK (("reminderTime" IS NULL) = ("reminderTimeZone" IS NULL))`);
    await queryRunner.query(`CREATE TABLE "challenge_reminder_deliveries" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "tableId" uuid NOT NULL REFERENCES "competition_tables"("id") ON DELETE CASCADE,
      "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "reminderDate" date NOT NULL,
      "claimedAt" timestamptz NOT NULL DEFAULT now(),
      "sentAt" timestamptz,
      CONSTRAINT "challenge_reminder_once_per_day" UNIQUE ("tableId", "userId", "reminderDate")
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "challenge_reminder_deliveries"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP CONSTRAINT "challenge_reminder_both_or_neither"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "reminderTimeZone"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "reminderTime"`);
  }
}
