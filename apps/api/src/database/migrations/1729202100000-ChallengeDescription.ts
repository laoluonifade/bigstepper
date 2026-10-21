import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChallengeDescription1729202100000 implements MigrationInterface {
  name = 'ChallengeDescription1729202100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "description" varchar(280)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "description"`);
  }
}
