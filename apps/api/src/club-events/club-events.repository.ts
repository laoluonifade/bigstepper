import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { Db, id, num, row, rows, run, text, when } from '../database/sql';
import { hasPostgis } from '../database/postgis';

export type EventActivity = 'run' | 'walk' | 'cycle' | 'any';
export type EventRepeat = 'once' | 'daily' | 'weekly' | 'monthly';

export interface EventInput {
  title: string;
  activity: EventActivity;
  notes?: string | null;
  repeat: EventRepeat;
  repeatEvery?: number;
  weekdays?: number[];
  monthMode?: 'date' | 'weekday' | null;
  monthWeek?: number | null;
  startsOn: string;
  endsOn?: string | null;
  startTime: string;
  timeZone: string;
  durationMinutes: number;
  distanceMetres?: number | null;
  venue?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

const face = z.object({ displayName: text.nullable(), avatarUrl: text.nullable(), avatarStyle: text });

export const eventRow = z.object({
  id, slug: text, clubId: id, title: text, activity: z.enum(['run', 'walk', 'cycle', 'any']), notes: text.nullable(),
  repeat: z.enum(['once', 'daily', 'weekly', 'monthly']), repeatEvery: num, weekdays: z.array(num), monthMode: z.enum(['date', 'weekday']).nullable(),
  monthWeek: num.nullable(), startsOn: text, endsOn: text.nullable(), weekday: num,
  startTime: text, timeZone: text, durationMinutes: num, distanceMetres: num.nullable(),
  venue: text.nullable(), address: text.nullable(), coverUrl: text.nullable(), latitude: num.nullable(), longitude: num.nullable(), nextAt: when.nullable(),
  club: z.object({ id, slug: text, name: text, logoUrl: text.nullable(), accentColor: text, verified: z.boolean(), privacy: text }),
  attendeeCount: num, going: z.boolean(), canManage: z.boolean(), faces: z.array(face), distanceKm: num.nullable(),
  pass: z.object({ code: text, checkedIn: z.boolean() }).nullable(),
  draft: z.boolean(),
  isHost: z.boolean(),
});
export type EventRow = z.output<typeof eventRow>;

const clubRow = z.object({ id, slug: text, name: text, privacy: text, suspended: z.boolean(), role: text.nullable() });
export type EventClub = z.output<typeof clubRow>;

const reminderRow = z.object({ id, title: text, venue: text, timeZone: text, clubName: text, nextAt: when });
export type ReminderRow = z.output<typeof reminderRow>;

export const guestRow = z.object({
  userId: id, username: text.nullable(), displayName: text.nullable(), avatarUrl: text.nullable(), avatarStyle: text,
  passCode: text, checkedIn: z.boolean(), joinedAt: when,
});

const RESERVED_SLUGS = new Set(['', 'drafts', 'event']);

export function eventSlug(title: string) {
  const name = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
  return RESERVED_SLUGS.has(name) ? `event-${Math.random().toString(36).slice(2, 6)}` : name;
}

const NEXT = `club_event_next(e."repeat", e."repeatEvery", e."weekdays", e."monthMode", e."monthWeek", e."startsOn", e."endsOn", e."startTime", e."timeZone", e."durationMinutes", now())`;
const KM = `(6371 * 2 * asin(sqrt(power(sin(radians(e."latitude" - $2::float8) / 2), 2)
  + cos(radians($2::float8)) * cos(radians(e."latitude")) * power(sin(radians(e."longitude" - $3::float8) / 2), 2))))`;

const select = (where: string) => `
  SELECT e."id", e."slug", e."clubId", e."title", e."activity", e."notes", e."repeat", e."repeatEvery", e."weekdays", e."monthMode", e."monthWeek",
         to_char(e."startsOn", 'YYYY-MM-DD') AS "startsOn", to_char(e."endsOn", 'YYYY-MM-DD') AS "endsOn",
         extract(dow FROM e."startsOn")::integer AS "weekday", to_char(e."startTime", 'HH24:MI') AS "startTime",
         e."timeZone", e."durationMinutes", e."distanceMetres", e."venue", e."address", e."coverUrl", e."latitude", e."longitude", ${NEXT} AS "nextAt",
         json_build_object('id', c."id", 'slug', c."slug", 'name', c."name", 'logoUrl', c."logoUrl", 'accentColor', c."accentColor",
           'verified', c."verifiedAt" IS NOT NULL, 'privacy', c."privacy") AS "club",
         (SELECT count(*)::integer FROM "club_event_attendees" a WHERE a."eventId" = e."id") AS "attendeeCount",
         EXISTS (SELECT 1 FROM "club_event_attendees" a WHERE a."eventId" = e."id" AND a."userId" = $1::uuid) AS "going",
         (SELECT json_build_object('code', a."passCode", 'checkedIn', a."checkedInFor" IS NOT NULL AND a."checkedInFor" = ${NEXT})
            FROM "club_event_attendees" a WHERE a."eventId" = e."id" AND a."userId" = $1::uuid) AS "pass",
         COALESCE(m."role" IN ('owner', 'admin'), false) AS "canManage",
         (SELECT COALESCE(json_agg(json_build_object('displayName', f."displayName", 'avatarUrl', f."avatarUrl", 'avatarStyle', f."avatarStyle") ORDER BY f."createdAt"), '[]'::json)
            FROM (SELECT p."displayName", p."avatarUrl", a."createdAt",
                         CASE WHEN p."gender" = 'male' THEN 'masculine' WHEN p."gender" = 'female' THEN 'feminine' ELSE 'neutral' END AS "avatarStyle"
                    FROM "club_event_attendees" a JOIN "profiles" p ON p."userId" = a."userId"
                   WHERE a."eventId" = e."id" ORDER BY a."createdAt" LIMIT 5) f) AS "faces",
         CASE WHEN $2::float8 IS NULL OR $3::float8 IS NULL THEN NULL ELSE ${KM} END AS "distanceKm",
         e."publishedAt" IS NULL AS "draft",
         COALESCE(e."createdBy" = $1::uuid, false) AS "isHost"
    FROM "club_events" e
    JOIN "clubs" c ON c."id" = e."clubId"
    LEFT JOIN "club_memberships" m ON m."clubId" = c."id" AND m."userId" = $1::uuid
   WHERE (e."publishedAt" IS NOT NULL OR COALESCE(m."role" IN ('owner', 'admin'), false))
     AND ${where}`;

@Injectable()
export class ClubEventsRepository {
  constructor(readonly dataSource: DataSource) {}

