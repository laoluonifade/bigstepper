import { MigrationInterface, QueryRunner } from 'typeorm';

export class FreeMvpCore1729200100000 implements MigrationInterface {
  name = 'FreeMvpCore1729200100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "expiresAt" timestamptz NOT NULL,
        "revokedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "auth_sessions_user_revoked_idx" ON "auth_sessions" ("userId", "revokedAt")`);

    await queryRunner.query(`
      CREATE TABLE "profiles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "username" varchar NOT NULL UNIQUE,
        "displayName" varchar NOT NULL,
        "preferredUnit" varchar NOT NULL DEFAULT 'km' CHECK ("preferredUnit" IN ('km', 'mi')),
        "activityVisibility" varchar NOT NULL DEFAULT 'private' CHECK ("activityVisibility" IN ('private', 'followers', 'public')),
        "countryCode" varchar(2) NOT NULL DEFAULT 'NG',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      INSERT INTO "profiles" ("userId", "username", "displayName")
      SELECT "id", 'runner_' || left(replace("id"::text, '-', ''), 12), coalesce("displayName", split_part("email", '@', 1)) FROM "users"
    `);

    await queryRunner.query(`ALTER TABLE "running_sessions" ADD COLUMN "pausedAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "running_sessions" ADD COLUMN "pausedSeconds" integer NOT NULL DEFAULT 0 CHECK ("pausedSeconds" >= 0)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "running_sessions_one_active_per_user" ON "running_sessions" ("userId") WHERE "status" IN ('RUNNING', 'PAUSED')`);

    await queryRunner.query(`
      CREATE TABLE "activities" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "runningSessionId" uuid NOT NULL UNIQUE REFERENCES "running_sessions"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "verificationStatus" varchar NOT NULL DEFAULT 'PENDING_VERIFICATION' CHECK ("verificationStatus" IN ('PENDING_VERIFICATION', 'VERIFIED', 'FLAGGED', 'REJECTED')),
        "recordedDistanceMetres" integer NOT NULL DEFAULT 0 CHECK ("recordedDistanceMetres" >= 0),
        "validatedDistanceMetres" integer NOT NULL DEFAULT 0 CHECK ("validatedDistanceMetres" >= 0),
        "elapsedSeconds" integer NOT NULL DEFAULT 0 CHECK ("elapsedSeconds" >= 0),
        "movingSeconds" integer NOT NULL DEFAULT 0 CHECK ("movingSeconds" >= 0),
        "gpsConfidence" real NOT NULL DEFAULT 0 CHECK ("gpsConfidence" BETWEEN 0 AND 1),
        "verificationReasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "algorithmVersion" varchar NOT NULL DEFAULT 'gps-v1',
        "startedAt" timestamptz NOT NULL,
        "finishedAt" timestamptz NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "activities_user_started_idx" ON "activities" ("userId", "startedAt" DESC)`);
    await queryRunner.query(`
      CREATE TABLE "activity_verification_reviews" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "activityId" uuid NOT NULL REFERENCES "activities"("id") ON DELETE CASCADE,
        "requestedByUserId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "status" varchar NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED')),
        "reason" varchar(500) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "activity_reviews_one_pending" ON "activity_verification_reviews" ("activityId") WHERE "status" = 'PENDING'`);

    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "startsAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "entryClosesAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "capacity" integer CHECK ("capacity" > 0)`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "distanceCapMetres" integer CHECK ("distanceCapMetres" > 0)`);

    await queryRunner.query(`
      CREATE TABLE "table_activity_credits" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tableId" uuid NOT NULL REFERENCES "competition_tables"("id") ON DELETE CASCADE,
        "registrationId" uuid NOT NULL REFERENCES "table_registrations"("id") ON DELETE CASCADE,
        "activityId" uuid NOT NULL REFERENCES "activities"("id") ON DELETE RESTRICT,
        "creditedDistanceMetres" integer NOT NULL CHECK ("creditedDistanceMetres" >= 0),
        "creditedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "table_activity_credits_table_activity_unique" UNIQUE ("tableId", "activityId")
      )
    `);
    await queryRunner.query(`CREATE INDEX "table_activity_credits_table_distance_idx" ON "table_activity_credits" ("tableId", "creditedDistanceMetres" DESC)`);

    await queryRunner.query(`
      CREATE TABLE "admin_audit_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "actorUserId" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "action" varchar NOT NULL,
        "targetType" varchar NOT NULL,
        "targetId" varchar NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "outbox_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "topic" varchar NOT NULL,
        "aggregateId" varchar NOT NULL,
        "payload" jsonb NOT NULL,
        "processedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" ("createdAt") WHERE "processedAt" IS NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "outbox_events"`);
    await queryRunner.query(`DROP TABLE "admin_audit_events"`);
    await queryRunner.query(`DROP TABLE "table_activity_credits"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "distanceCapMetres"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "capacity"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "entryClosesAt"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "startsAt"`);
    await queryRunner.query(`DROP TABLE "activity_verification_reviews"`);
    await queryRunner.query(`DROP TABLE "activities"`);
    await queryRunner.query(`DROP INDEX "running_sessions_one_active_per_user"`);
    await queryRunner.query(`ALTER TABLE "running_sessions" DROP COLUMN "pausedSeconds"`);
    await queryRunner.query(`ALTER TABLE "running_sessions" DROP COLUMN "pausedAt"`);
    await queryRunner.query(`DROP TABLE "profiles"`);
    await queryRunner.query(`DROP TABLE "auth_sessions"`);
  }
}
