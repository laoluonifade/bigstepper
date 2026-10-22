import { haversineMetres } from '../running/haversine';
import { STRIDE_METRES } from '../running/track';

/**
 * Comfortably above any real cadence (a fast run is about 3.2 steps/s) and below the 5.5 steps/s the
 * verifier treats as faked, so a GPS spike in a reconstructed count can never flag an honest import.
 */
const MAX_STEPS_PER_SECOND = 4;
/** A longer jump between samples is a pause or a dropout; count at most this much of it. */
const MAX_INTERVAL_SECONDS = 10;

/**
 * Strava doesn't share step counts, so rebuild a running total for each GPS sample. Cadence, when the
 * watch or phone recorded it, is the real thing; otherwise steps are estimated from distance using the
 * same stride lengths Jump uses to turn steps into distance. Returns null for rides.
 */
export function stravaStepTotals(
  activityType: 'walk' | 'run' | 'cycle',
  offsets: number[],
  points: Array<[number, number]>,
  cadence?: number[],
  distance?: number[],
): number[] | null {
  if (activityType === 'cycle' || offsets.length === 0) return null;
  const useCadence = cadence?.length === offsets.length && cadence.some((value) => value > 0);
  // Strava reports running cadence per foot (about 80–95); some devices do the same for walks (50–60).
  const perFoot = useCadence && median(cadence!.filter((value) => value > 0)) < (activityType === 'run' ? 120 : 80);
  const cumulative = distance?.length === offsets.length ? distance : null;

  const totals = [0];
  let steps = 0;
  for (let index = 1; index < offsets.length; index += 1) {
    const seconds = Math.min(Math.max(0, offsets[index] - offsets[index - 1]), MAX_INTERVAL_SECONDS);
    let added: number;
    if (useCadence) {
      added = (cadence![index] * (perFoot ? 2 : 1) * seconds) / 60;
    } else {
      const metres = cumulative
        ? Math.max(0, cumulative[index] - cumulative[index - 1])
        : haversineMetres(points[index - 1][0], points[index - 1][1], points[index][0], points[index][1]);
      added = metres / STRIDE_METRES[activityType];
    }
    steps += Math.min(added, seconds * MAX_STEPS_PER_SECOND);
    totals.push(Math.round(steps));
  }
  return totals;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}
