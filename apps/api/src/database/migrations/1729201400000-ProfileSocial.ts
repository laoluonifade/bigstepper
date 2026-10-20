import { MigrationInterface, QueryRunner } from 'typeorm';

/** Profile photo (Cloudinary URL), a short bio, and the weekly goal (was browser-only, so it got lost). */
export class ProfileSocial1729201400000 implements MigrationInterface {
  name = 'ProfileSocial1729201400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN "avatarUrl" varchar(500)`);
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN "bio" varchar(160)`);
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD COLUMN "weeklyGoalMetres" integer CHECK ("weeklyGoalMetres" BETWEEN 1000 AND 1000000)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "weeklyGoalMetres"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "bio"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "avatarUrl"`);
  }
}
