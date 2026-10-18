import { MigrationInterface, QueryRunner } from 'typeorm';

export class Settlements1729200400000 implements MigrationInterface {
  name = 'Settlements1729200400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "table_leaderboard_snapshots" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tableId" uuid NOT NULL REFERENCES "competition_tables"("id") ON DELETE RESTRICT,
        "version" integer NOT NULL, "algorithmVersion" varchar NOT NULL, "standings" jsonb NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE ("tableId", "version")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "table_settlements" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tableId" uuid NOT NULL REFERENCES "competition_tables"("id") ON DELETE RESTRICT,
        "version" integer NOT NULL, "snapshotId" uuid NOT NULL REFERENCES "table_leaderboard_snapshots"("id") ON DELETE RESTRICT,
        "winnerUserId" uuid REFERENCES "users"("id") ON DELETE RESTRICT, "status" varchar NOT NULL DEFAULT 'FINAL',
        "settledByUserId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT, "settledAt" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("tableId", "version")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "table_appeals" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tableId" uuid NOT NULL REFERENCES "competition_tables"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "reason" varchar(500) NOT NULL,
        "status" varchar NOT NULL DEFAULT 'PENDING', "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "table_appeals"`);
    await queryRunner.query(`DROP TABLE "table_settlements"`);
    await queryRunner.query(`DROP TABLE "table_leaderboard_snapshots"`);
  }
}
