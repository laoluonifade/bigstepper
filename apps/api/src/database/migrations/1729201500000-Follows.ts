import { MigrationInterface, QueryRunner } from 'typeorm';

/** Runners following runners. One row per pair; nobody follows themselves. */
export class Follows1729201500000 implements MigrationInterface {
  name = 'Follows1729201500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "follows" (
        "followerId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "followingId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("followerId", "followingId"),
        CHECK ("followerId" <> "followingId")
      )`);
    await queryRunner.query(`CREATE INDEX "IDX_follows_following" ON "follows" ("followingId", "createdAt" DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "follows"`);
  }
}
