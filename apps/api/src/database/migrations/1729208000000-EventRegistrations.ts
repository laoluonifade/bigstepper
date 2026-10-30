import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventRegistrations1729208000000 implements MigrationInterface {
  name = 'EventRegistrations1729208000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "club_events" ADD "deletedAt" timestamptz`);
    await queryRunner.query(`
      CREATE TABLE "event_ticket_types" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "eventId" uuid NOT NULL REFERENCES "club_events"("id") ON DELETE CASCADE,
        "name" varchar(60) NOT NULL,
        "description" varchar(200),
        "priceMinor" integer NOT NULL DEFAULT 0 CHECK ("priceMinor" >= 0),
        "currency" varchar(3) NOT NULL DEFAULT 'NGN',
        "capacity" integer CHECK ("capacity" IS NULL OR "capacity" > 0),
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`CREATE INDEX "event_ticket_types_event_idx" ON "event_ticket_types" ("eventId", "sortOrder")`);
    await queryRunner.query(`INSERT INTO "event_ticket_types" ("eventId", "name") SELECT "id", 'Free pass' FROM "club_events"`);

    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD "id" uuid NOT NULL DEFAULT gen_random_uuid()`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD CONSTRAINT "club_event_attendees_id" UNIQUE ("id")`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD "ticketTypeId" uuid REFERENCES "event_ticket_types"("id") ON DELETE SET NULL`);
    await queryRunner.query(`
      UPDATE "club_event_attendees" a SET "ticketTypeId" = t."id"
        FROM "event_ticket_types" t WHERE t."eventId" = a."eventId"`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD "ticketToken" varchar(64) NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text)`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD CONSTRAINT "club_event_attendees_ticket_token" UNIQUE ("ticketToken")`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD "name" varchar(80)`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD "email" varchar(254)`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD "phone" varchar(20)`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD "source" varchar(8) NOT NULL DEFAULT 'app'`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD "newAccount" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD "marketingConsent" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD "paymentStatus" varchar(10) NOT NULL DEFAULT 'free'`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD "amountMinor" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD "currency" varchar(3) NOT NULL DEFAULT 'NGN'`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD "ticketSentAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD "cancelledAt" timestamptz`);

    await queryRunner.query(`
      CREATE TABLE "club_event_checkins" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "attendeeId" uuid NOT NULL REFERENCES "club_event_attendees"("id") ON DELETE CASCADE,
        "eventId" uuid NOT NULL REFERENCES "club_events"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "sessionAt" timestamptz NOT NULL,
        "checkedInBy" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("attendeeId", "sessionAt")
      )`);
    await queryRunner.query(`CREATE INDEX "club_event_checkins_event_idx" ON "club_event_checkins" ("eventId", "sessionAt")`);
    await queryRunner.query(`CREATE INDEX "club_event_checkins_user_idx" ON "club_event_checkins" ("userId")`);
    await queryRunner.query(`
      INSERT INTO "club_event_checkins" ("attendeeId", "eventId", "userId", "sessionAt")
      SELECT "id", "eventId", "userId", "checkedInFor" FROM "club_event_attendees" WHERE "checkedInFor" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "club_event_checkins"`);
    for (const column of ['cancelledAt', 'ticketSentAt', 'currency', 'amountMinor', 'paymentStatus', 'marketingConsent', 'newAccount', 'source', 'phone', 'email', 'name', 'ticketToken', 'ticketTypeId', 'id']) {
      await queryRunner.query(`ALTER TABLE "club_event_attendees" DROP COLUMN "${column}"`);
    }
    await queryRunner.query(`DROP TABLE "event_ticket_types"`);
    await queryRunner.query(`ALTER TABLE "club_events" DROP COLUMN "deletedAt"`);
  }
}
