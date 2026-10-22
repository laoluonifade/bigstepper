import { MigrationInterface, QueryRunner } from 'typeorm';

export class PrivateWeightEstimate1729202800000 implements MigrationInterface {
  name = 'PrivateWeightEstimate1729202800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN "weightKg" real`);
    await queryRunner.query(`ALTER TABLE "profiles" ADD CONSTRAINT "profiles_weight_kg_range" CHECK ("weightKg" IS NULL OR ("weightKg" >= 20 AND "weightKg" <= 300))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" DROP CONSTRAINT "profiles_weight_kg_range"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "weightKg"`);
  }
}
