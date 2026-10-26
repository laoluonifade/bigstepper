import { MigrationInterface, QueryRunner } from 'typeorm';

export class AppleSignIn1729206000000 implements MigrationInterface {
  name = 'AppleSignIn1729206000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // "Sign in with Apple": Apple's stable id for the runner, and the refresh token deletion revokes.
    await queryRunner.query(`ALTER TABLE "users" ADD "appleSub" varchar(64)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "appleRefreshToken" varchar(512)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "users_apple_sub_idx" ON "users" ("appleSub") WHERE "appleSub" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "users_apple_sub_idx"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "appleRefreshToken"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "appleSub"`);
  }
}
