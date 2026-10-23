import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Club group chats reuse direct messages: a message goes either to one person (recipientId) or to a
 * club (clubId), never both, so replies, reactions, edits, voice notes and shared activities all work in
 * both. Each member's last read time drives unread counts.
 *
 * Competitions can be archived by their host once they're over: off every list, still at their link.
 */
export class ClubChatAndArchive1729204700000 implements MigrationInterface {
  name = 'ClubChatAndArchive1729204700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "direct_messages" ALTER COLUMN "recipientId" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD COLUMN "clubId" uuid REFERENCES "clubs"("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_one_audience_check" CHECK (("recipientId" IS NULL) <> ("clubId" IS NULL))`);
    await queryRunner.query(`CREATE INDEX "direct_messages_club_created_idx" ON "direct_messages" ("clubId", "createdAt" DESC) WHERE "clubId" IS NOT NULL`);
    await queryRunner.query(`
      CREATE TABLE "club_chat_reads" (
        "clubId" uuid NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "readAt" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("clubId", "userId")
      )`);
    await queryRunner.query(`ALTER TABLE "competition_tables" ADD COLUMN "archivedAt" timestamptz`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_tables" DROP COLUMN "archivedAt"`);
    await queryRunner.query(`DROP TABLE "club_chat_reads"`);
    await queryRunner.query(`DELETE FROM "direct_messages" WHERE "clubId" IS NOT NULL`);
    await queryRunner.query(`DROP INDEX "direct_messages_club_created_idx"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP CONSTRAINT "direct_messages_one_audience_check"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP COLUMN "clubId"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" ALTER COLUMN "recipientId" SET NOT NULL`);
  }
}
