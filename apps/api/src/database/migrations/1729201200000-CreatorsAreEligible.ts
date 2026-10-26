import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatorsAreEligible1729201200000 implements MigrationInterface {
  name = 'CreatorsAreEligible1729201200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "user_eligibility" ("userId","adultVerified","paidCompetitionEligible","countryCode")
      SELECT c."userId", true, true, 'NG' FROM "creator_profiles" c WHERE c."status" = 'ACTIVE'
      ON CONFLICT ("userId") DO NOTHING
    `);
  }

  public async down(): Promise<void> {
  }
}
