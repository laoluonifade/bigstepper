import { MigrationInterface, QueryRunner } from 'typeorm';

export class PreserveFundedPrizeTerms1729201900000 implements MigrationInterface {
  name = 'PreserveFundedPrizeTerms1729201900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "competition_tables" SET "platformFeeBps"=0 WHERE "type"='sponsored' AND "fundedAt" IS NOT NULL`);
  }

  async down(): Promise<void> {
  }
}
