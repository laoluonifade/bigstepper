import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventCountries1729208100000 implements MigrationInterface {
  name = 'EventCountries1729208100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "club_events" ADD "countryCode" varchar(2)`);
    await queryRunner.query(`ALTER TABLE "club_events" ADD "countryCheckedAt" timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "club_events" DROP COLUMN "countryCheckedAt"`);
    await queryRunner.query(`ALTER TABLE "club_events" DROP COLUMN "countryCode"`);
  }
}
