import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The first league season was seeded as "Founding Season", running three months. Every other season is
 * a calendar month named after that month, so make the first one the same: named for its month, ending
 * at the end of it (or the end of the current month if that has already passed).
 */
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
    // Renaming back would reintroduce the placeholder name; nothing to undo.
  }
}
