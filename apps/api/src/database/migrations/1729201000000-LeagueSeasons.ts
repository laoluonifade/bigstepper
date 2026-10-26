import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeagueSeasons1729201000000 implements MigrationInterface {
  name = 'LeagueSeasons1729201000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "league_memberships"
        ADD COLUMN "finalRank" integer CHECK ("finalRank" > 0),
        ADD COLUMN "outcome" varchar CHECK ("outcome" IN ('PROMOTED','RELEGATED','STAYED'))
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "league_seasons_one_active_idx" ON "league_seasons" ((true)) WHERE "status" = 'ACTIVE'`);
    await queryRunner.query(`
      UPDATE "league_memberships" m
      SET "creditedDistanceMetres" = COALESCE((
        SELECT SUM(a."validatedDistanceMetres") FROM "activities" a
        WHERE a."userId" = m."userId" AND a."verificationStatus" = 'VERIFIED'
          AND a."startedAt" >= s."startsAt" AND a."startedAt" < s."endsAt"
      ), 0)::integer
      FROM "league_seasons" s
      WHERE m."seasonId" = s."id" AND s."status" = 'ACTIVE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "league_seasons_one_active_idx"`);
    await queryRunner.query(`ALTER TABLE "league_memberships" DROP COLUMN "outcome", DROP COLUMN "finalRank"`);
  }
}
