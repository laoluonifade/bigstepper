import { MigrationInterface, QueryRunner } from 'typeorm';

export class HostPasses1729207100000 implements MigrationInterface {
  name = 'HostPasses1729207100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "club_event_attendees" a USING "club_events" e
       WHERE a."eventId" = e."id" AND a."userId" = e."createdBy"`);
  }

  public async down(): Promise<void> {
    return;
  }
}
