import type { DataSource } from 'typeorm';
import { COUNTED_STATUSES, countedMetres } from '../running/counted';
import { RANK_ORDER } from '../tables/scoring-engine';
import { boostMessage, pickBoosts, StandingRow } from './standing-boost';
import { LOCAL } from './steps-engagement';

export const STREAK_HEALTH_STEPS = 3000;

const NAME = `COALESCE(NULLIF(split_part(pr."displayName",' ',1),''), pr."username", 'A friend')`;

export async function streakPushes(db: DataSource) {
  await db.query(`WITH people AS (
      SELECT x."userId", x.zone, x.local::date AS day FROM (${LOCAL}) x
      WHERE extract(hour FROM x.local) BETWEEN 18 AND 19
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n."userId"=x."userId" AND n."engagementKey"='streak-push:'||x.local::date::text)
    ), moved AS (
      SELECT a."userId", (a."startedAt" AT TIME ZONE p.zone)::date AS d
      FROM activities a JOIN people p ON p."userId"=a."userId"
      WHERE a."startedAt">now()-interval '120 days' AND a."verificationStatus" IN ${COUNTED_STATUSES}
        AND GREATEST(a."recordedDistanceMetres",a."validatedDistanceMetres",a."stepDistanceMetres")>=100
      UNION
      SELECT d."userId", d.day FROM daily_steps d JOIN people p ON p."userId"=d."userId"
      WHERE d.day>p.day-120 AND d.steps>=${STREAK_HEALTH_STEPS}
    ), due AS (
      SELECT p.* FROM people p
      WHERE EXISTS (SELECT 1 FROM moved m WHERE m."userId"=p."userId" AND m.d=p.day-1)
        AND NOT EXISTS (SELECT 1 FROM moved m WHERE m."userId"=p."userId" AND m.d=p.day)
      LIMIT 500
    ), islands AS (
      SELECT m."userId", m.d, m.d-(row_number() OVER (PARTITION BY m."userId" ORDER BY m.d))::int AS island
      FROM moved m JOIN due ON due."userId"=m."userId"
    ), streaks AS (
      SELECT due."userId", due.day, count(*)::int AS streak FROM due
      JOIN islands i ON i."userId"=due."userId"
      WHERE i.island=(SELECT i2.island FROM islands i2 WHERE i2."userId"=due."userId" AND i2.d=due.day-1)
      GROUP BY due."userId", due.day
    )
    INSERT INTO notifications("userId",type,title,body,link,"engagementKey","engagementChannel","engagementExpiresAt")
    SELECT "userId",'STREAK_REMINDER',
      CASE WHEN streak>=2 THEN '🔥 Your ' || streak || '-day streak ends at midnight' ELSE '🔥 You moved yesterday. Make it two.' END,
      CASE WHEN streak>=7 THEN streak || ' days straight. Don’t let one quiet evening wipe it. A 10-minute walk keeps it alive.'
           WHEN streak>=2 THEN 'A 10-minute walk keeps it going. Record it on Jump, or just get ${STREAK_HEALTH_STEPS.toLocaleString('en-GB')} steps in.'
           ELSE 'Two days in a row is how every streak starts. A short walk tonight does it.' END,
      '/run','streak-push:'||day::text,'push', now()+interval '3 hours'
    FROM streaks
    ON CONFLICT ("userId","engagementKey") WHERE "engagementKey" IS NOT NULL DO NOTHING`);
}

