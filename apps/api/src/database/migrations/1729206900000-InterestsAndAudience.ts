import { MigrationInterface, QueryRunner } from 'typeorm';

export class InterestsAndAudience1729206900000 implements MigrationInterface {
  name = 'InterestsAndAudience1729206900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" ADD "interests" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD "enrolAudience" varchar(8) NOT NULL DEFAULT 'all' CHECK ("enrolAudience" IN ('all','run','walk','cycle'))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "enrolAudience"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "interests"`);
  }
}
