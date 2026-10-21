import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkoutFeed1729202000000 implements MigrationInterface {
  name = 'WorkoutFeed1729202000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "feed_posts" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "activityId" uuid REFERENCES "activities"("id") ON DELETE CASCADE,
      "body" varchar(500) NOT NULL DEFAULT '',
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "feed_post_has_content" CHECK (length(trim("body")) > 0 OR "activityId" IS NOT NULL)
    )`);
    await queryRunner.query(`CREATE INDEX "feed_posts_created_idx" ON "feed_posts" ("createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX "feed_posts_user_created_idx" ON "feed_posts" ("userId", "createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX "feed_posts_activity_idx" ON "feed_posts" ("activityId") WHERE "activityId" IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "feed_posts"`);
  }
}
