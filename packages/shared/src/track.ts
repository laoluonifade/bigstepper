// Copy of apps/api/src/running/track.ts — keep the two in sync so the live number is the verified one.
import { haversineMetres } from './geo';

/** Metres per step, used where GPS can't measure (indoors). Steps count for leagues and free challenges only. */
export const STRIDE_METRES = { walk: 0.72, run: 1.0, cycle: 0 } as const;

export function stepDistanceMetres(steps: number, activityType: 'walk' | 'run' | 'cycle') {
  return Math.round(Math.max(0, steps) * STRIDE_METRES[activityType]);
}

/** Fixes less accurate than this are ignored. */
export const MAX_USABLE_ACCURACY_METRES = 50;
/** Faster than this between two points isn't on foot (≈ a 1:51/km sprint). */
export const MAX_FOOT_SPEED_MPS = 9;
/** 45 km/h allows typical cycling; GPS alone still cannot distinguish a slow car. */
export const MAX_CYCLING_SPEED_MPS = 12.5;
/** Slower than this isn't walking: it's the phone's position drifting while you stand still. */
export const MIN_FOOT_SPEED_MPS = 0.4;
/** Fixes are averaged with their neighbours this far either side, so random wobble cancels out. */
export const SMOOTHING_SECONDS = 5;
/** A move only counts once the smoothed position has shifted this far... */
const MIN_STEP_METRES = 4;
/**
 * ...and half again further than the GPS's own stated error. Standing still, a phone's position wanders
 * around inside its accuracy circle (±20–40 m indoors or between buildings), and those jumps look like walking.
 * Real movement leaves the circle; nothing is lost, because distance is measured from the last counted point.
 */
const ACCURACY_FACTOR = 1.5;
/** On foot, no step covers more than this; a segment needs at least distance ÷ this many steps to count. */
const MAX_STRIDE_METRES = 3;
/** Too-fast distance only flags a run when it's this much of the total, or at least this far. */
const IMPLAUSIBLE_SHARE = 0.25;
const IMPLAUSIBLE_MIN_METRES = 200;
const GAP_SECONDS = 120;
/** Too fast for this long (a car, a bus) flags the activity; shorter bursts are GPS glitches, just skipped. */
const SUSTAINED_FAST_SECONDS = 30;

/**
 * Phones hold the step count back while the app is in the background (screen locked) and hand it over
 * in one go when it comes back. That frozen stretch would read as "moving with no steps", so its GPS
 * distance wouldn't count. Spread each late jump evenly back over the frozen fixes before it, as if the
 * steps had arrived live. Counts that never move again (really standing still) are left alone.
 */
export function backfillSteps<T extends { recordedAt: Date; stepCount?: number | null }>(points: T[]): T[] {
  const out = points.map((point) => ({ ...point }));
  let changeIndex = -1; // where the current value first appeared
  for (let index = 0; index < out.length; index += 1) {
    const steps = out[index].stepCount;
    if (steps === null || steps === undefined) continue;
    if (changeIndex < 0) { changeIndex = index; continue; }
    const from = out[changeIndex].stepCount!;
    if (steps === from) continue;
    if (steps > from) {
      const t0 = out[changeIndex].recordedAt.getTime();
      const span = out[index].recordedAt.getTime() - t0;
      for (let k = changeIndex + 1; k < index; k += 1) {
        if (out[k].stepCount !== from || span <= 0) continue;
        out[k].stepCount = from + Math.floor(((steps - from) * (out[k].recordedAt.getTime() - t0)) / span);
      }
    }
    changeIndex = index;
  }
  return out;
}

export interface TrackPoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt: Date;
  /** The phone's step total at this fix, when the pedometer is on. */
  stepCount?: number | null;
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
  /** The fix's own accuracy (m). */
  accuracy: number;
  /** The latest step total known at this fix, if the pedometer is on. */
  steps: number | null;
}

/**
 * Accuracy-weighted average of the fixes within ±SMOOTHING_SECONDS of each fix. Random GPS wobble
 * averages out; real movement (which keeps going in one direction) survives. `trailing` uses only
 * past fixes, for the live screen, which can't see the future.
 */
