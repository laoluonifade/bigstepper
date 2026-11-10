import { MigrationInterface, QueryRunner } from 'typeorm';

export class MessageDeletes1793448600000 implements MigrationInterface {
  name = 'MessageDeletes1793448600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD COLUMN "deletedAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "push_tokens" ADD COLUMN "richMessages" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP CONSTRAINT "direct_messages_body_check"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_body_check"
      CHECK (length(trim("body")) > 0 OR "activityId" IS NOT NULL OR "audioUrl" IS NOT NULL OR "duelId" IS NOT NULL OR "deletedAt" IS NOT NULL)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "direct_messages" WHERE "deletedAt" IS NOT NULL AND length(trim("body")) = 0 AND "activityId" IS NULL AND "audioUrl" IS NULL AND "duelId" IS NULL`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP CONSTRAINT "direct_messages_body_check"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_body_check"
      CHECK (length(trim("body")) > 0 OR "activityId" IS NOT NULL OR "audioUrl" IS NOT NULL OR "duelId" IS NOT NULL)`);
    await queryRunner.query(`ALTER TABLE "push_tokens" DROP COLUMN "richMessages"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP COLUMN "deletedAt"`);
  }
}
