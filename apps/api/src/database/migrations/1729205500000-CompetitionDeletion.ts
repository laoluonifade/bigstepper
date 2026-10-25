import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompetitionDeletion1729205500000 implements MigrationInterface {
  name = 'CompetitionDeletion1729205500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A host deleting their competition: it's cancelled and marked, then hidden everywhere, link included.
    // The row stays because entries, credits and notifications point at it.
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "deletedAt" timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "deletedAt"`);
  }
}
