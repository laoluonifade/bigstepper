import { MigrationInterface, QueryRunner } from 'typeorm';
import { DESCRIPTION_MAX, PLANS } from '../../tables/official-series';

export class OfficialSeriesDescriptions1793449000000 implements MigrationInterface {
  name = 'OfficialSeriesDescriptions1793449000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const plan of PLANS) {
      await queryRunner.query(
        `UPDATE "challenge_series" SET "template" = jsonb_set("template", '{description}', to_jsonb($2::text)), "updatedAt" = now()
         WHERE "title" = $1 AND length("template"->>'description') > $3`,
        [plan.title, plan.description, DESCRIPTION_MAX],
      );
    }
  }

  async down(): Promise<void> {
    return;
  }
}
