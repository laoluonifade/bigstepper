import { MigrationInterface, QueryRunner } from 'typeorm';
import { PLANS } from '../../tables/official-series';

const OLD = '%Counts your Apple Health steps.%';

export class OfficialSeriesShortDescriptions1793449100000 implements MigrationInterface {
  name = 'OfficialSeriesShortDescriptions1793449100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const plan of PLANS) {
      await queryRunner.query(
        `UPDATE "challenge_series" SET "template" = jsonb_set("template", '{description}', to_jsonb($2::text)), "updatedAt" = now()
         WHERE "title" = $1 AND "template"->>'description' LIKE $3`,
        [plan.title, plan.description, OLD],
      );
      await queryRunner.query(
        `UPDATE "competition_tables" t SET "description" = $2
         FROM "challenge_series" s
         WHERE t."seriesId" = s."id" AND s."title" = $1 AND t."resultsFinalizedAt" IS NULL AND t."description" LIKE $3`,
        [plan.title, plan.description, OLD],
      );
    }
  }

  async down(): Promise<void> {
    return;
  }
}
