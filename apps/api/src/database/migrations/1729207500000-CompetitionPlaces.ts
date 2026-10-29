import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompetitionPlaces1729207500000 implements MigrationInterface {
  name = 'CompetitionPlaces1729207500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD "venue" varchar(120)`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD "address" varchar(200)`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD "latitude" double precision`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD "longitude" double precision`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD CONSTRAINT "competition_tables_place" CHECK (("latitude" IS NULL) = ("longitude" IS NULL))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP CONSTRAINT "competition_tables_place"`);
    for (const column of ['longitude', 'latitude', 'address', 'venue']) {
      await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "${column}"`);
    }
  }
}
