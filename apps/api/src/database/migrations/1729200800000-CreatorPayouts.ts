import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatorPayouts1729200800000 implements MigrationInterface {
  name = 'CreatorPayouts1729200800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payout_requests" ALTER COLUMN "awardId" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "payout_requests" ADD COLUMN "creatorEarningId" uuid UNIQUE REFERENCES "creator_earnings"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_request_one_source_check" CHECK (("awardId" IS NOT NULL)::integer + ("creatorEarningId" IS NOT NULL)::integer = 1)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payout_requests" DROP CONSTRAINT "payout_request_one_source_check"`);
    await queryRunner.query(`ALTER TABLE "payout_requests" DROP COLUMN "creatorEarningId"`);
    await queryRunner.query(`ALTER TABLE "payout_requests" ALTER COLUMN "awardId" SET NOT NULL`);
  }
}
