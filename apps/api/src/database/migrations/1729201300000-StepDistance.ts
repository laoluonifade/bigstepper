import { MigrationInterface, QueryRunner } from 'typeorm';

/** Distance from counted steps (validatedSteps × stride), used indoors where GPS can't measure. */
export class StepDistance1729201300000 implements MigrationInterface {
  name = 'StepDistance1729201300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "activities" ADD COLUMN "stepDistanceMetres" integer NOT NULL DEFAULT 0 CHECK ("stepDistanceMetres" >= 0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "activities" DROP COLUMN "stepDistanceMetres"`);
  }
}