export async function friendsMoving(db: DataSource) {
  await db.query(`WITH people AS (
      SELECT x."userId", x.zone, x.local::date AS day, (x.local::date)::timestamp AT TIME ZONE x.zone AS since FROM (${LOCAL}) x
      WHERE extract(hour FROM x.local) BETWEEN 12 AND 13
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n."userId"=x."userId" AND n."engagementKey"='friends-moving:'||x.local::date::text)
        AND NOT EXISTS (SELECT 1 FROM daily_steps d WHERE d."userId"=x."userId" AND d.day=x.local::date AND d.steps>=4000)
        AND NOT EXISTS (SELECT 1 FROM activities a WHERE a."userId"=x."userId" AND a."startedAt">=(x.local::date)::timestamp AT TIME ZONE x.zone)
        AND EXISTS (SELECT 1 FROM follows f WHERE f."followerId"=x."userId")
      LIMIT 500
    ), friends AS (
      SELECT p."userId", p.day, f."followingId" AS friend,
        GREATEST(
          COALESCE((SELECT d."countedMetres" FROM daily_steps d WHERE d."userId"=f."followingId" AND d.day=p.day), 0),
          COALESCE((SELECT sum(${countedMetres()}) FROM activities a WHERE a."userId"=f."followingId" AND a."startedAt">=p.since AND a."verificationStatus" IN ${COUNTED_STATUSES}), 0)
        ) AS metres
      FROM people p JOIN follows f ON f."followerId"=p."userId"
    ), moving AS (
      SELECT "userId", day, count(*) FILTER (WHERE metres>=1000)::int AS n,
        (array_agg(friend ORDER BY metres DESC))[1] AS top, max(metres) AS best
      FROM friends GROUP BY "userId", day HAVING count(*) FILTER (WHERE metres>=1000)>0
    )
    INSERT INTO notifications("userId",type,title,body,link,"engagementKey","engagementChannel","engagementExpiresAt")
    SELECT m."userId",'FRIENDS_MOVING',
      CASE WHEN m.n=1 THEN '👟 ' || ${NAME} || ' is out moving today'
           ELSE '👟 ' || ${NAME} || ' and ' || (m.n-1) || CASE WHEN m.n=2 THEN ' other are' ELSE ' others are' END || ' moving today' END,
      ${NAME} || ' has done ' || to_char(m.best/1000.0,'FM990.0') || ' km already. A lunchtime walk keeps you in the race.',
      '/feed','friends-moving:'||m.day::text,'push', now()+interval '2 hours'
    FROM moving m JOIN profiles pr ON pr."userId"=m.top
    ON CONFLICT ("userId","engagementKey") WHERE "engagementKey" IS NOT NULL DO NOTHING`);
}

export async function competitionCheckins(db: DataSource) {
  const rows = await db.query(`WITH people AS (
      SELECT x."userId", x.local::date AS day FROM (${LOCAL}) x
      WHERE extract(hour FROM x.local) BETWEEN 16 AND 17
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n."userId"=x."userId" AND n."engagementKey" LIKE 'standing:'||x.local::date::text||'%')
        AND EXISTS (SELECT 1 FROM table_registrations r WHERE r."userId"=x."userId")
      LIMIT 500
    ), live AS (
      SELECT t."id", t."code", t."title", t."scoringMethod", t."challengeType" FROM competition_tables t
      WHERE t."status" IN ('OPEN_FOR_ENTRY','ACTIVE') AND COALESCE(t."startsAt",t."createdAt")<=now()
        AND (t."scoringClosesAt" IS NULL OR t."scoringClosesAt">now())
        AND EXISTS (SELECT 1 FROM table_registrations m JOIN people p ON p."userId"=m."userId" WHERE m."tableId"=t."id")
    ), ranked AS (
      SELECT r."userId", r."tableId", r."score",
        (row_number() OVER w)::int AS "rank", (count(*) OVER (PARTITION BY r."tableId"))::int AS "entrants",
        lag(r."score") OVER w AS "aheadScore", lag(r."userId") OVER w AS "aheadId",
        lead(r."score") OVER w AS "behindScore", lead(r."userId") OVER w AS "behindId"
      FROM table_registrations r JOIN live l ON l."id"=r."tableId"
      WINDOW w AS (PARTITION BY r."tableId" ORDER BY ${RANK_ORDER})
    )
    SELECT x."userId", x."tableId", l."code", l."title", l."scoringMethod", l."challengeType", x."rank", x."entrants",
      x."score", x."aheadScore", ahead."displayName" AS "aheadName", x."behindScore", behind."displayName" AS "behindName", p.day::text AS day
    FROM ranked x JOIN people p ON p."userId"=x."userId" JOIN live l ON l."id"=x."tableId"
    LEFT JOIN profiles ahead ON ahead."userId"=x."aheadId" LEFT JOIN profiles behind ON behind."userId"=x."behindId"`) as Array<StandingRow & { day: string }>;
  const days = new Map(rows.map((row) => [row.userId, row.day]));
  const picked = pickBoosts(rows.map((row) => ({ ...row, score: row.score === null ? null : Number(row.score), aheadScore: row.aheadScore === null ? null : Number(row.aheadScore), behindScore: row.behindScore === null ? null : Number(row.behindScore) })));
  const messages = picked.map((row) => ({ ...boostMessage(row, days.get(row.userId)), key: `standing:${days.get(row.userId)}` }));
  if (!messages.length) return 0;
  const inserted = await db.query(`INSERT INTO notifications("userId",type,title,body,link,"engagementKey","engagementChannel","engagementExpiresAt")
    SELECT m."userId",'COMPETITION_STANDING',m.title,m.body,m.link,m.key,'push',now()+interval '2 hours'
    FROM jsonb_to_recordset($1::jsonb) AS m("userId" uuid, title text, body text, link text, key text)
    ON CONFLICT ("userId","engagementKey") WHERE "engagementKey" IS NOT NULL DO NOTHING RETURNING id`, [JSON.stringify(messages)]) as unknown[];
  return inserted.length;
}
