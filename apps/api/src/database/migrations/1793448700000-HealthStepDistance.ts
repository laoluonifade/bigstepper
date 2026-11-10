import { MigrationInterface, QueryRunner } from 'typeorm';
import { HEALTH_ELIGIBLE, retotal } from '../../tables/competition-credits';

export class HealthStepDistance1793448700000 implements MigrationInterface {
  name = 'HealthStepDistance1793448700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const fixed = await queryRunner.query(`UPDATE "daily_steps" SET "countedMetres" = round("countedSteps" * 0.72)::integer
      WHERE "distanceMetres" IS NULL AND "countedMetres" = 0 AND "countedSteps" > 0 RETURNING "userId"`) as [Array<{ userId: string }>, number] | Array<{ userId: string }>;
    const rows = (Array.isArray(fixed[0]) ? fixed[0] : fixed) as Array<{ userId: string }>;
    const userIds = [...new Set(rows.map((row) => row.userId))];
    if (!userIds.length) return;
    const tables = await queryRunner.query(
      `SELECT DISTINCT t."id" FROM "table_registrations" r JOIN "competition_tables" t ON t."id" = r."tableId"
       WHERE r."userId" = ANY($1::uuid[]) AND ${HEALTH_ELIGIBLE('t')} AND t."status" IN ('OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED')`,
      [userIds],
    ) as Array<{ id: string }>;
    if (tables.length) await retotal(queryRunner.manager, tables.map((table) => table.id));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "daily_steps" SET "countedMetres" = 0 WHERE "distanceMetres" IS NULL`);
  }
}
