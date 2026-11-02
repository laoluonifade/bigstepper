import dataSource from '../database/data-source';
import { refreshLeagueDistance } from '../leagues/league-credits';
import { GpsSample } from '../running/gps-sample.entity';
import { haversineMetres } from '../running/haversine';
import { MAX_FOOT_SPEED_MPS, MAX_USABLE_ACCURACY_METRES, measureTrack, stepDistanceMetres, withFinalSteps } from '../running/track';
import { creditActivities } from '../tables/competition-credits';

const MIN_GAIN_METRES = 50;

function bridgedMetres(samples: GpsSample[]) {
  const usable = samples.filter((sample) => sample.accuracy === null || sample.accuracy <= MAX_USABLE_ACCURACY_METRES);
  let metres = 0;
  for (let index = 1; index < usable.length; index += 1) {
    const [from, to] = [usable[index - 1], usable[index]];
    const step = haversineMetres(from.latitude, from.longitude, to.latitude, to.longitude);
    const seconds = (to.recordedAt.getTime() - from.recordedAt.getTime()) / 1000;
    if (step < 1.5 * ((from.accuracy ?? 10) + (to.accuracy ?? 10)) / 2 || seconds <= 0 || step / seconds > MAX_FOOT_SPEED_MPS) continue;
    metres += step;
  }
  return Math.round(metres);
}

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
  const fill = args.find((arg) => arg.startsWith('@'))?.slice(1).toLowerCase();

  await dataSource.initialize();
  try {
    const rows = await dataSource.query(
      `SELECT a."id", a."userId", a."runningSessionId", a."activityType", a."validatedDistanceMetres", a."recordedSteps",
              a."startedAt", a."finishedAt", p."username"
       FROM "activities" a LEFT JOIN "profiles" p ON p."userId" = a."userId"
       WHERE a."source" = 'jump' AND a."activityType" <> 'cycle' AND a."recordedSteps" > 0
         AND a."verificationStatus" IN ('VERIFIED','FLAGGED') AND a."startedAt" > now() - make_interval(days => $1)
         AND ($2::text IS NULL OR lower(p."username") = $2)
       ORDER BY a."startedAt"`, [days, fill ?? null],
    ) as Row[];

    const fixes: Array<Row & { metres: number }> = [];
    for (const row of rows) {
      const samples = await dataSource.getRepository(GpsSample).find({ where: { sessionId: row.runningSessionId }, order: { sequence: 'ASC' } });
      const measured = measureTrack(withFinalSteps(samples, row.recordedSteps, row.finishedAt), { trailing: true, activityType: row.activityType }).distanceMetres;
      const elapsed = (new Date(row.finishedAt).getTime() - new Date(row.startedAt).getTime()) / 1000;
      const filled = Math.min(Math.max(bridgedMetres(samples), stepDistanceMetres(row.recordedSteps, row.activityType)), Math.round(elapsed * MAX_FOOT_SPEED_MPS));
      const metres = fill ? Math.max(measured, filled) : measured;
      if (metres - row.validatedDistanceMetres >= MIN_GAIN_METRES) fixes.push({ ...row, metres });
    }

    console.log(`Checked ${rows.length} walks and runs from the last ${days} days${fill ? ` by @${fill}, filling GPS gaps` : ''}; ${fixes.length} measured short.`);
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
          `UPDATE "activities" SET "validatedDistanceMetres" = $2, "recordedDistanceMetres" = GREATEST("recordedDistanceMetres", $2),
             "verificationReasons" = CASE WHEN $3 THEN "verificationReasons" || '["GAPS_FILLED"]'::jsonb ELSE "verificationReasons" END
           WHERE "id" = $1`,
          [fix.id, fix.metres, Boolean(fill)],
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
