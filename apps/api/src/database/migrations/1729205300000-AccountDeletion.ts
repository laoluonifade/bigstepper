import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountDeletion1729205300000 implements MigrationInterface {
  name = 'AccountDeletion1729205300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A deleted account keeps an anonymous row (payments, payouts and verification records legally have to
    // stay, and reference it); this marks it, so it never shows up or signs in again.
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "deletedAt" timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deletedAt"`);
  }
}
