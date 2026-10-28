import { MigrationInterface, QueryRunner } from 'typeorm';

export class DelayedAnnouncements1729207400000 implements MigrationInterface {
  name = 'DelayedAnnouncements1729207400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD "announceAt" timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "announceAt"`);
  }
}
