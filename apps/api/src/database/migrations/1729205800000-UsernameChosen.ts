import { MigrationInterface, QueryRunner } from 'typeorm';

export class UsernameChosen1729205800000 implements MigrationInterface {
  name = 'UsernameChosen1729205800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" ADD "usernameChosen" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`UPDATE "profiles" SET "usernameChosen" = true WHERE "username" !~ '_[0-9a-f]{6}$'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "usernameChosen"`);
  }
}
