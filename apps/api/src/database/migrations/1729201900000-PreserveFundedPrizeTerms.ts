import { MigrationInterface, QueryRunner } from 'typeorm';

export class PreserveFundedPrizeTerms1729201900000 implements MigrationInterface {
  name = 'PreserveFundedPrizeTerms1729201900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // These deposits were accepted while the published promise was 100% to winners.
    await queryRunner.query(`UPDATE "competition_tables" SET "platformFeeBps"=0 WHERE "type"='sponsored' AND "fundedAt" IS NOT NULL`);
  }

  async down(): Promise<void> {
    // Financial terms already shown to funders must not be changed by a rollback.
  }
}
