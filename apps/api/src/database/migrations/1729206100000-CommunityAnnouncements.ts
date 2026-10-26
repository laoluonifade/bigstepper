import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunityAnnouncements1729206100000 implements MigrationInterface {
  name = 'CommunityAnnouncements1729206100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // When each runner was put in the Jump community club: once, so anyone who leaves stays out.
    await queryRunner.query(`ALTER TABLE "users" ADD "communityClubAt" timestamptz`);
    // When everyone heard about a new public competition. What's already out there isn't news.
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD "announcedAt" timestamptz`);
    await queryRunner.query(`UPDATE "competition_tables" SET "announcedAt" = now()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "announcedAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "communityClubAt"`);
  }
}
