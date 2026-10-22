import { MigrationInterface, QueryRunner } from 'typeorm';

export class VoiceNotes1729203600000 implements MigrationInterface {
  name = 'VoiceNotes1729203600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD COLUMN "audioUrl" varchar(400)`);
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD COLUMN "audioSeconds" integer CHECK ("audioSeconds" BETWEEN 1 AND 120)`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP CONSTRAINT "direct_messages_body_check"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_body_check"
      CHECK (length(trim("body")) > 0 OR "activityId" IS NOT NULL OR "audioUrl" IS NOT NULL)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "direct_messages" WHERE length(trim("body")) = 0 AND "activityId" IS NULL`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP CONSTRAINT "direct_messages_body_check"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_body_check" CHECK (length(trim("body")) > 0 OR "activityId" IS NOT NULL)`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP COLUMN "audioSeconds"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP COLUMN "audioUrl"`);
  }
}
