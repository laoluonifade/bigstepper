import { MigrationInterface, QueryRunner } from 'typeorm';

/** Owners and managers can lock a club chat so only they can send (members still read). */
export class ClubChatLock1729204800000 implements MigrationInterface {
  name = 'ClubChatLock1729204800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clubs" ADD COLUMN "chatLocked" boolean NOT NULL DEFAULT false`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clubs" DROP COLUMN "chatLocked"`);
  }
}
