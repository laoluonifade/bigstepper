import { EntityManager } from 'typeorm';
import { refreshLeagueDistance } from '../leagues/league-credits';
import { creditActivities, uncreditActivity } from '../tables/competition-credits';

type Counted = { id: string; userId: string; activityType: 'walk' | 'run' | 'cycle' };

export async function countActivity(manager: EntityManager, activity: Counted) {
  const tableIds = await creditActivities(manager, { activityId: activity.id });
  if (activity.activityType !== 'cycle') await refreshLeagueDistance(manager, activity.userId);
  await manager.query(
    `INSERT INTO "feed_posts" ("userId","body","activityId") SELECT $1,'',$2
     WHERE NOT EXISTS (SELECT 1 FROM "feed_posts" WHERE "activityId"=$2)`,
    [activity.userId, activity.id],
  );
  return tableIds;
}

export async function announceCounted(manager: EntityManager, activity: Counted, tableIds: string[]) {
  if (!tableIds.length) return;
  await manager.query(
    `INSERT INTO "notifications" ("userId","type","title","body","link","emailProcessedAt")
     SELECT $1,'LEADERBOARD_UPDATE','Your standings updated',
            'Your ' || $2 || ' now counts in ' || t."title" || '.', '/competitions/' || t."code", now()
     FROM "competition_tables" t WHERE t."id" = ANY($3::uuid[])`,
    [activity.userId, activity.activityType === 'cycle' ? 'ride' : activity.activityType, tableIds],
  );
}

export async function uncountActivity(manager: EntityManager, activity: Counted) {
  await uncreditActivity(manager, activity.id, { liveOnly: true });
  if (activity.activityType !== 'cycle') await refreshLeagueDistance(manager, activity.userId);
}
