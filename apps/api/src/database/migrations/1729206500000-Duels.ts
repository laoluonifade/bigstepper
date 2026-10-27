import { MigrationInterface, QueryRunner } from 'typeorm';

export class Duels1729206500000 implements MigrationInterface {
  name = 'Duels1729206500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "duels" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "challengerId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "opponentId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "activity" varchar(8) NOT NULL CHECK ("activity" IN ('run','walk','cycle','any')),
        "targetMetres" integer NOT NULL CHECK ("targetMetres" BETWEEN 500 AND 200000),
        "minutes" integer NOT NULL CHECK ("minutes" BETWEEN 5 AND 600),
        "status" varchar(10) NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','ACCEPTED','LIVE','FINISHED','DECLINED','CANCELLED','EXPIRED')),
        "acceptedAt" timestamptz,
        "challengerReadyAt" timestamptz,
        "opponentReadyAt" timestamptz,
        "startsAt" timestamptz,
        "endsAt" timestamptz,
        "settledAt" timestamptz,
        "challengerMetres" integer,
        "opponentMetres" integer,
        "challengerReachedAt" timestamptz,
        "opponentReachedAt" timestamptz,
        "winnerId" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "expiresAt" timestamptz NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "duels_not_self" CHECK ("challengerId" <> "opponentId")
      )`);
    await queryRunner.query(`CREATE INDEX "duels_challenger_idx" ON "duels" ("challengerId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "duels_opponent_idx" ON "duels" ("opponentId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "duels_open_idx" ON "duels" ("status", "expiresAt") WHERE "status" IN ('PENDING','ACCEPTED','LIVE')`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "duels_one_open_pair" ON "duels" (LEAST("challengerId","opponentId"), GREATEST("challengerId","opponentId"))
      WHERE "status" IN ('PENDING','ACCEPTED','LIVE')`);
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD "duelId" uuid REFERENCES "duels"("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "feed_posts" ADD "duelId" uuid REFERENCES "duels"("id") ON DELETE CASCADE`);
    await queryRunner.query(`CREATE UNIQUE INDEX "feed_posts_duel_idx" ON "feed_posts" ("duelId") WHERE "duelId" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP CONSTRAINT "direct_messages_body_check"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_body_check"
      CHECK (length(trim("body")) > 0 OR "activityId" IS NOT NULL OR "audioUrl" IS NOT NULL OR "duelId" IS NOT NULL)`);
    await queryRunner.query(`ALTER TABLE "feed_posts" DROP CONSTRAINT "feed_post_has_content"`);
    await queryRunner.query(`ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_post_has_content"
      CHECK (length(trim("body")) > 0 OR "activityId" IS NOT NULL OR "imageUrl" IS NOT NULL OR "duelId" IS NOT NULL)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "feed_posts" WHERE "duelId" IS NOT NULL AND length(trim("body")) = 0 AND "activityId" IS NULL AND "imageUrl" IS NULL`);
    await queryRunner.query(`DELETE FROM "direct_messages" WHERE "duelId" IS NOT NULL AND length(trim("body")) = 0 AND "activityId" IS NULL AND "audioUrl" IS NULL`);
    await queryRunner.query(`ALTER TABLE "feed_posts" DROP CONSTRAINT "feed_post_has_content"`);
    await queryRunner.query(`ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_post_has_content"
      CHECK (length(trim("body")) > 0 OR "activityId" IS NOT NULL OR "imageUrl" IS NOT NULL)`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP CONSTRAINT "direct_messages_body_check"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_body_check"
      CHECK (length(trim("body")) > 0 OR "activityId" IS NOT NULL OR "audioUrl" IS NOT NULL)`);
    await queryRunner.query(`DROP INDEX "feed_posts_duel_idx"`);
    await queryRunner.query(`ALTER TABLE "feed_posts" DROP COLUMN "duelId"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP COLUMN "duelId"`);
    await queryRunner.query(`DROP TABLE "duels"`);
  }
}