  club(ref: string, viewerId: string | null) {
    return row(this.dataSource, clubRow,
      `SELECT c."id", c."slug", c."name", c."privacy", c."suspendedAt" IS NOT NULL AS "suspended", m."role"
         FROM "clubs" c LEFT JOIN "club_memberships" m ON m."clubId" = c."id" AND m."userId" = $2::uuid
        WHERE lower(c."slug") = lower($1) OR c."id"::text = lower($1)`, [ref.trim().replace(/^\/+/, ''), viewerId]);
  }

  forClub(clubId: string, viewerId: string | null) {
    return rows(this.dataSource, eventRow, `SELECT * FROM (${select(`e."clubId" = $4`)}) found WHERE "nextAt" IS NOT NULL ORDER BY "nextAt"`, [viewerId, null, null, clubId]);
  }

  one(eventId: string, viewerId: string | null, latitude: number | null = null, longitude: number | null = null) {
    return row(this.dataSource, eventRow, select(`(e."id"::text = $4::text OR e."slug" = $4::text)`), [viewerId, latitude, longitude, eventId]);
  }

  async nearby(viewerId: string, latitude: number, longitude: number, km: number) {
    if (await hasPostgis(this.dataSource)) {
      return rows(this.dataSource, eventRow,
        `SELECT * FROM (${select(`c."suspendedAt" IS NULL AND e."place" IS NOT NULL
           AND ST_DWithin(e."place", ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography, $4::float8 * 1000)`)}) found
          WHERE "nextAt" IS NOT NULL ORDER BY "nextAt", "distanceKm" LIMIT 60`,
        [viewerId, latitude, longitude, km]);
    }
    const spread = km / 111;
    return rows(this.dataSource, eventRow,
      `SELECT * FROM (${select(`c."suspendedAt" IS NULL
         AND e."latitude" BETWEEN $2::float8 - $4::float8 AND $2::float8 + $4::float8
         AND e."longitude" BETWEEN $3::float8 - $4::float8 / greatest(cos(radians($2::float8)), 0.05) AND $3::float8 + $4::float8 / greatest(cos(radians($2::float8)), 0.05)`)}) found
        WHERE "distanceKm" <= $5 AND "nextAt" IS NOT NULL ORDER BY "nextAt", "distanceKm" LIMIT 60`,
      [viewerId, latitude, longitude, spread, km]);
  }

