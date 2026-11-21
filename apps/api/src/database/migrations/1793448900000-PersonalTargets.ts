import { MigrationInterface, QueryRunner } from 'typeorm';

const METHODS = [
  'FARTHEST_DISTANCE', 'FIRST_TO_DISTANCE', 'FASTEST_FIXED_DISTANCE', 'FASTEST_TIME', 'BEST_PACE', 'BEST_AVERAGE_SPEED', 'LONGEST_SINGLE', 'MOST_ELEVATION',
  'MOST_SESSIONS', 'FIRST_TO_SESSIONS', 'MOST_ACTIVE_DAYS', 'MOST_TIME', 'FIRST_TO_TIME', 'LONGEST_SESSION', 'LONGEST_STREAK', 'TARGET_DAYS',
  'PACE_CONSISTENCY', 'DAILY_CONSISTENCY', 'WEEKLY_CONSISTENCY', 'MOST_STEPS', 'FIRST_TO_STEPS', 'MOST_STEPS_ONE_DAY', 'AVERAGE_DAILY_STEPS',
];
const list = (methods: string[]) => methods.map((method) => `'${method}'`).join(',');

export class PersonalTargets1793448900000 implements MigrationInterface {
  name = 'PersonalTargets1793448900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP CONSTRAINT IF EXISTS "competition_tables_scoringMethod_check"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD CONSTRAINT "competition_tables_scoringMethod_check" CHECK ("scoringMethod" IN (${list([...METHODS, 'PERSONAL_TARGET', 'PERSONAL_DAYS'])}))`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "personal" jsonb`);
    await queryRunner.query(`ALTER TABLE "table_registrations" ADD COLUMN "personalTarget" integer CHECK ("personalTarget" > 0), ADD COLUMN "baselineSteps" integer CHECK ("baselineSteps" >= 0)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "table_registrations" DROP COLUMN IF EXISTS "baselineSteps", DROP COLUMN IF EXISTS "personalTarget"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN IF EXISTS "personal"`);
    await queryRunner.query(`DELETE FROM "competition_tables" WHERE "scoringMethod" IN ('PERSONAL_TARGET','PERSONAL_DAYS')`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP CONSTRAINT IF EXISTS "competition_tables_scoringMethod_check"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD CONSTRAINT "competition_tables_scoringMethod_check" CHECK ("scoringMethod" IN (${list(METHODS)}))`);
  }
}
