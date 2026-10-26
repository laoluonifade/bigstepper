import { MigrationInterface, QueryRunner } from 'typeorm';

export class PayoutReview1729201600000 implements MigrationInterface {
  name = 'PayoutReview1729201600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payout_requests" ADD COLUMN "rejectionReason" varchar(300)`);
    await queryRunner.query(`ALTER TABLE "payout_requests" ADD COLUMN "reviewedAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "payout_requests" DROP CONSTRAINT "payout_requests_awardId_key"`);
    await queryRunner.query(`ALTER TABLE "payout_requests" DROP CONSTRAINT "payout_requests_creatorEarningId_key"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_payout_requests_award_live" ON "payout_requests" ("awardId") WHERE "status" <> 'REJECTED'`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_payout_requests_earning_live" ON "payout_requests" ("creatorEarningId") WHERE "status" <> 'REJECTED'`);
    await queryRunner.query(`CREATE INDEX "IDX_payout_requests_status" ON "payout_requests" ("status", "createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_payout_requests_status"`);
    await queryRunner.query(`DROP INDEX "UQ_payout_requests_earning_live"`);
    await queryRunner.query(`DROP INDEX "UQ_payout_requests_award_live"`);
    await queryRunner.query(`ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_creatorEarningId_key" UNIQUE ("creatorEarningId")`);
    await queryRunner.query(`ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_awardId_key" UNIQUE ("awardId")`);
    await queryRunner.query(`ALTER TABLE "payout_requests" DROP COLUMN "reviewedAt"`);
    await queryRunner.query(`ALTER TABLE "payout_requests" DROP COLUMN "rejectionReason"`);
  }
}
