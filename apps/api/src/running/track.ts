import { haversineMetres } from './haversine';

/** Fixes less accurate than this are ignored. */
export const MAX_USABLE_ACCURACY_METRES = 50;
/** Faster than this between two fixes isn't on foot (≈ a 1:51/km sprint). */
export const MAX_FOOT_SPEED_MPS = 9;
/** Movement smaller than the GPS uncertainty is treated as wobble, never less than this. */
const MIN_STEP_METRES = 4;
/** Too-fast distance only flags a run when it's this much of the total, or at least this far. */
const IMPLAUSIBLE_SHARE = 0.25;
const IMPLAUSIBLE_MIN_METRES = 200;
const GAP_SECONDS = 120;

export interface TrackPoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt: Date;
}

export interface TrackMeasure {
  /** Distance that passed every check. */
  distanceMetres: number;
  movingSeconds: number;
  /** Fixes with usable accuracy / all fixes. */
  confidence: number;
  usableCount: number;
  /** Distance skipped because it was too fast to be on foot. */
  implausibleMetres: number;
  reasons: Set<string>;
}

/**
 * Measures a GPS track the same way everywhere (live screen, server totals and verification):
 * - fixes worse than ±50 m are ignored;
 * - movement only counts once it's bigger than the GPS uncertainty, so standing still adds nothing;
 * - a hop too fast to be on foot is skipped rather than counted, and only flags the run when that
 *   too-fast distance is a real share of it (e.g. a car ride), not one bad fix.
 */
export function measureTrack(points: TrackPoint[]): TrackMeasure {
  const reasons = new Set<string>();
  const usable = points.filter((point) => point.accuracy === null || point.accuracy <= MAX_USABLE_ACCURACY_METRES);
  if (usable.length < points.length) reasons.add('LOW_GPS_ACCURACY');

  let distance = 0;
  let moving = 0;
  let implausible = 0;
  let fastInARow = 0;
  let anchor = usable[0];
  for (let index = 1; index < usable.length; index += 1) {
    const point = usable[index];
    const seconds = (point.recordedAt.getTime() - anchor.recordedAt.getTime()) / 1000;
    if (seconds <= 0) {
      reasons.add('NON_MONOTONIC_TIME');
      continue;
    }
    const metres = haversineMetres(anchor.latitude, anchor.longitude, point.latitude, point.longitude);
    const noise = Math.max(MIN_STEP_METRES, ((anchor.accuracy ?? 10) + (point.accuracy ?? 10)) / 2);
    if (metres < noise) continue; // wobble: keep the anchor, wait for real movement
    if (metres / seconds > MAX_FOOT_SPEED_MPS) {
      fastInARow += 1;
      // One too-fast fix is a GPS spike: skip it and keep measuring from the last good point.
      // Two or more in a row is real travel too fast to be on foot: count it as such and follow it.
      if (fastInARow >= 2) {
        implausible += metres;
        anchor = point;
      }
      continue;
    }
    fastInARow = 0;
    if (seconds > GAP_SECONDS) reasons.add('GPS_GAP');
    else moving += seconds;
    distance += metres;
    anchor = point;
  }

  if (implausible >= IMPLAUSIBLE_MIN_METRES && implausible >= (distance + implausible) * IMPLAUSIBLE_SHARE) {
    reasons.add('IMPLAUSIBLE_SPEED');
  }
  if (usable.length < 2) reasons.add('INSUFFICIENT_GPS_DATA');

  return {
    distanceMetres: Math.round(distance),
    movingSeconds: Math.round(moving),
    confidence: points.length === 0 ? 0 : usable.length / points.length,
    usableCount: usable.length,
    implausibleMetres: Math.round(implausible),
    reasons,
  };
}
