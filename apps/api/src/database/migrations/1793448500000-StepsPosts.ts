import { MigrationInterface, QueryRunner } from 'typeorm';

export class StepsPosts1793448500000 implements MigrationInterface {
  name = 'StepsPosts1793448500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "apple_health_links" ADD "timeZone" varchar(64)`);
    await queryRunner.query(`ALTER TABLE "apple_health_links" ADD "shareSteps" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "feed_posts" ADD "stepsDay" date`);
    await queryRunner.query(`CREATE UNIQUE INDEX "feed_posts_steps_day" ON "feed_posts" ("userId", "stepsDay") WHERE "stepsDay" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE "feed_posts" DROP CONSTRAINT "feed_post_has_content"`);
    await queryRunner.query(`ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_post_has_content"
      CHECK (length(trim("body")) > 0 OR "activityId" IS NOT NULL OR "imageUrl" IS NOT NULL OR "duelId" IS NOT NULL OR "stepsDay" IS NOT NULL)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "feed_posts" WHERE "stepsDay" IS NOT NULL AND length(trim("body")) = 0 AND "activityId" IS NULL AND "imageUrl" IS NULL AND "duelId" IS NULL`);
    await queryRunner.query(`ALTER TABLE "feed_posts" DROP CONSTRAINT "feed_post_has_content"`);
    await queryRunner.query(`ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_post_has_content"
      CHECK (length(trim("body")) > 0 OR "activityId" IS NOT NULL OR "imageUrl" IS NOT NULL OR "duelId" IS NOT NULL)`);
    await queryRunner.query(`DROP INDEX "feed_posts_steps_day"`);
    await queryRunner.query(`ALTER TABLE "feed_posts" DROP COLUMN "stepsDay"`);
    await queryRunner.query(`ALTER TABLE "apple_health_links" DROP COLUMN "shareSteps"`);
    await queryRunner.query(`ALTER TABLE "apple_health_links" DROP COLUMN "timeZone"`);
  }
}
