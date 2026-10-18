import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthActions1729200300000 implements MigrationInterface {
  name = 'AuthActions1729200300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_action_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" varchar NOT NULL CHECK ("type" IN ('VERIFY_EMAIL','RESET_PASSWORD')), "tokenHash" varchar NOT NULL UNIQUE,
        "expiresAt" timestamptz NOT NULL, "usedAt" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "auth_action_tokens"`);
  }
}