  /** Published events from open, active clubs for the public Explore and landing pages. */
  upcoming() {
    return rows(this.dataSource, eventRow,
      `SELECT * FROM (${select(`c."suspendedAt" IS NULL`)}) found
       WHERE "nextAt" IS NOT NULL ORDER BY "nextAt" LIMIT 12`,
      [null, null, null]);
  }

  going(viewerId: string) {
    return rows(this.dataSource, eventRow,
      `SELECT * FROM (${select(`EXISTS (SELECT 1 FROM "club_event_attendees" a WHERE a."eventId" = e."id" AND a."userId" = $1::uuid)`)}) found WHERE "nextAt" IS NOT NULL ORDER BY "nextAt"`,
      [viewerId, null, null]);
  }

  fromClubs(viewerId: string) {
    return rows(this.dataSource, eventRow,
      `SELECT * FROM (${select(`c."suspendedAt" IS NULL AND (m."userId" IS NOT NULL OR EXISTS (SELECT 1 FROM "club_follows" f WHERE f."clubId" = c."id" AND f."userId" = $1::uuid))`)}) found
        WHERE "nextAt" IS NOT NULL ORDER BY "nextAt" LIMIT 40`,
      [viewerId, null, null]);
  }

  drafts(viewerId: string) {
    return rows(this.dataSource, eventRow,
      `${select(`e."publishedAt" IS NULL AND m."role" IN ('owner', 'admin')`)} ORDER BY e."updatedAt" DESC`, [viewerId, null, null]);
  }

  publish(eventId: string) {
    return row(this.dataSource, z.object({ id }),
      `WITH done AS (UPDATE "club_events" SET "publishedAt" = now(), "updatedAt" = now() WHERE "id" = $1 AND "publishedAt" IS NULL RETURNING "id") SELECT * FROM done`, [eventId]);
  }

  setCover(eventId: string, coverUrl: string | null) {
    return run(this.dataSource, `UPDATE "club_events" SET "coverUrl"=$2,"updatedAt"=now() WHERE "id"=$1`, [eventId, coverUrl]);
  }

  async count(clubId: string) {
    return (await row(this.dataSource, z.object({ n: num }), `SELECT count(*)::integer AS "n" FROM "club_events" WHERE "clubId" = $1`, [clubId]))?.n ?? 0;
  }

  async insert(db: Db, clubId: string, createdBy: string, input: EventInput, draft = false) {
    return (await row(db, z.object({ id }),
      `INSERT INTO "club_events" ("clubId","createdBy","title","activity","notes","repeat","repeatEvery","weekdays","monthMode","monthWeek","startsOn","endsOn",
         "startTime","timeZone","durationMinutes","distanceMetres","venue","address","latitude","longitude","publishedAt","slug")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,CASE WHEN $21 THEN NULL ELSE now() END,
         CASE WHEN EXISTS (SELECT 1 FROM "club_events" WHERE "slug" = $22::text) THEN $22::text || '-' || substr(md5(random()::text), 1, 4) ELSE $22::text END) RETURNING "id"`,
      [clubId, createdBy, input.title, input.activity, input.notes ?? null, input.repeat, input.repeatEvery ?? 1, input.weekdays ?? [], input.monthMode ?? null,
        input.monthWeek ?? null, input.startsOn, input.endsOn ?? null, input.startTime, input.timeZone,
        input.durationMinutes, input.distanceMetres ?? null, input.venue ?? null, input.address ?? null, input.latitude ?? null, input.longitude ?? null, draft, eventSlug(input.title)]))!.id;
  }

  update(eventId: string, input: EventInput) {
    return run(this.dataSource,
      `UPDATE "club_events" SET "title"=$2,"activity"=$3,"notes"=$4,"repeat"=$5,"repeatEvery"=$6,"weekdays"=$7,"monthMode"=$8,"monthWeek"=$9,"startsOn"=$10,"endsOn"=$11,
         "startTime"=$12,"timeZone"=$13,"durationMinutes"=$14,"distanceMetres"=$15,"venue"=$16,"address"=$17,"latitude"=$18,"longitude"=$19,
         "dayReminderFor"=NULL,"hourReminderFor"=NULL,"updatedAt"=now()
       WHERE "id"=$1`,
      [eventId, input.title, input.activity, input.notes ?? null, input.repeat, input.repeatEvery ?? 1, input.weekdays ?? [], input.monthMode ?? null,
        input.monthWeek ?? null, input.startsOn, input.endsOn ?? null, input.startTime, input.timeZone,
        input.durationMinutes, input.distanceMetres ?? null, input.venue ?? null, input.address ?? null, input.latitude ?? null, input.longitude ?? null]);
  }

