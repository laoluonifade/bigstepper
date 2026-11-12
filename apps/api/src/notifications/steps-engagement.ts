import type { DataSource } from 'typeorm';

export const LOCAL = `
  SELECT u.id AS "userId", z.zone, (now() AT TIME ZONE z.zone) AS local
  FROM users u
  LEFT JOIN notification_preferences np ON np."userId"=u.id
  LEFT JOIN apple_health_links l ON l."userId"=u.id
  CROSS JOIN LATERAL (SELECT COALESCE(np.value->>'timeZone', l."timeZone", 'Africa/Lagos') AS zone) z
  WHERE u."deletedAt" IS NULL AND EXISTS (SELECT 1 FROM pg_timezone_names t WHERE t.name=z.zone)`;

const STEPS = (column: string) => `to_char(${column},'FM999,999,999')`;
const ORDINAL = (column: string) => `${column}::text || CASE WHEN ${column} % 100 BETWEEN 11 AND 13 THEN 'th' WHEN ${column} % 10=1 THEN 'st' WHEN ${column} % 10=2 THEN 'nd' WHEN ${column} % 10=3 THEN 'rd' ELSE 'th' END`;
const NAME = `COALESCE(NULLIF(split_part(pr."displayName",' ',1),''), pr."username", 'A friend')`;

export const STEP_GOAL = 10_000;

export async function stepsBoard(db: DataSource) {
  await db.query(`WITH people AS (
      SELECT x."userId", (x.local::date - 1) AS day FROM (${LOCAL}) x
      JOIN apple_health_links l ON l."userId"=x."userId"
      WHERE extract(hour FROM x.local) BETWEEN 8 AND 10
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n."userId"=x."userId" AND n."engagementKey"='steps-board:'||(x.local::date - 1)::text)
      LIMIT 500
    ), board AS (
      SELECT p."userId", p.day, COALESCE(me.steps,0) AS mine,
        (SELECT count(*) FROM follows f JOIN daily_steps d ON d."userId"=f."followingId" AND d.day=p.day AND d.steps>COALESCE(me.steps,0) WHERE f."followerId"=p."userId")::int + 1 AS rank,
        (SELECT count(*) FROM follows f JOIN daily_steps d ON d."userId"=f."followingId" AND d.day=p.day AND d.steps>0 WHERE f."followerId"=p."userId")::int + 1 AS field,
        top.name, top.steps AS "topSteps"
      FROM people p
      LEFT JOIN daily_steps me ON me."userId"=p."userId" AND me.day=p.day
      JOIN LATERAL (
        SELECT ${NAME} AS name, d.steps FROM follows f
        JOIN daily_steps d ON d."userId"=f."followingId" AND d.day=p.day AND d.steps>0
        JOIN profiles pr ON pr."userId"=f."followingId"
        WHERE f."followerId"=p."userId" ORDER BY d.steps DESC LIMIT 1
      ) top ON true
    )
    INSERT INTO notifications("userId",type,title,body,link,"engagementKey","engagementExpiresAt")
    SELECT "userId",'STEPS_BOARD',
      CASE WHEN mine=0 THEN '👀 ' || name || ' walked ' || ${STEPS('"topSteps"')} || ' steps yesterday'
           WHEN rank=1 THEN '👑 You topped your step board yesterday'
           ELSE '👟 Yesterday’s step board is in' END,
      CASE WHEN mine=0 THEN 'Your steps didn’t make it onto the board. Open Jump to sync today and get back in the race.'
           WHEN rank=1 THEN ${STEPS('mine')} || ' steps, more than everyone you follow. Can you hold the top spot today?'
           ELSE 'You walked ' || ${STEPS('mine')} || ' steps, ' || ${ORDINAL('rank')} || ' of ' || field || '. ' || name || ' led with ' || ${STEPS('"topSteps"')} || '. Catch them today.' END,
      '/feed','steps-board:'||day::text, now()+interval '4 hours'
    FROM board
    ON CONFLICT ("userId","engagementKey") WHERE "engagementKey" IS NOT NULL DO NOTHING`);
}

