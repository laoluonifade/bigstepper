import { MigrationInterface, QueryRunner } from 'typeorm';

export class PodiumAnnouncements1729205600000 implements MigrationInterface {
  name = 'PodiumAnnouncements1729205600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // When the top three of a finished competition were told they placed (the "you won" push), so it's once.
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "podiumAnnouncedAt" timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "podiumAnnouncedAt"`);
  }
}