  remove(eventId: string) {
    return run(this.dataSource, `DELETE FROM "club_events" WHERE "id"=$1`, [eventId]);
  }

  async join(eventId: string, clubId: string, userId: string, passCode: string) {
    await this.dataSource.transaction(async (db) => {
      await run(db, `INSERT INTO "club_event_attendees" ("eventId","userId","passCode") VALUES ($1,$2,$3) ON CONFLICT ("eventId","userId") DO NOTHING`, [eventId, userId, passCode]);
      await run(db, `INSERT INTO "club_follows" ("clubId","userId") VALUES ($1,$2) ON CONFLICT DO NOTHING`, [clubId, userId]);
    });
  }

  guests(eventId: string) {
    return rows(this.dataSource, guestRow,
      `SELECT a."userId", p."username", p."displayName", p."avatarUrl", a."passCode", a."createdAt" AS "joinedAt",
              CASE WHEN p."gender" = 'male' THEN 'masculine' WHEN p."gender" = 'female' THEN 'feminine' ELSE 'neutral' END AS "avatarStyle",
              a."checkedInFor" IS NOT NULL AND a."checkedInFor" = ${NEXT} AS "checkedIn"
         FROM "club_event_attendees" a
         JOIN "club_events" e ON e."id" = a."eventId"
         LEFT JOIN "profiles" p ON p."userId" = a."userId"
        WHERE a."eventId" = $1
        ORDER BY lower(COALESCE(p."displayName", ''))`, [eventId]);
  }

  async checkIn(eventId: string, match: { code?: string; userId?: string }, on: boolean) {
    return (await rows(this.dataSource, z.object({ userId: id }),
      `WITH hit AS (
         UPDATE "club_event_attendees" a SET "checkedInFor" = CASE WHEN $4 THEN ${NEXT} ELSE NULL END
           FROM "club_events" e
          WHERE e."id" = a."eventId" AND a."eventId" = $1 AND (a."passCode" = upper($2) OR a."userId" = $3::uuid)
          RETURNING a."userId"
       ) SELECT * FROM hit`,
      [eventId, match.code ?? '', match.userId ?? null, on]))[0]?.userId ?? null;
  }

  leave(eventId: string, userId: string) {
    return run(this.dataSource, `DELETE FROM "club_event_attendees" WHERE "eventId"=$1 AND "userId"=$2`, [eventId, userId]);
  }

  announce(db: Db, clubId: string, actorId: string, title: string, body: string, link: string) {
    return run(db,
      `INSERT INTO "notifications" ("userId","type","title","body","link","emailProcessedAt")
       SELECT DISTINCT people."userId", 'CLUB_EVENT', $3, $4, $5, now()
         FROM (SELECT "userId" FROM "club_memberships" WHERE "clubId"=$1 UNION SELECT "userId" FROM "club_follows" WHERE "clubId"=$1) people
        WHERE people."userId" <> $2`,
      [clubId, actorId, title, body, link]);
  }

  due(column: 'dayReminderFor' | 'hourReminderFor', lead: string, floor: string) {
    return rows(this.dataSource, reminderRow,
      `WITH due AS (
         SELECT e."id", ${NEXT} AS "nextAt"
           FROM "club_events" e JOIN "clubs" c ON c."id" = e."clubId"
          WHERE c."suspendedAt" IS NULL AND e."publishedAt" IS NOT NULL AND e."venue" IS NOT NULL AND EXISTS (SELECT 1 FROM "club_event_attendees" a WHERE a."eventId" = e."id")
       ), claimed AS (
         UPDATE "club_events" e SET "${column}" = due."nextAt"
           FROM due
          WHERE e."id" = due."id" AND due."nextAt" > now() + interval '${floor}' AND due."nextAt" <= now() + interval '${lead}'
            AND e."${column}" IS DISTINCT FROM due."nextAt"
          RETURNING e."id", e."title", e."venue", e."timeZone", e."clubId", due."nextAt"
       )
       SELECT claimed."id", claimed."title", claimed."venue", claimed."timeZone", claimed."nextAt", c."name" AS "clubName"
         FROM claimed JOIN "clubs" c ON c."id" = claimed."clubId"`);
  }

  remind(eventId: string, title: string, body: string) {
    return run(this.dataSource,
      `INSERT INTO "notifications" ("userId","type","title","body","link","emailProcessedAt")
       SELECT a."userId", 'CLUB_EVENT_REMINDER', $2, $3, '/events/' || a."eventId"::text, now()
         FROM "club_event_attendees" a WHERE a."eventId" = $1`,
      [eventId, title, body]);
  }
}
