import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompetitionBanner1729205400000 implements MigrationInterface {
  name = 'CompetitionBanner1729205400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "bannerUrl" varchar(600)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "bannerUrl"`);
  }
}
