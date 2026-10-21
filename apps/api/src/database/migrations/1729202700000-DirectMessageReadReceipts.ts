import { MigrationInterface, QueryRunner } from 'typeorm';

export class DirectMessageReadReceipts1729202700000 implements MigrationInterface {
  name = 'DirectMessageReadReceipts1729202700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD COLUMN "readAt" timestamptz`);
    await queryRunner.query(`CREATE INDEX "direct_messages_unread_idx" ON "direct_messages" ("recipientId", "senderId") WHERE "readAt" IS NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "direct_messages_unread_idx"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP COLUMN "readAt"`);
  }
}
