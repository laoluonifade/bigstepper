import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllDaySteps1793448200000 implements MigrationInterface {
  name = 'AllDaySteps1793448200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "daily_steps" (
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "day" date NOT NULL,
        "steps" integer NOT NULL CHECK ("steps" >= 0),
        "source" varchar(20) NOT NULL DEFAULT 'apple_health',
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("userId", "day")
      )`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD "allDaySteps" boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "allDaySteps"`);
    await queryRunner.query(`DROP TABLE "daily_steps"`);
  }
}
