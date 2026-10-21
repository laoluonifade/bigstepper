import { MigrationInterface, QueryRunner } from 'typeorm';

export class CharityFunding1729202400000 implements MigrationInterface {
  name = 'CharityFunding1729202400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "fundingDestination" varchar(16) NOT NULL DEFAULT 'WINNERS'`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "charityName" varchar(120)`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD CONSTRAINT "CHK_challenge_charity_destination" CHECK ("fundingDestination" IN ('WINNERS','CHARITY') AND ("fundingDestination" <> 'CHARITY' OR ("type" = 'sponsored' AND "guaranteedPrizeKobo" IS NOT NULL AND "charityName" IS NOT NULL)))`);
    await queryRunner.query(`CREATE TABLE "charity_allocations" (
      "tableId" uuid PRIMARY KEY REFERENCES "competition_tables"("id"),
      "charityName" varchar(120) NOT NULL,
      "grossKobo" bigint NOT NULL CHECK ("grossKobo" > 0),
      "platformFeeKobo" bigint NOT NULL CHECK ("platformFeeKobo" >= 0),
      "charityKobo" bigint NOT NULL CHECK ("charityKobo" > 0),
      "status" varchar(24) NOT NULL DEFAULT 'PENDING_VERIFICATION' CHECK ("status" = 'PENDING_VERIFICATION'),
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "charity_allocations"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP CONSTRAINT "CHK_challenge_charity_destination"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "charityName"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "fundingDestination"`);
  }
}
