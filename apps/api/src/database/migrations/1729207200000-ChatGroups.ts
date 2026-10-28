import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChatGroups1729207200000 implements MigrationInterface {
  name = 'ChatGroups1729207200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "chat_groups" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" varchar(60) NOT NULL UNIQUE,
        "name" varchar(80) NOT NULL,
        "description" varchar(300),
        "system" boolean NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`
      CREATE TABLE "chat_group_members" (
        "groupId" uuid NOT NULL REFERENCES "chat_groups"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role" varchar(8) NOT NULL DEFAULT 'member' CHECK ("role" IN ('admin','member')),
        "joinedAt" timestamptz NOT NULL DEFAULT now(),
        "readAt" timestamptz,
        PRIMARY KEY ("groupId", "userId")
      )`);
    await queryRunner.query(`CREATE INDEX "chat_group_members_user_idx" ON "chat_group_members" ("userId")`);
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD "groupId" uuid REFERENCES "chat_groups"("id") ON DELETE CASCADE`);
    await queryRunner.query(`CREATE INDEX "direct_messages_group_idx" ON "direct_messages" ("groupId", "createdAt") WHERE "groupId" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP CONSTRAINT "direct_messages_one_audience_check"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_one_audience_check"
      CHECK (("recipientId" IS NOT NULL)::integer + ("clubId" IS NOT NULL)::integer + ("groupId" IS NOT NULL)::integer = 1)`);
    await queryRunner.query(`DELETE FROM "clubs" WHERE "slug" = 'jump-hosts'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "direct_messages" WHERE "groupId" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP CONSTRAINT "direct_messages_one_audience_check"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_one_audience_check" CHECK (("recipientId" IS NULL) <> ("clubId" IS NULL))`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP COLUMN "groupId"`);
    await queryRunner.query(`DROP TABLE "chat_group_members"`);
    await queryRunner.query(`DROP TABLE "chat_groups"`);
  }
}
