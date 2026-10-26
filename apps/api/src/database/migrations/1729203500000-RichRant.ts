import { MigrationInterface, QueryRunner } from 'typeorm';

const REACTIONS = `'HEART','FIRE','CLAP','LIKE','LAUGH','WOW','SAD','STRONG','PARTY','HUNDRED','RUN','PRAY'`;

export class RichRant1729203500000 implements MigrationInterface {
  name = 'RichRant1729203500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "feed_posts" ADD COLUMN "imageUrl" varchar(400)`);
    await queryRunner.query(`ALTER TABLE "feed_posts" DROP CONSTRAINT "feed_post_has_content"`);
    await queryRunner.query(`ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_post_has_content"
      CHECK (length(trim("body")) > 0 OR "activityId" IS NOT NULL OR "imageUrl" IS NOT NULL)`);

    await queryRunner.query(`ALTER TABLE "direct_messages" ADD COLUMN "activityId" uuid REFERENCES "activities"("id") ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP CONSTRAINT "direct_messages_body_check"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_body_check"
      CHECK (length(trim("body")) > 0 OR "activityId" IS NOT NULL)`);

    await queryRunner.query(`ALTER TABLE "feed_post_reactions" DROP CONSTRAINT "feed_post_reactions_reaction_check"`);
    await queryRunner.query(`ALTER TABLE "feed_post_reactions" ADD CONSTRAINT "feed_post_reactions_reaction_check" CHECK ("reaction" IN (${REACTIONS}))`);
    await queryRunner.query(`ALTER TABLE "direct_message_reactions" DROP CONSTRAINT "direct_message_reactions_reaction_check"`);
    await queryRunner.query(`ALTER TABLE "direct_message_reactions" ADD CONSTRAINT "direct_message_reactions_reaction_check" CHECK ("reaction" IN (${REACTIONS}))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "direct_message_reactions" WHERE "reaction" NOT IN ('LIKE','HEART','LAUGH','FIRE','CLAP')`);
    await queryRunner.query(`ALTER TABLE "direct_message_reactions" DROP CONSTRAINT "direct_message_reactions_reaction_check"`);
    await queryRunner.query(`ALTER TABLE "direct_message_reactions" ADD CONSTRAINT "direct_message_reactions_reaction_check" CHECK ("reaction" IN ('LIKE','HEART','LAUGH','FIRE','CLAP'))`);
    await queryRunner.query(`DELETE FROM "feed_post_reactions" WHERE "reaction" NOT IN ('LIKE','FIRE','CLAP','HEART')`);
    await queryRunner.query(`ALTER TABLE "feed_post_reactions" DROP CONSTRAINT "feed_post_reactions_reaction_check"`);
    await queryRunner.query(`ALTER TABLE "feed_post_reactions" ADD CONSTRAINT "feed_post_reactions_reaction_check" CHECK ("reaction" IN ('LIKE','FIRE','CLAP','HEART'))`);
    await queryRunner.query(`DELETE FROM "direct_messages" WHERE length(trim("body")) = 0`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP CONSTRAINT "direct_messages_body_check"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_body_check" CHECK (length(trim("body")) > 0)`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP COLUMN "activityId"`);
    await queryRunner.query(`DELETE FROM "feed_posts" WHERE length(trim("body")) = 0 AND "activityId" IS NULL`);
    await queryRunner.query(`ALTER TABLE "feed_posts" DROP CONSTRAINT "feed_post_has_content"`);
    await queryRunner.query(`ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_post_has_content" CHECK (length(trim("body")) > 0 OR "activityId" IS NOT NULL)`);
    await queryRunner.query(`ALTER TABLE "feed_posts" DROP COLUMN "imageUrl"`);
  }
}
