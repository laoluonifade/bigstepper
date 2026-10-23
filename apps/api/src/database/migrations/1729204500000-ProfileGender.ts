import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProfileGender1729204500000 implements MigrationInterface {
  name = 'ProfileGender1729204500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN "gender" varchar(20) CHECK ("gender" IN ('male','female','non_binary','prefer_not_to_say'))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "gender"`);
  }
}
