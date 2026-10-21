import { MigrationInterface, QueryRunner } from 'typeorm';

export class FundedFreeAndFeedSocial1729202300000 implements MigrationInterface {
  name = 'FundedFreeAndFeedSocial1729202300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // No settled deposit exists on these old fixed-target drafts. Entry can now open for free.
    await queryRunner.query(`UPDATE "competition_tables" t SET "status"='OPEN_FOR_ENTRY',"guaranteedPrizeKobo"=NULL
      WHERE t."type"='sponsored' AND t."status"='PENDING_FUNDING' AND t."fundedAt" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "payment_intents" i WHERE i."tableId"=t."id" AND i."purpose"='SPONSOR_FUNDING' AND i."status"='SUCCEEDED')`);

    await queryRunner.query(`CREATE TABLE "feed_post_reactions" (
      "postId" uuid NOT NULL REFERENCES "feed_posts"("id") ON DELETE CASCADE,
      "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "reaction" varchar(12) NOT NULL CHECK ("reaction" IN ('LIKE','FIRE','CLAP','HEART')),
      "createdAt" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("postId","userId")
    )`);
    await queryRunner.query(`CREATE TABLE "feed_comments" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "postId" uuid NOT NULL REFERENCES "feed_posts"("id") ON DELETE CASCADE,
      "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "body" varchar(500) NOT NULL CHECK (length(trim("body")) > 0),
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX "feed_comments_post_created_idx" ON "feed_comments" ("postId","createdAt" DESC)`);
    await queryRunner.query(`CREATE TABLE "direct_messages" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "senderId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "recipientId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "body" varchar(1000) NOT NULL CHECK (length(trim("body")) > 0),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CHECK ("senderId" <> "recipientId")
    )`);
    await queryRunner.query(`CREATE INDEX "direct_messages_sender_created_idx" ON "direct_messages" ("senderId","createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX "direct_messages_recipient_created_idx" ON "direct_messages" ("recipientId","createdAt" DESC)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "direct_messages"`);
    await queryRunner.query(`DROP TABLE "feed_comments"`);
    await queryRunner.query(`DROP TABLE "feed_post_reactions"`);
    // Opening an old challenge is not safely reversible after runners have joined.
  }
}
