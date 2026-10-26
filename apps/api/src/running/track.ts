import { haversineMetres } from './haversine';

export const STRIDE_METRES = { walk: 0.72, run: 1.0, cycle: 0 } as const;

export function stepDistanceMetres(steps: number, activityType: 'walk' | 'run' | 'cycle') {
  return Math.round(Math.max(0, steps) * STRIDE_METRES[activityType]);
}

export const MAX_USABLE_ACCURACY_METRES = 50;
export const MAX_FOOT_SPEED_MPS = 9;
export const MAX_CYCLING_SPEED_MPS = 20;
export const MIN_FOOT_SPEED_MPS = 0.4;
export const SMOOTHING_SECONDS = 5;
const MIN_STEP_METRES = 4;
const ACCURACY_FACTOR = 1.5;
const MAX_STRIDE_METRES = 3;
const IMPLAUSIBLE_SHARE = 0.25;
const IMPLAUSIBLE_MIN_METRES = 200;
const GAP_SECONDS = 120;
const SUSTAINED_FAST_SECONDS = 30;

export function backfillSteps<T extends { recordedAt: Date; stepCount?: number | null }>(points: T[]): T[] {
  const out = points.map((point) => ({ ...point }));
  let changeIndex = -1;
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
  stepCount?: number | null;
}

export interface TrackMeasure {
  distanceMetres: number;
  movingSeconds: number;
  confidence: number;
  usableCount: number;
  implausibleMetres: number;
  reasons: Set<string>;
  profile: Array<[number, number]>;
}

interface Smoothed {
  lat: number;
  lon: number;
  at: number;
  accuracy: number;
  steps: number | null;
}

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
  let fastSince = 0;
  let fastMetres = 0;
  const endFastRun = (at: number) => {
    if (fastInARow >= 2 && (at - fastSince) / 1000 >= SUSTAINED_FAST_SECONDS) implausible += fastMetres;
    fastInARow = 0;
    fastMetres = 0;
  };
  let anchor = track[0];
  const profile: Array<[number, number]> = track.length ? [[track[0].at, 0]] : [];
  for (let index = 1; index < track.length; index += 1) {
    const point = track[index];
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
    if (metres < needed) continue;
    const speed = metres / seconds;
    if (speed > (options.activityType === 'cycle' ? MAX_CYCLING_SPEED_MPS : MAX_FOOT_SPEED_MPS)) {
      if (fastInARow === 0) fastSince = anchor.at;
      fastInARow += 1;
      if (fastInARow >= 2) {
        fastMetres += metres;
        anchor = point;
      }
      continue;
    }
    endFastRun(point.at);
    if (options.activityType !== 'cycle' && anchor.steps !== null && point.steps !== null && (point.steps - anchor.steps) * MAX_STRIDE_METRES < metres) {
      if (seconds > GAP_SECONDS) anchor = point;
      continue;
    }
    if (speed < MIN_FOOT_SPEED_MPS && seconds <= GAP_SECONDS) {
      anchor = point;
      continue;
    }
    if (seconds <= GAP_SECONDS) moving += seconds;
    distance += metres;
    profile.push([point.at, distance]);
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
    profile,
  };
}

export function bestEffortSeconds(profile: Array<[number, number]>, metres: number): number | null {
  if (metres <= 0 || profile.length < 2 || profile.at(-1)![1] < metres) return null;
  let best = Infinity;
  let start = 0;
  for (let end = 1; end < profile.length; end += 1) {
    const [endAt, endMetres] = profile[end];
    const from = endMetres - metres;
    if (from < 0) continue;
    while (start + 1 < end && profile[start + 1][1] <= from) start += 1;
    const [aAt, aMetres] = profile[start];
    const [bAt, bMetres] = profile[start + 1];
    const share = bMetres > aMetres ? (from - aMetres) / (bMetres - aMetres) : 0;
    const startAt = aAt + (bAt - aAt) * Math.min(1, Math.max(0, share));
    best = Math.min(best, (endAt - startAt) / 1000);
  }
  return Number.isFinite(best) ? Math.round(best) : null;
}
