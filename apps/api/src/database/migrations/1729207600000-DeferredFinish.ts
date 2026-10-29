import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeferredFinish1729207600000 implements MigrationInterface {
  name = 'DeferredFinish1729207600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "running_sessions" ADD "expectedSamples" integer`);
    await queryRunner.query(`ALTER TABLE "running_sessions" ADD "finishRequestedAt" timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "running_sessions" DROP COLUMN "finishRequestedAt"`);
    await queryRunner.query(`ALTER TABLE "running_sessions" DROP COLUMN "expectedSamples"`);
  }
}
