import { MigrationInterface, QueryRunner } from 'typeorm';

export class Strava1729203300000 implements MigrationInterface {
  name = 'Strava1729203300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "strava_accounts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "athleteId" bigint NOT NULL UNIQUE,
        "athleteName" varchar(160),
        "avatarUrl" varchar(300),
        "accessToken" varchar(200) NOT NULL,
        "refreshToken" varchar(200) NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "scope" varchar(200) NOT NULL DEFAULT '',
        "lastSyncedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`ALTER TABLE "activities" ADD COLUMN "source" varchar(20) NOT NULL DEFAULT 'jump'`);
    await queryRunner.query(`ALTER TABLE "activities" ADD COLUMN "externalId" varchar(40) UNIQUE`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "activities" DROP COLUMN "externalId"`);
    await queryRunner.query(`ALTER TABLE "activities" DROP COLUMN "source"`);
    await queryRunner.query(`DROP TABLE "strava_accounts"`);
  }
}
