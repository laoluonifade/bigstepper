import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { PUSH_NOTIFICATIONS_QUEUE } from '../jobs/jobs.module';
import { EngagementService } from './engagement.service';

@Injectable()
export class EngagementProcessor implements OnModuleInit {
  constructor(
    private readonly db: DataSource,
    private readonly policy: EngagementService,
    @InjectQueue(PUSH_NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) {}
  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      'engagement-evaluation',
      { every: 15 * 60_000 },
      { name: 'engagement-evaluation' },
    );
  }
  async process(job: Job) {
    if (job.name !== 'engagement-evaluation') return;
    const settings = await this.policy.settings();
    if (!settings.newTriggersEnabled || !settings.deliveryEnabled || settings.rolloutPercent <= 0) return;
    if (settings.triggers.weeklyRecap) await this.weeklyRecaps();
    if (settings.triggers.weeklyGoal) await this.weeklyGoals();
    if (settings.triggers.deadlines) await this.deadlines();
  }
  async weeklyRecaps() {
    await this.db.query(`WITH due AS (
      SELECT u.id AS "userId", np.value->>'timeZone' AS zone,
        date_trunc('week',now() AT TIME ZONE (np.value->>'timeZone')) AS week
      FROM users u JOIN notification_preferences np ON np."userId"=u.id
      WHERE u."deletedAt" IS NULL AND EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=np.value->>'timeZone')
        AND extract(hour FROM now() AT TIME ZONE (np.value->>'timeZone')) BETWEEN 9 AND 18
        AND (EXISTS(SELECT 1 FROM activities a WHERE a."userId"=u.id AND a."verificationStatus"='VERIFIED' AND a."activityType" IN ('run','walk')
          AND a."startedAt">=(date_trunc('week',now() AT TIME ZONE (np.value->>'timeZone'))-interval '1 week') AT TIME ZONE (np.value->>'timeZone')
          AND a."finishedAt"<=date_trunc('week',now() AT TIME ZONE (np.value->>'timeZone')) AT TIME ZONE (np.value->>'timeZone'))
          OR EXISTS(SELECT 1 FROM club_memberships mine JOIN clubs eligible ON eligible.id=mine."clubId" AND eligible."suspendedAt" IS NULL
            JOIN club_memberships members ON members."clubId"=mine."clubId" JOIN users member ON member.id=members."userId" AND member."deletedAt" IS NULL
            JOIN activities a ON a."userId"=members."userId" AND a."verificationStatus"='VERIFIED' AND a."activityType" IN ('run','walk')
              AND a."startedAt">=(date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '1 week'
              AND a."finishedAt"<=date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
            WHERE mine."userId"=u.id AND NOT jsonb_path_exists(np.value, '$.categories.clubs.* ? (@ == false)')))
        AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n."userId"=u.id AND n."engagementKey"='recap:'||to_char(date_trunc('week',now() AT TIME ZONE (np.value->>'timeZone')),'YYYY-MM-DD'))
      ORDER BY u.id LIMIT 100
    ), movement AS (
      SELECT d."userId",d.week,d.zone,count(a.id)::int AS sessions,
        COALESCE(sum(GREATEST(a."validatedDistanceMetres",a."stepDistanceMetres")),0)::bigint AS metres,
        COALESCE(sum(a."validatedSteps") FILTER(WHERE a."stepsSource"='sensor'),0)::bigint AS steps
      FROM due d LEFT JOIN activities a ON a."userId"=d."userId" AND a."verificationStatus"='VERIFIED'
        AND a."activityType" IN ('run','walk') AND a."startedAt">=(d.week-interval '1 week') AT TIME ZONE d.zone
        AND a."finishedAt"<=d.week AT TIME ZONE d.zone GROUP BY d."userId",d.week,d.zone
    ), club_totals AS (
      SELECT c.id,c.name,count(DISTINCT a."userId")::int AS movers,
        COALESCE(sum(GREATEST(a."validatedDistanceMetres",a."stepDistanceMetres")),0)::bigint AS metres
      FROM clubs c JOIN club_memberships m ON m."clubId"=c.id
      JOIN users member ON member.id=m."userId" AND member."deletedAt" IS NULL
      LEFT JOIN activities a ON a."userId"=m."userId" AND a."verificationStatus"='VERIFIED' AND a."activityType" IN ('run','walk')
        AND a."startedAt">=(date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '1 week'
        AND a."finishedAt"<=date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      WHERE c."suspendedAt" IS NULL AND c.id IN(SELECT mine."clubId" FROM club_memberships mine JOIN due ON due."userId"=mine."userId")
      GROUP BY c.id,c.name
    ), summaries AS (
      SELECT d."userId",string_agg(c.name||': '||c.movers||' members logged '||round(c.metres/1000.0,1)||' km.', ' ' ORDER BY c.name) FILTER (WHERE c.movers>0) AS text
      FROM due d JOIN notification_preferences np ON np."userId"=d."userId"
      JOIN club_memberships mine ON mine."userId"=d."userId" JOIN club_totals c ON c.id=mine."clubId"
      WHERE NOT jsonb_path_exists(np.value, '$.categories.clubs.* ? (@ == false)')
      GROUP BY d."userId"
    )
    INSERT INTO notifications("userId",type,title,body,link,"engagementKey","engagementChannel","engagementExpiresAt")
    SELECT m."userId",'WEEKLY_RECAP','Your weekly movement recap',
      'Last week you logged '||m.sessions||' verified walks/runs, '||round(m.metres/1000.0,1)||' km and '||m.steps||' measured steps.'||
      CASE WHEN s.text IS NOT NULL THEN ' Club week (UTC): '||s.text ELSE '' END,
      '/activities','recap:'||to_char(m.week,'YYYY-MM-DD'),'email',now()+interval '2 days'
    FROM movement m LEFT JOIN summaries s ON s."userId"=m."userId" WHERE m.sessions>0 OR s.text IS NOT NULL
    ON CONFLICT ("userId","engagementKey") WHERE "engagementKey" IS NOT NULL DO NOTHING`);
  }
  async weeklyGoals() {
    await this.db.query(`WITH progress AS (
      SELECT p."userId",p."weeklyGoalMetres",date_trunc('week',now() AT TIME ZONE (np.value->>'timeZone')) AS week,
        COALESCE(sum(GREATEST(a."validatedDistanceMetres",a."stepDistanceMetres")),0) AS metres
      FROM profiles p JOIN users u ON u.id=p."userId" AND u."deletedAt" IS NULL
      JOIN notification_preferences np ON np."userId"=p."userId"
      JOIN activities a ON a."userId"=p."userId" AND a."verificationStatus"='VERIFIED' AND a."activityType" IN ('run','walk')
        AND a."startedAt">=date_trunc('week',now() AT TIME ZONE (np.value->>'timeZone')) AT TIME ZONE (np.value->>'timeZone')
        AND a."finishedAt"<=now()
      WHERE p."weeklyGoalMetres">0
      GROUP BY p."userId",p."weeklyGoalMetres",np.value
      HAVING sum(GREATEST(a."validatedDistanceMetres",a."stepDistanceMetres"))>=p."weeklyGoalMetres"
        AND max(a."finishedAt")>now()-interval '30 minutes'
    ) INSERT INTO notifications("userId",type,title,body,link,"engagementKey","engagementChannel","engagementExpiresAt")
      SELECT "userId",'WEEKLY_GOAL','You reached your weekly goal',
        'Your verified walks and runs reached your '||round("weeklyGoalMetres"/1000.0,1)||' km weekly goal. View your progress.',
        '/activities','weekly-goal:'||to_char(week,'YYYY-MM-DD'),'push',now()+interval '30 minutes' FROM progress
      ON CONFLICT("userId","engagementKey") WHERE "engagementKey" IS NOT NULL DO NOTHING`);
  }
  async deadlines() {
    await this.db.query(`WITH due AS (
      SELECT r."userId",t.code,t.title,t.id,'COMPETITION_STARTING' AS type,'Starts within an hour. View the rules and your entry.' AS body,t."startsAt" AS deadline
      FROM competition_tables t JOIN table_registrations r ON r."tableId"=t.id
      WHERE t.status IN ('OPEN_FOR_ENTRY','ENTRY_CLOSED','ACTIVE') AND t."deletedAt" IS NULL AND t."archivedAt" IS NULL
        AND t."startsAt">now() AND t."startsAt"<=now()+interval '1 hour'
      UNION ALL
      SELECT r."userId",t.code,t.title,t.id,'COMPETITION_ENDING','Scoring closes within an hour. View your competition.',t."scoringClosesAt"
      FROM competition_tables t JOIN table_registrations r ON r."tableId"=t.id
      WHERE t.status IN ('OPEN_FOR_ENTRY','ENTRY_CLOSED','ACTIVE') AND t."deletedAt" IS NULL AND t."archivedAt" IS NULL
        AND COALESCE(t."startsAt",t."createdAt")<=now() AND t."scoringClosesAt">now() AND t."scoringClosesAt"<=now()+interval '1 hour'
    ) INSERT INTO notifications("userId",type,title,body,link,"engagementKey","engagementChannel","engagementExpiresAt")
      SELECT "userId",type,title,body,'/competitions/'||code,type||':'||id::text||':'||deadline::text,'push',deadline FROM due
      WHERE NOT EXISTS(SELECT 1 FROM notifications n WHERE n."userId"=due."userId" AND n."engagementKey"=due.type||':'||due.id::text||':'||due.deadline::text)
      ORDER BY deadline LIMIT 200
      ON CONFLICT("userId","engagementKey") WHERE "engagementKey" IS NOT NULL DO NOTHING`);
  }
}
