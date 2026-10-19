import { haversineMetres } from './haversine';

/** Fixes less accurate than this are ignored. */
export const MAX_USABLE_ACCURACY_METRES = 50;
/** Faster than this between two points isn't on foot (≈ a 1:51/km sprint). */
export const MAX_FOOT_SPEED_MPS = 9;
/** Slower than this isn't walking: it's the phone's position drifting while you stand still. */
export const MIN_FOOT_SPEED_MPS = 0.4;
/** Fixes are averaged with their neighbours this far either side, so random wobble cancels out. */
export const SMOOTHING_SECONDS = 5;
/** A move only counts once the smoothed position has shifted this far. */
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

interface Smoothed {
  lat: number;
  lon: number;
  at: number;
}

/**
 * Accuracy-weighted average of the fixes within ±SMOOTHING_SECONDS of each fix. Random GPS wobble
 * averages out; real movement (which keeps going in one direction) survives. `trailing` uses only
 * past fixes, for the live screen, which can't see the future.
 */
export function smoothTrack(points: TrackPoint[], trailing = false): Smoothed[] {
  const windowMs = SMOOTHING_SECONDS * 1000;
  return points.map((point, index) => {
    const at = point.recordedAt.getTime();
    let lat = 0;
    let lon = 0;
    let weight = 0;
    for (let j = index; j >= 0 && at - points[j].recordedAt.getTime() <= windowMs; j -= 1) {
      const w = 1 / Math.max(3, points[j].accuracy ?? 10);
      lat += points[j].latitude * w;
      lon += points[j].longitude * w;
      weight += w;
    }
    if (!trailing) {
      for (let j = index + 1; j < points.length && points[j].recordedAt.getTime() - at <= windowMs; j += 1) {
        const w = 1 / Math.max(3, points[j].accuracy ?? 10);
        lat += points[j].latitude * w;
        lon += points[j].longitude * w;
        weight += w;
      }
    }
    return { lat: lat / weight, lon: lon / weight, at };
  });
}

/**
 * Measures a GPS track the same way for totals and verification:
 * - fixes worse than ±50 m are ignored;
 * - positions are smoothed so wobble cancels, and a move only counts once it's at least 4 m;
 * - moves slower than walking pace (drift while standing still) never count;
 * - a lone too-fast hop is a spike and is skipped; sustained too-fast travel (a car) flags the run.
 */
export function measureTrack(points: TrackPoint[], options: { trailing?: boolean } = {}): TrackMeasure {
  const reasons = new Set<string>();
  const usable = points
    .filter((point) => point.accuracy === null || point.accuracy <= MAX_USABLE_ACCURACY_METRES)
    .filter((point, index, all) => index === 0 || point.recordedAt.getTime() > all[index - 1].recordedAt.getTime());
  if (usable.length < points.length && points.some((p) => p.accuracy !== null && p.accuracy > MAX_USABLE_ACCURACY_METRES)) {
    reasons.add('LOW_GPS_ACCURACY');
  }

  const track = smoothTrack(usable, options.trailing);
  let distance = 0;
  let moving = 0;
  let implausible = 0;
  let fastInARow = 0;
  let anchor = track[0];
  for (let index = 1; index < track.length; index += 1) {
    const point = track[index];
    const seconds = (point.at - anchor.at) / 1000;
    if (seconds <= 0) continue;
    const metres = haversineMetres(anchor.lat, anchor.lon, point.lat, point.lon);
    if (metres < MIN_STEP_METRES) continue; // not far enough yet: keep measuring from the anchor
    const speed = metres / seconds;
    if (speed > MAX_FOOT_SPEED_MPS) {
      fastInARow += 1;
      // One too-fast hop is a GPS spike: skip it. Two or more in a row is real non-foot travel.
      if (fastInARow >= 2) {
        implausible += metres;
        anchor = point;
      }
      continue;
    }
    fastInARow = 0;
    if (speed < MIN_FOOT_SPEED_MPS && seconds <= GAP_SECONDS) {
      anchor = point; // drift, not walking: move the anchor without counting it
      continue;
    }
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
