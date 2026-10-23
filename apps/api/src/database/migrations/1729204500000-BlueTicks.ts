import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Blue ticks: an admin can mark a club or a person (once their email is verified) as verified. It's a
 * badge of standing, like Twitter's, not an approval: clubs and people work the same without it.
 */
export class BlueTicks1729204500000 implements MigrationInterface {
  name = 'BlueTicks1729204500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN "verifiedAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "clubs" ADD COLUMN "verifiedAt" timestamptz`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clubs" DROP COLUMN "verifiedAt"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "verifiedAt"`);
  }
}
