import { MigrationInterface, QueryRunner } from 'typeorm';

export class AppleHealth1793448100000 implements MigrationInterface {
  name = 'AppleHealth1793448100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "apple_health_links" (
        "userId" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "connectedAt" timestamptz NOT NULL DEFAULT now(),
        "lastSyncedAt" timestamptz
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "apple_health_links"`);
  }
}
