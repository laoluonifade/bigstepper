import { MigrationInterface, QueryRunner } from 'typeorm';

export class CyclingDistance1729203000000 implements MigrationInterface {
  name = 'CyclingDistance1729203000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "running_sessions" DROP CONSTRAINT "running_sessions_activityType_check"`);
    await queryRunner.query(`ALTER TABLE "running_sessions" ADD CONSTRAINT "running_sessions_activityType_check" CHECK ("activityType" IN ('walk','run','cycle'))`);
    await queryRunner.query(`ALTER TABLE "activities" DROP CONSTRAINT "activities_activityType_check"`);
    await queryRunner.query(`ALTER TABLE "activities" ADD CONSTRAINT "activities_activityType_check" CHECK ("activityType" IN ('walk','run','cycle'))`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP CONSTRAINT "competition_tables_challengeType_check"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD CONSTRAINT "competition_tables_challengeType_check" CHECK ("challengeType" IN ('WALK','RUN','DISTANCE','STEP','TIMED','CYCLING'))`);
    // GPS cannot distinguish a bicycle from a slow car well enough for cash prizes.
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD CONSTRAINT "cycling_free_only_check" CHECK ("challengeType"<>'CYCLING' OR "type"='free')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP CONSTRAINT "cycling_free_only_check"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP CONSTRAINT "competition_tables_challengeType_check"`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD CONSTRAINT "competition_tables_challengeType_check" CHECK ("challengeType" IN ('WALK','RUN','DISTANCE','STEP','TIMED'))`);
    await queryRunner.query(`ALTER TABLE "activities" DROP CONSTRAINT "activities_activityType_check"`);
    await queryRunner.query(`ALTER TABLE "activities" ADD CONSTRAINT "activities_activityType_check" CHECK ("activityType" IN ('walk','run'))`);
    await queryRunner.query(`ALTER TABLE "running_sessions" DROP CONSTRAINT "running_sessions_activityType_check"`);
    await queryRunner.query(`ALTER TABLE "running_sessions" ADD CONSTRAINT "running_sessions_activityType_check" CHECK ("activityType" IN ('walk','run'))`);
  }
}
