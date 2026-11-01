import { MigrationInterface, QueryRunner } from 'typeorm';

export class HealthCounted1793448400000 implements MigrationInterface {
  name = 'HealthCounted1793448400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "daily_steps" ADD "countedSteps" integer NOT NULL DEFAULT 0 CHECK ("countedSteps" >= 0)`);
    await queryRunner.query(`ALTER TABLE "daily_steps" ADD "countedMetres" integer NOT NULL DEFAULT 0 CHECK ("countedMetres" >= 0)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "daily_steps" DROP COLUMN "countedMetres"`);
    await queryRunner.query(`ALTER TABLE "daily_steps" DROP COLUMN "countedSteps"`);
  }
}
