import { MigrationInterface, QueryRunner } from 'typeorm';

export class MessagePrivacy1729206400000 implements MigrationInterface {
  name = 'MessagePrivacy1729206400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" ADD "messagesFrom" varchar(12) NOT NULL DEFAULT 'everyone' CHECK ("messagesFrom" IN ('everyone','following'))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "messagesFrom"`);
  }
}
