import { MigrationInterface, QueryRunner } from 'typeorm';

export class FundedFreeFifteenPercent1729202000000 implements MigrationInterface {
  name = 'FundedFreeFifteenPercent1729202000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "competition_tables" SET "platformFeeBps"=1500 WHERE "type"='sponsored' AND "status"='PENDING_FUNDING' AND "fundedAt" IS NULL`);
  }

  async down(): Promise<void> {
  }
}
