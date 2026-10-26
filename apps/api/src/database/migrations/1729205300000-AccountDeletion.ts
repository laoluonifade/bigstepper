import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountDeletion1729205300000 implements MigrationInterface {
  name = 'AccountDeletion1729205300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "deletedAt" timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deletedAt"`);
  }
}
