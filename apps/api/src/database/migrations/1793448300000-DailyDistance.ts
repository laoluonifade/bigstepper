import { MigrationInterface, QueryRunner } from 'typeorm';

export class DailyDistance1793448300000 implements MigrationInterface {
  name = 'DailyDistance1793448300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "daily_steps" ADD "distanceMetres" integer CHECK ("distanceMetres" IS NULL OR "distanceMetres" >= 0)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "daily_steps" DROP COLUMN "distanceMetres"`);
  }
}
