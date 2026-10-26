import { haversineMetres } from '../running/haversine';
import { STRIDE_METRES } from '../running/track';

const MAX_STEPS_PER_SECOND = 4;
const MAX_INTERVAL_SECONDS = 10;

export function stravaStepTotals(
  activityType: 'walk' | 'run' | 'cycle',
  offsets: number[],
  points: Array<[number, number]>,
  cadence?: number[],
  distance?: number[],
): number[] | null {
  if (activityType === 'cycle' || offsets.length === 0) return null;
  const useCadence = hasCadence(offsets, cadence);
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

export function hasCadence(offsets: number[], cadence?: number[]): cadence is number[] {
  return cadence?.length === offsets.length && cadence.some((value) => value > 0);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}
