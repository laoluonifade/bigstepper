import { MigrationInterface, QueryRunner } from 'typeorm';

export class GoogleSignIn1729205900000 implements MigrationInterface {
  name = 'GoogleSignIn1729205900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "googleSub" varchar(64)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "users_google_sub_idx" ON "users" ("googleSub") WHERE "googleSub" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "users_google_sub_idx"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "googleSub"`);
  }
}
