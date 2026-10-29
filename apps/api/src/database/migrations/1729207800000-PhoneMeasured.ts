import { MigrationInterface, QueryRunner } from 'typeorm';

export class PhoneMeasured1729207800000 implements MigrationInterface {
  name = 'PhoneMeasured1729207800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "activities" ADD "measuredOnPhone" boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "activities" DROP COLUMN "measuredOnPhone"`);
  }
}
