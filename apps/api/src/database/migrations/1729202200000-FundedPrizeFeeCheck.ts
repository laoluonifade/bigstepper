import { MigrationInterface, QueryRunner } from 'typeorm';

/** Funded free challenges take a 15% fee (and older funded ones kept 0%), which the original check rejected. */
export class FundedPrizeFeeCheck1729202200000 implements MigrationInterface {
  name = 'FundedPrizeFeeCheck1729202200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP CONSTRAINT "competition_tables_platformFeeBps_check"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD CONSTRAINT "competition_tables_platformFeeBps_check" CHECK ("platformFeeBps" IN (0,1500,3000,3500))`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP CONSTRAINT "competition_creator_fee_check"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD CONSTRAINT "competition_creator_fee_check" CHECK (
      ("creatorCommissionBps"=0 AND "platformFeeBps" IN (0,1500,3000)) OR ("creatorCommissionBps"=500 AND "platformFeeBps"=3500)
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP CONSTRAINT "competition_creator_fee_check"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD CONSTRAINT "competition_creator_fee_check" CHECK (("creatorCommissionBps"=0 AND "platformFeeBps"=3000) OR ("creatorCommissionBps"=500 AND "platformFeeBps"=3500))`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP CONSTRAINT "competition_tables_platformFeeBps_check"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD CONSTRAINT "competition_tables_platformFeeBps_check" CHECK ("platformFeeBps" IN (3000,3500))`);
  }
}
