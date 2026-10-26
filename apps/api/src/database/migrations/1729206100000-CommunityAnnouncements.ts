import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunityAnnouncements1729206100000 implements MigrationInterface {
  name = 'CommunityAnnouncements1729206100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "communityClubAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD "announcedAt" timestamptz`);
    await queryRunner.query(`UPDATE "competition_tables" SET "announcedAt" = now()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "announcedAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "communityClubAt"`);
  }
}
