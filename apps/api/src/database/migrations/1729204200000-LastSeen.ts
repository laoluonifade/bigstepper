import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * When each person last used Jump, so admins can see who's active today. Starts from their latest
 * sign-in (or their latest activity, if later); every signed-in request keeps it current from here on.
 */
export class LastSeen1729204200000 implements MigrationInterface {
  name = 'LastSeen1729204200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "lastSeenAt" timestamptz`);
    await queryRunner.query(`
      UPDATE "users" u SET "lastSeenAt" = seen.at
      FROM (
        SELECT "userId", max(at) AS at FROM (
          SELECT "userId", "createdAt" AS at FROM "auth_sessions"
          UNION ALL SELECT "userId", "finishedAt" FROM "activities"
        ) events GROUP BY "userId"
      ) seen
      WHERE seen."userId" = u."id"`);
    await queryRunner.query(`CREATE INDEX "IDX_users_last_seen" ON "users" ("lastSeenAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_users_last_seen"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastSeenAt"`);
  }
}
