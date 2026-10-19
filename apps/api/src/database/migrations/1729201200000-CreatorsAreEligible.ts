import { MigrationInterface, QueryRunner } from 'typeorm';

/** Active creators are eligible for paid challenges and payouts. Leaves existing (e.g. revoked) records alone. */
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
    // Not reversible: we can't tell these rows apart from ones an admin set later.
  }
}
