import { MigrationInterface, QueryRunner } from 'typeorm';
import { bestEffortFor } from '../../tables/best-effort';
import { retotal } from '../../tables/competition-credits';

export class BestEffortTimes1729204400000 implements MigrationInterface {
  name = 'BestEffortTimes1729204400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const manager = queryRunner.manager;
    const credits = await manager.query(
      `SELECT c."id", c."tableId", c."activityId", t."targetDistanceMetres" AS "metres"
       FROM "table_activity_credits" c JOIN "competition_tables" t ON t."id" = c."tableId"
       WHERE t."scoringMethod" IN ('FASTEST_FIXED_DISTANCE','FASTEST_TIME') AND t."targetDistanceMetres" > 0
         AND t."status" IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED')`,
    ) as Array<{ id: string; tableId: string; activityId: string; metres: number }>;
    for (const credit of credits) {
      const seconds = await bestEffortFor(manager, credit.activityId, credit.metres);
      await manager.query(`UPDATE "table_activity_credits" SET "completionTimeSeconds" = $2 WHERE "id" = $1`, [credit.id, seconds]);
    }
    const tableIds = [...new Set(credits.map((credit) => credit.tableId))];
    if (tableIds.length) await retotal(manager, tableIds);
  }

  async down(): Promise<void> {
  }
}
