import { MigrationInterface, QueryRunner } from 'typeorm';

/** New creators wait for an admin before they can host paid challenges. Existing creators keep their status. */
export class CreatorApproval1729201700000 implements MigrationInterface {
  name = 'CreatorApproval1729201700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "creator_profiles" DROP CONSTRAINT "creator_profiles_status_check"`);
    await queryRunner.query(`ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_status_check" CHECK ("status" IN ('PENDING', 'ACTIVE', 'SUSPENDED'))`);
    await queryRunner.query(`ALTER TABLE "creator_profiles" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
    await queryRunner.query(`ALTER TABLE "creator_profiles" ADD COLUMN "reviewedAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "creator_profiles" ADD COLUMN "reviewedByUserId" uuid REFERENCES "users"("id") ON DELETE SET NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "creator_profiles" DROP COLUMN "reviewedByUserId"`);
    await queryRunner.query(`ALTER TABLE "creator_profiles" DROP COLUMN "reviewedAt"`);
    await queryRunner.query(`ALTER TABLE "creator_profiles" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'`);
    await queryRunner.query(`UPDATE "creator_profiles" SET "status" = 'SUSPENDED' WHERE "status" = 'PENDING'`);
    await queryRunner.query(`ALTER TABLE "creator_profiles" DROP CONSTRAINT "creator_profiles_status_check"`);
    await queryRunner.query(`ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_status_check" CHECK ("status" IN ('ACTIVE', 'SUSPENDED'))`);
  }
}
