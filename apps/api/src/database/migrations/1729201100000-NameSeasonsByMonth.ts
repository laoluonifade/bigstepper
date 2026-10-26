import { MigrationInterface, QueryRunner } from 'typeorm';

export class NameSeasonsByMonth1729201100000 implements MigrationInterface {
  name = 'NameSeasonsByMonth1729201100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "league_seasons" s
      SET "endsAt" = bounds.ends,
          "name" = to_char(bounds.ends - interval '1 day', 'FMMonth YYYY')
      FROM (
        SELECT "id",
               greatest(date_trunc('month', "startsAt") + interval '1 month',
                        date_trunc('month', now()) + interval '1 month') AS ends
        FROM "league_seasons"
        WHERE "name" = 'Founding Season' AND "status" = 'ACTIVE'
      ) bounds
      WHERE s."id" = bounds."id"
    `);
  }

  public async down(): Promise<void> {
  }
}
