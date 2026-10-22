import { MigrationInterface, QueryRunner } from 'typeorm';

export class WhatsappNumber1729203700000 implements MigrationInterface {
  name = 'WhatsappNumber1729203700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN "whatsappNumber" varchar(20)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "whatsappNumber"`);
  }
}
