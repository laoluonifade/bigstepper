import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1729200000000 implements MigrationInterface {
  name = 'InitialSchema1729200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar NOT NULL UNIQUE,
        "passwordHash" varchar NOT NULL,
        "displayName" varchar,
        "emailVerified" boolean NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "running_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "status" varchar NOT NULL DEFAULT 'IDLE',
        "startedAt" timestamptz,
        "finishedAt" timestamptz,
        "distanceMetres" integer NOT NULL DEFAULT 0 CHECK ("distanceMetres" >= 0),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "running_sessions_status_check" CHECK ("status" IN ('IDLE', 'RUNNING', 'PAUSED', 'PENDING_VERIFICATION', 'VERIFIED', 'FLAGGED', 'REJECTED'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "gps_samples" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sessionId" uuid NOT NULL REFERENCES "running_sessions"("id") ON DELETE CASCADE,
        "sequence" integer NOT NULL CHECK ("sequence" >= 0),
        "latitude" double precision NOT NULL CHECK ("latitude" BETWEEN -90 AND 90),
        "longitude" double precision NOT NULL CHECK ("longitude" BETWEEN -180 AND 180),
        "accuracy" double precision CHECK ("accuracy" >= 0),
        "recordedAt" timestamptz NOT NULL,
        CONSTRAINT "gps_samples_session_sequence_unique" UNIQUE ("sessionId", "sequence")
      )
    `);
    await queryRunner.query(`CREATE INDEX "gps_samples_session_recorded_idx" ON "gps_samples" ("sessionId", "recordedAt")`);
    await queryRunner.query(`
      CREATE TABLE "competition_tables" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" varchar NOT NULL,
        "code" varchar NOT NULL UNIQUE,
        "type" varchar NOT NULL DEFAULT 'free' CHECK ("type" IN ('free', 'sponsored', 'paid')),
        "status" varchar NOT NULL DEFAULT 'OPEN_FOR_ENTRY',
        "entryFeeKobo" integer NOT NULL DEFAULT 0 CHECK ("entryFeeKobo" >= 0),
        "scoringClosesAt" timestamptz,
        "creatorId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "paid_tables_require_fee" CHECK ("type" = 'paid' OR "entryFeeKobo" = 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "competition_tables_discovery_idx" ON "competition_tables" ("type", "status", "createdAt" DESC)`);
    await queryRunner.query(`
      CREATE TABLE "table_registrations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tableId" uuid NOT NULL REFERENCES "competition_tables"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "creditedDistanceMetres" integer NOT NULL DEFAULT 0 CHECK ("creditedDistanceMetres" >= 0),
        "joinedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "table_registrations_table_user_unique" UNIQUE ("tableId", "userId")
      )
    `);
    await queryRunner.query(`CREATE INDEX "table_registrations_standings_idx" ON "table_registrations" ("tableId", "creditedDistanceMetres" DESC, "joinedAt" ASC)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "table_registrations"`);
    await queryRunner.query(`DROP TABLE "competition_tables"`);
    await queryRunner.query(`DROP TABLE "gps_samples"`);
    await queryRunner.query(`DROP TABLE "running_sessions"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
