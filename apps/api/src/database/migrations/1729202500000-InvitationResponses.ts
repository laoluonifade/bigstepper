import { MigrationInterface, QueryRunner } from 'typeorm';

export class InvitationResponses1729202500000 implements MigrationInterface {
  name = 'InvitationResponses1729202500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "challenge_invitations" ADD COLUMN "status" varchar(12) NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','ACCEPTED','DECLINED'))`);
    await queryRunner.query(`ALTER TABLE "challenge_invitations" ADD COLUMN "respondedAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "direct_messages" ADD COLUMN "invitationId" uuid REFERENCES "challenge_invitations"("id") ON DELETE SET NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "direct_messages_invitation_idx" ON "direct_messages" ("invitationId") WHERE "invitationId" IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "direct_messages_invitation_idx"`);
    await queryRunner.query(`ALTER TABLE "direct_messages" DROP COLUMN "invitationId"`);
    await queryRunner.query(`ALTER TABLE "challenge_invitations" DROP COLUMN "respondedAt"`);
    await queryRunner.query(`ALTER TABLE "challenge_invitations" DROP COLUMN "status"`);
  }
}
