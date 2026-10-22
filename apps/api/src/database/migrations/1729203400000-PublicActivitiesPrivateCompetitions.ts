import { MigrationInterface, QueryRunner } from 'typeorm';

export class PublicActivitiesPrivateCompetitions1729203400000 implements MigrationInterface {
  name = 'PublicActivitiesPrivateCompetitions1729203400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Every runner's activities are public now; privacy moves to competitions instead.
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "activityVisibility"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "visibility" varchar(10) NOT NULL DEFAULT 'public'`);
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN "streakReminderSentOn" date`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "streakReminderSentOn"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "visibility"`);
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN "activityVisibility" varchar NOT NULL DEFAULT 'public'`);
  }
}
