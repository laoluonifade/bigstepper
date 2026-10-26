import dataSource from '../database/data-source';
import { refreshLeagueDistance } from '../leagues/league-credits';
import { creditActivities } from '../tables/competition-credits';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const [email, type, km, startedAtText, minutesText] = args.filter((arg) => arg !== '--apply');
  const usage = 'Usage: activity:credit <email> <walk|run|cycle> <km> <started-at ISO> <minutes> [--apply]';
  if (!email || !['walk', 'run', 'cycle'].includes(type) || !km || !startedAtText || !minutesText) throw new Error(usage);
  const metres = Math.round(Number(km) * 1000);
  const seconds = Math.round(Number(minutesText) * 60);
  const startedAt = new Date(startedAtText);
  if (!(metres > 0 && metres <= 300_000) || !(seconds > 0 && seconds <= 24 * 3600) || Number.isNaN(startedAt.getTime())) throw new Error(usage);
  const finishedAt = new Date(startedAt.getTime() + seconds * 1000);
  if (finishedAt > new Date()) throw new Error('That activity would finish in the future');

  await dataSource.initialize();
  try {
    const [user] = await dataSource.query(
      `SELECT u."id", u."email", p."username", p."displayName" FROM "users" u LEFT JOIN "profiles" p ON p."userId" = u."id"
       WHERE lower(u."email") = $1 AND u."deletedAt" IS NULL`, [email.trim().toLowerCase()],
    ) as Array<{ id: string; email: string; username: string | null; displayName: string | null }>;
    if (!user) throw new Error(`No account for ${email}`);
    const noun = type === 'cycle' ? 'ride' : type;
    console.log(`${apply ? 'Crediting' : 'Would credit'} @${user.username ?? '?'} (${user.displayName ?? user.email}) with a ${metres / 1000} km ${noun},`);
    console.log(`  ${startedAt.toISOString()} → ${finishedAt.toISOString()} (${Math.round(seconds / 60)} min)`);

    await dataSource.transaction(async (manager) => {
      const [session] = await manager.query(
        `INSERT INTO "running_sessions" ("userId","status","activityType","startedAt","finishedAt","distanceMetres","stepCount","pausedSeconds")
         VALUES ($1,'VERIFIED',$2,$3,$4,$5,0,0) RETURNING "id"`,
        [user.id, type, startedAt, finishedAt, metres],
      ) as Array<{ id: string }>;
      const [activity] = await manager.query(
        `INSERT INTO "activities" ("runningSessionId","userId","verificationStatus","activityType","recordedDistanceMetres","validatedDistanceMetres",
           "elapsedSeconds","movingSeconds","gpsConfidence","verificationReasons","algorithmVersion","startedAt","finishedAt")
         VALUES ($1,$2,'VERIFIED',$3,$4,$4,$5,$5,1,'["MANUAL_CREDIT"]'::jsonb,'manual',$6,$7) RETURNING "id"`,
        [session.id, user.id, type, metres, seconds, startedAt, finishedAt],
      ) as Array<{ id: string }>;
      await creditActivities(manager, { activityId: activity.id });
      if (type !== 'cycle') await refreshLeagueDistance(manager, user.id);
      await manager.query(`INSERT INTO "feed_posts" ("userId","body","activityId") VALUES ($1,'',$2)`, [user.id, activity.id]);
      const credited = await manager.query(
        `SELECT t."title" FROM "table_activity_credits" c JOIN "competition_tables" t ON t."id" = c."tableId" WHERE c."activityId" = $1`, [activity.id],
      ) as Array<{ title: string }>;
      await manager.query(
        `INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,'ACTIVITY_VERIFIED',$2,$3,$4)`,
        [user.id, `Your ${metres / 1000} km ${noun} is back`, 'Sorry, Jump lost it after you finished. It’s on your profile and counts in your competitions now.', `/activities/${activity.id}`],
      );
      console.log(`  activity ${activity.id}`);
      console.log(`  counts in: ${credited.length ? credited.map((row) => row.title).join(', ') : 'no live competitions'}`);
      if (!apply) throw new DryRun();
    });
    console.log('Done.');
  } catch (error) {
    if (error instanceof DryRun) console.log('Dry run: nothing was written. Add --apply to credit it.');
    else throw error;
  } finally {
    await dataSource.destroy();
  }
}

class DryRun extends Error {}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
