import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaidCompetitions1729200600000 implements MigrationInterface {
  name = 'PaidCompetitions1729200600000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "guaranteedPrizeKobo" bigint CHECK ("guaranteedPrizeKobo" > 0)`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "minimumEntrants" integer NOT NULL DEFAULT 1 CHECK ("minimumEntrants" > 0)`);
    await queryRunner.query(`
      CREATE TABLE "organizer_approvals" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE RESTRICT,
        "status" varchar NOT NULL CHECK ("status" IN ('PENDING','APPROVED','REVOKED')), "approvedByUserId" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
        "expiresAt" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "organizer_approvals"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "minimumEntrants"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "guaranteedPrizeKobo"`);
  }
}