export async function stepMilestones(db: DataSource) {
  await db.query(`WITH fresh AS (
      SELECT d."userId", d.day, d.steps,
        (SELECT max(o.steps) FROM daily_steps o WHERE o."userId"=d."userId" AND o.day<d.day) AS best,
        (SELECT count(*) FROM daily_steps o WHERE o."userId"=d."userId" AND o.day<d.day)::int AS history
      FROM daily_steps d JOIN (${LOCAL}) x ON x."userId"=d."userId" AND d.day=x.local::date
      WHERE d."updatedAt">now()-interval '45 minutes' AND d.steps>=${STEP_GOAL / 2}
    ), picked AS (
      SELECT "userId", day, steps,
        CASE WHEN history>=7 AND best>=3000 AND steps>best THEN 'best' WHEN steps>=${STEP_GOAL} THEN 'goal' END AS kind
      FROM fresh
    )
    INSERT INTO notifications("userId",type,title,body,link,"engagementKey","engagementExpiresAt")
    SELECT "userId",'STEPS_MILESTONE',
      CASE kind WHEN 'best' THEN '🏆 New personal best: ' || ${STEPS('steps')} || ' steps' ELSE '🎉 ' || ${STEPS(String(STEP_GOAL))} || ' steps today!' END,
      CASE kind WHEN 'best' THEN 'Your most steps in a day on Jump. Everyone you follow will see it on tonight’s Rant.'
           ELSE 'You hit ' || ${STEPS(String(STEP_GOAL))} || ' steps. See how you’re stacking up against everyone you follow.' END,
      '/dashboard','steps-'||kind||':'||day::text, now()+interval '1 hour'
    FROM picked WHERE kind IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n."userId"=picked."userId" AND n."engagementKey" IN ('steps-best:'||day::text,'steps-goal:'||day::text))
    ON CONFLICT ("userId","engagementKey") WHERE "engagementKey" IS NOT NULL DO NOTHING`);
}

export async function stepNudges(db: DataSource) {
  await db.query(`WITH people AS (
      SELECT x."userId", x.local::date AS day, d.steps FROM (${LOCAL}) x
      JOIN daily_steps d ON d."userId"=x."userId" AND d.day=x.local::date AND d."updatedAt">now()-interval '3 hours'
      WHERE extract(hour FROM x.local) BETWEEN 18 AND 19 AND d.steps<${STEP_GOAL / 2}
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n."userId"=x."userId" AND n."engagementKey"='steps-nudge:'||x.local::date::text)
      LIMIT 500
    ), rival AS (
      SELECT p."userId", p.day, p.steps, r.name, r.steps AS "theirs" FROM people p
      LEFT JOIN LATERAL (
        SELECT ${NAME} AS name, d.steps FROM follows f
        JOIN daily_steps d ON d."userId"=f."followingId" AND d.day=p.day AND d."updatedAt">now()-interval '3 hours'
          AND d.steps>p.steps AND d.steps-p.steps<=4000
        JOIN profiles pr ON pr."userId"=f."followingId"
        WHERE f."followerId"=p."userId" ORDER BY d.steps ASC LIMIT 1
      ) r ON true
    )
    INSERT INTO notifications("userId",type,title,body,link,"engagementKey","engagementExpiresAt")
    SELECT "userId",'STEPS_NUDGE',
      CASE WHEN name IS NOT NULL THEN name || ' is ' || ${STEPS('"theirs" - steps')} || ' steps ahead of you' ELSE 'You’re on ' || ${STEPS('steps')} || ' steps today' END,
      CASE WHEN name IS NOT NULL THEN 'A 20-minute walk is about 2,500 steps. Enough to pass them before tonight’s board.'
           ELSE 'A short evening walk gets you past ' || ${STEPS(String(STEP_GOAL / 2))} || '. Record it on Jump and it counts.' END,
      '/run','steps-nudge:'||day::text, now()+interval '90 minutes'
    FROM rival
    ON CONFLICT ("userId","engagementKey") WHERE "engagementKey" IS NOT NULL DO NOTHING`);
}

export async function healthConnectReminders(db: DataSource) {
  await db.query(`WITH people AS (
      SELECT x."userId", floor(extract(epoch FROM now())/(3*86400))::bigint AS slot FROM (${LOCAL}) x
      JOIN users u ON u.id=x."userId" AND u."createdAt"<now()-interval '1 day'
      WHERE extract(hour FROM x.local) BETWEEN 10 AND 12
        AND EXISTS (SELECT 1 FROM push_tokens t WHERE t."userId"=x."userId" AND t.platform='ios')
        AND NOT EXISTS (SELECT 1 FROM apple_health_links l WHERE l."userId"=x."userId")
        AND (SELECT count(*) FROM notifications n WHERE n."userId"=x."userId" AND n.type='HEALTH_CONNECT')<4
      LIMIT 500
    )
    INSERT INTO notifications("userId",type,title,body,link,"engagementKey","engagementChannel","engagementExpiresAt")
    SELECT "userId",'HEALTH_CONNECT','Your steps aren’t counting yet',
      'Connect Apple Health once and every step you take counts on Jump, from today.',
      '/health','health-connect:'||slot::text,'push', now()+interval '3 hours'
    FROM people
    ON CONFLICT ("userId","engagementKey") WHERE "engagementKey" IS NOT NULL DO NOTHING`);
}
