import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventSchedulesAndPasses1729206800000 implements MigrationInterface {
  name = 'EventSchedulesAndPasses1729206800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "club_events" ADD COLUMN IF NOT EXISTS "coverUrl" text`);
    await queryRunner.query(`ALTER TABLE "club_events" ADD "repeat" varchar(8) NOT NULL DEFAULT 'weekly' CHECK ("repeat" IN ('once','daily','weekly','monthly'))`);
    await queryRunner.query(`ALTER TABLE "club_events" ADD "repeatEvery" smallint NOT NULL DEFAULT 1 CHECK ("repeatEvery" BETWEEN 1 AND 12)`);
    await queryRunner.query(`ALTER TABLE "club_events" ADD "weekdays" smallint[] NOT NULL DEFAULT '{}'`);
    await queryRunner.query(`ALTER TABLE "club_events" ADD "monthMode" varchar(8) CHECK ("monthMode" IN ('date','weekday'))`);
    await queryRunner.query(`ALTER TABLE "club_events" ADD "monthWeek" smallint CHECK ("monthWeek" BETWEEN 1 AND 5)`);
    await queryRunner.query(`ALTER TABLE "club_events" ADD "startsOn" date`);
    await queryRunner.query(`ALTER TABLE "club_events" ADD "endsOn" date`);
    await queryRunner.query(`
      UPDATE "club_events" SET "startsOn" = ("createdAt" AT TIME ZONE "timeZone")::date
        + (("weekday" - extract(dow FROM "createdAt" AT TIME ZONE "timeZone")::integer + 7) % 7),
        "weekdays" = ARRAY["weekday"]::smallint[]`);
    await queryRunner.query(`ALTER TABLE "club_events" ALTER COLUMN "startsOn" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "club_events" ADD CONSTRAINT "club_events_schedule" CHECK (
      ("repeat" <> 'weekly' OR cardinality("weekdays") > 0)
      AND (("repeat" = 'monthly') = ("monthMode" IS NOT NULL))
      AND (("monthMode" = 'weekday') IS NOT DISTINCT FROM ("monthWeek" IS NOT NULL) OR "monthMode" IS NULL AND "monthWeek" IS NULL)
      AND ("endsOn" IS NULL OR "endsOn" >= "startsOn"))`);
    await queryRunner.query(`DROP FUNCTION club_event_next(smallint, time, text, integer, timestamptz)`);
    await queryRunner.query(`ALTER TABLE "club_events" DROP COLUMN "weekday"`);
    await queryRunner.query(`
      CREATE FUNCTION club_event_next("repeat" text, "repeatEvery" smallint, "weekdays" smallint[], "monthMode" text, "monthWeek" smallint,
        "startsOn" date, "endsOn" date, "startTime" time, "timeZone" text, "durationMinutes" integer, "at" timestamptz)
      RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
      DECLARE
        d date := greatest("startsOn", ("at" AT TIME ZONE "timeZone")::date - 2);
        months integer;
        s timestamptz;
        fits boolean;
      BEGIN
        FOR i IN 0..800 LOOP
          IF "endsOn" IS NOT NULL AND d > "endsOn" THEN RETURN NULL; END IF;
          months := (extract(year FROM d) - extract(year FROM "startsOn"))::integer * 12 + (extract(month FROM d) - extract(month FROM "startsOn"))::integer;
          fits := CASE "repeat"
            WHEN 'once' THEN d = "startsOn"
            WHEN 'daily' THEN (d - "startsOn") % "repeatEvery" = 0
            WHEN 'weekly' THEN extract(dow FROM d)::smallint = ANY("weekdays")
              AND ((d - extract(dow FROM d)::integer) - ("startsOn" - extract(dow FROM "startsOn")::integer)) / 7 % "repeatEvery" = 0
            ELSE months % "repeatEvery" = 0 AND CASE
              WHEN "monthMode" = 'date' THEN extract(day FROM d) = least(extract(day FROM "startsOn"), extract(day FROM (date_trunc('month', d) + interval '1 month - 1 day')))
              ELSE extract(dow FROM d) = extract(dow FROM "startsOn")
                AND CASE WHEN "monthWeek" = 5 THEN extract(month FROM d + 7) <> extract(month FROM d)
                         ELSE ceil(extract(day FROM d) / 7) = "monthWeek" END
            END
          END;
          IF fits THEN
            s := (d + "startTime") AT TIME ZONE "timeZone";
            IF s + make_interval(mins => "durationMinutes") > "at" THEN RETURN s; END IF;
            IF "repeat" = 'once' THEN RETURN NULL; END IF;
          END IF;
          d := d + 1;
        END LOOP;
        RETURN NULL;
      END
      $$`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD "passCode" varchar(12)`);
    await queryRunner.query(`
      UPDATE "club_event_attendees" SET "passCode" = 'JMP-' || upper(substr(md5(random()::text || "eventId"::text || "userId"::text), 1, 6))`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ALTER COLUMN "passCode" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD CONSTRAINT "club_event_attendees_pass_code" UNIQUE ("passCode")`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" ADD "checkedInFor" timestamptz`);
    await queryRunner.query(`ALTER TABLE "profiles" ADD "exploreLens" varchar(12) NOT NULL DEFAULT 'all' CHECK ("exploreLens" IN ('all','events','competitions'))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "exploreLens"`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" DROP COLUMN "checkedInFor"`);
    await queryRunner.query(`ALTER TABLE "club_event_attendees" DROP COLUMN "passCode"`);
    await queryRunner.query(`DROP FUNCTION club_event_next(text, smallint, smallint[], text, smallint, date, date, time, text, integer, timestamptz)`);
    await queryRunner.query(`ALTER TABLE "club_events" ADD "weekday" smallint CHECK ("weekday" BETWEEN 0 AND 6)`);
    await queryRunner.query(`UPDATE "club_events" SET "weekday" = extract(dow FROM "startsOn")::smallint`);
    await queryRunner.query(`ALTER TABLE "club_events" ALTER COLUMN "weekday" SET NOT NULL`);
    await queryRunner.query(`
      CREATE FUNCTION club_event_next("weekday" smallint, "startTime" time, "timeZone" text, "durationMinutes" integer, "at" timestamptz)
      RETURNS timestamptz LANGUAGE sql STABLE AS $$
        SELECT CASE WHEN s + make_interval(mins => "durationMinutes") > "at" THEN s ELSE ((d + 7) + "startTime") AT TIME ZONE "timeZone" END
        FROM (
          SELECT d, (d + "startTime") AT TIME ZONE "timeZone" AS s
          FROM (SELECT ("at" AT TIME ZONE "timeZone")::date + (("weekday" - extract(dow FROM "at" AT TIME ZONE "timeZone")::integer + 7) % 7) AS d) day
        ) slot
      $$`);
    await queryRunner.query(`ALTER TABLE "club_events" DROP CONSTRAINT "club_events_schedule"`);
    for (const column of ['endsOn', 'startsOn', 'monthWeek', 'monthMode', 'weekdays', 'repeatEvery', 'repeat']) {
      await queryRunner.query(`ALTER TABLE "club_events" DROP COLUMN "${column}"`);
    }
  }
}