export function smoothTrack(points: TrackPoint[], trailing = false): Smoothed[] {
  const windowMs = SMOOTHING_SECONDS * 1000;
  let steps: number | null = null;
  return points.map((point, index) => {
    if (point.stepCount !== undefined && point.stepCount !== null) steps = point.stepCount;
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
    return { lat: lat / weight, lon: lon / weight, at, accuracy: point.accuracy ?? 10, steps };
  });
}

/**
 * Measures a GPS track the same way for totals and verification:
 * - fixes worse than ±50 m are ignored;
 * - positions are smoothed so wobble cancels, and a move only counts once it's at least 4 m and further
 *   than the fixes' stated accuracy, so drift inside the accuracy circle never adds up;
 * - moves slower than walking pace (drift while standing still) never count;
 * - on foot, with the pedometer on, a move only counts if steps were taken during it: GPS drifting
 *   while you stand still has no steps behind it, and a shaken phone has no movement;
 * - steps the phone held back while in the background are spread back over that stretch first;
 * - too-fast hops are skipped; only sustained too-fast travel (30 s or more, a car) flags the run;
 * - a jump across a gap in tracking (no fixes for over two minutes) isn't counted.
 */
export function measureTrack(points: TrackPoint[], options: { trailing?: boolean; activityType?: 'walk' | 'run' | 'cycle' } = {}): TrackMeasure {
  const reasons = new Set<string>();
  const usable = backfillSteps(points)
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
  // The current run of too-fast hops: when it started, and the distance it covered.
  let fastSince = 0;
  let fastMetres = 0;
  const endFastRun = (at: number) => {
    if (fastInARow >= 2 && (at - fastSince) / 1000 >= SUSTAINED_FAST_SECONDS) implausible += fastMetres;
    fastInARow = 0;
    fastMetres = 0;
  };
  let anchor = track[0];
  for (let index = 1; index < track.length; index += 1) {
    const point = track[index];
    // GPS went silent (app closed, phone off, no signal) and came back somewhere else: nobody saw the
    // way between, so the jump isn't counted. Measuring carries on from where it picked up.
    if ((point.at - track[index - 1].at) / 1000 > GAP_SECONDS) {
      reasons.add('GPS_GAP');
      endFastRun(track[index - 1].at);
      anchor = point;
      continue;
    }
    const seconds = (point.at - anchor.at) / 1000;
    if (seconds <= 0) continue;
    const metres = haversineMetres(anchor.lat, anchor.lon, point.lat, point.lon);
    const needed = Math.max(MIN_STEP_METRES, Math.min(MAX_USABLE_ACCURACY_METRES, ACCURACY_FACTOR * (anchor.accuracy + point.accuracy) / 2));
    if (metres < needed) continue; // not far enough yet: keep measuring from the anchor
    const speed = metres / seconds;
    if (speed > (options.activityType === 'cycle' ? MAX_CYCLING_SPEED_MPS : MAX_FOOT_SPEED_MPS)) {
      if (fastInARow === 0) fastSince = anchor.at;
      fastInARow += 1;
      // A too-fast hop is skipped, never counted. Only a sustained run of them (a car) is held against
      // the activity; a few seconds of GPS jumping about when it first locks on is not.
      if (fastInARow >= 2) {
        fastMetres += metres;
        anchor = point;
      }
      continue;
    }
    endFastRun(point.at);
    // On foot with the pedometer on: no steps, no distance. Keep the anchor, so steps that arrive a
    // little late still count the move once they land.
    if (options.activityType !== 'cycle' && anchor.steps !== null && point.steps !== null && (point.steps - anchor.steps) * MAX_STRIDE_METRES < metres) {
      if (seconds > GAP_SECONDS) anchor = point;
      continue;
    }
    if (speed < MIN_FOOT_SPEED_MPS && seconds <= GAP_SECONDS) {
      anchor = point; // drift, not walking: move the anchor without counting it
      continue;
    }
    // A long wait before this move (standing at a junction, GPS still running) isn't moving time.
    if (seconds <= GAP_SECONDS) moving += seconds;
    distance += metres;
    anchor = point;
  }

  if (track.length) endFastRun(track[track.length - 1].at);
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
