import { MigrationInterface, QueryRunner } from 'typeorm';

export class MessageRepliesAndReactions1729202600000 implements MigrationInterface {
  name = 'MessageRepliesAndReactions1729202600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD COLUMN "replyToId" uuid REFERENCES "direct_messages"("id") ON DELETE SET NULL`);
    await queryRunner.query(`CREATE TABLE "direct_message_reactions" (
      "messageId" uuid NOT NULL REFERENCES "direct_messages"("id") ON DELETE CASCADE,
      "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "reaction" varchar(8) NOT NULL CHECK ("reaction" IN ('LIKE','HEART','LAUGH','FIRE','CLAP')),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("messageId","userId")
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "direct_message_reactions"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP COLUMN "replyToId"`);
  }
}
