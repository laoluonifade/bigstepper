import { MigrationInterface, QueryRunner } from 'typeorm';

export class DirectMessageEdits1729203100000 implements MigrationInterface {
  name = 'DirectMessageEdits1729203100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD COLUMN "editedAt" timestamptz`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP COLUMN "editedAt"`);
  }
}
