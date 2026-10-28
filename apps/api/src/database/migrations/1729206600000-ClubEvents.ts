import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClubEvents1729206600000 implements MigrationInterface {
  name = 'ClubEvents1729206600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "club_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "clubId" uuid NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
        "createdBy" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "title" varchar(80) NOT NULL,
        "activity" varchar(8) NOT NULL CHECK ("activity" IN ('run','walk','cycle','any')),
        "notes" varchar(600),
        "weekday" smallint NOT NULL CHECK ("weekday" BETWEEN 0 AND 6),
        "startTime" time NOT NULL,
        "timeZone" varchar(64) NOT NULL,
        "durationMinutes" integer NOT NULL DEFAULT 60 CHECK ("durationMinutes" BETWEEN 15 AND 1440),
        "distanceMetres" integer CHECK ("distanceMetres" BETWEEN 500 AND 200000),
        "venue" varchar(120) NOT NULL,
        "address" varchar(200),
        "latitude" double precision NOT NULL CHECK ("latitude" BETWEEN -90 AND 90),
        "longitude" double precision NOT NULL CHECK ("longitude" BETWEEN -180 AND 180),
        "dayReminderFor" timestamptz,
        "hourReminderFor" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`CREATE INDEX "club_events_club_idx" ON "club_events" ("clubId")`);
    await queryRunner.query(`CREATE INDEX "club_events_place_idx" ON "club_events" ("latitude", "longitude")`);
    await queryRunner.query(`
      CREATE TABLE "club_event_attendees" (
        "eventId" uuid NOT NULL REFERENCES "club_events"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("eventId", "userId")
      )`);
    await queryRunner.query(`CREATE INDEX "club_event_attendees_user_idx" ON "club_event_attendees" ("userId")`);
    await queryRunner.query(`
      CREATE FUNCTION club_event_next("weekday" smallint, "startTime" time, "timeZone" text, "durationMinutes" integer, "at" timestamptz)
      RETURNS timestamptz LANGUAGE sql STABLE AS $$
        SELECT CASE WHEN s + make_interval(mins => "durationMinutes") > "at" THEN s ELSE ((d + 7) + "startTime") AT TIME ZONE "timeZone" END
        FROM (
          SELECT d, (d + "startTime") AT TIME ZONE "timeZone" AS s
          FROM (SELECT ("at" AT TIME ZONE "timeZone")::date + (("weekday" - extract(dow FROM "at" AT TIME ZONE "timeZone")::integer + 7) % 7) AS d) day
        ) slot
      $$`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION club_event_next(smallint, time, text, integer, timestamptz)`);
    await queryRunner.query(`DROP TABLE "club_event_attendees"`);
    await queryRunner.query(`DROP TABLE "club_events"`);
  }
}
