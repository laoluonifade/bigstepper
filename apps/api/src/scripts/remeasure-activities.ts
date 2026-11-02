import dataSource from '../database/data-source';
import { refreshLeagueDistance } from '../leagues/league-credits';
import { GpsSample } from '../running/gps-sample.entity';
import { measureTrack, withFinalSteps } from '../running/track';
import { creditActivities } from '../tables/competition-credits';

const MIN_GAIN_METRES = 50;

type Row = {
  id: string;
  userId: string;
  runningSessionId: string;
  activityType: 'walk' | 'run';
  validatedDistanceMetres: number;
  recordedSteps: number;
  startedAt: Date;
  finishedAt: Date;
  username: string | null;
};

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const days = Number(args.find((arg) => /^\d+$/.test(arg)) ?? 30);

  await dataSource.initialize();
  try {
    const rows = await dataSource.query(
      `SELECT a."id", a."userId", a."runningSessionId", a."activityType", a."validatedDistanceMetres", a."recordedSteps",
              a."startedAt", a."finishedAt", p."username"
       FROM "activities" a LEFT JOIN "profiles" p ON p."userId" = a."userId"
       WHERE a."source" = 'jump' AND a."activityType" <> 'cycle' AND a."recordedSteps" > 0
         AND a."verificationStatus" IN ('VERIFIED','FLAGGED') AND a."startedAt" > now() - make_interval(days => $1)
       ORDER BY a."startedAt"`, [days],
    ) as Row[];

    const fixes: Array<Row & { metres: number }> = [];
    for (const row of rows) {
      const samples = await dataSource.getRepository(GpsSample).find({ where: { sessionId: row.runningSessionId }, order: { sequence: 'ASC' } });
      const metres = measureTrack(withFinalSteps(samples, row.recordedSteps, row.finishedAt), { trailing: true, activityType: row.activityType }).distanceMetres;
      if (metres - row.validatedDistanceMetres >= MIN_GAIN_METRES) fixes.push({ ...row, metres });
    }

    console.log(`Checked ${rows.length} walks and runs from the last ${days} days; ${fixes.length} measured short.`);
    for (const fix of fixes) {
      console.log(`  @${fix.username ?? '?'}  ${fix.activityType}  ${new Date(fix.startedAt).toISOString()}  ${fix.recordedSteps} steps  ${(fix.validatedDistanceMetres / 1000).toFixed(2)} km → ${(fix.metres / 1000).toFixed(2)} km  (${fix.id})`);
    }
    if (!apply) {
      console.log('Dry run: nothing was written. Add --apply to correct them.');
      return;
    }

    await dataSource.transaction(async (manager) => {
      for (const fix of fixes) {
        await manager.query(
          `UPDATE "activities" SET "validatedDistanceMetres" = $2, "recordedDistanceMetres" = GREATEST("recordedDistanceMetres", $2) WHERE "id" = $1`,
          [fix.id, fix.metres],
        );
        await creditActivities(manager, { activityId: fix.id });
      }
      for (const userId of new Set(fixes.map((fix) => fix.userId))) await refreshLeagueDistance(manager, userId);
    });
    console.log('Done.');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
