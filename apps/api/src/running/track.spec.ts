import { measureTrack, TrackPoint } from './track';

const LAT = 6.4281;
const LON = 3.4219;
const M_PER_DEG_LAT = 111_195;
const M_PER_DEG_LON = 110_500;

/** Deterministic pseudo-random noise so tests are repeatable. */
function noise(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
}

/**
 * One fix per second moving north at `speed` m/s, with GPS noise of about `wobble` metres in both
 * directions (what phones actually do), reporting `accuracy`.
 */
function track(seconds: number, speed: number, { accuracy = 6, wobble = 0, seed = 1, start = 0, northOffset = 0 } = {}): TrackPoint[] {
  const rand = noise(seed);
  return Array.from({ length: seconds + 1 }, (_, i) => ({
    latitude: LAT + (northOffset + speed * i + rand() * 2 * wobble) / M_PER_DEG_LAT,
    longitude: LON + (rand() * 2 * wobble) / M_PER_DEG_LON,
    accuracy,
    recordedAt: new Date(Date.UTC(2026, 9, 19, 7, 0, start + i)),
  }));
}

describe('measureTrack', () => {
  it('measures a clean straight run close to its true distance', () => {
    const result = measureTrack(track(300, 3)); // 900 m
    expect(result.distanceMetres).toBeGreaterThan(855);
    expect(result.distanceMetres).toBeLessThanOrEqual(905);
    expect(result.reasons.size).toBe(0);
  });

  it('measures a normal walk with realistic GPS noise within 10%', () => {
    const result = measureTrack(track(300, 1.4, { wobble: 3, accuracy: 5 })); // 420 m
    expect(result.distanceMetres).toBeGreaterThan(378);
    expect(result.distanceMetres).toBeLessThan(462);
  });

  it('a phone lying still with good GPS does not collect distance', () => {
    // The case the previous rule got badly wrong (it counted ~400 m here).
    for (const seed of [1, 2, 3]) {
      expect(measureTrack(track(150, 0, { wobble: 3, accuracy: 5, seed })).distanceMetres).toBeLessThan(15);
    }
  });

  it('a phone lying still with poor GPS does not collect distance', () => {
    expect(measureTrack(track(300, 0, { wobble: 9, accuracy: 15, seed: 4 })).distanceMetres).toBeLessThan(30);
  });

  it('slow position drift while standing still is not counted', () => {
    expect(measureTrack(track(300, 0.1, { wobble: 1, accuracy: 5 })).distanceMetres).toBe(0); // 30 m drift over 5 min
  });

  it('a jittery but real run is not flagged for speed', () => {
    const result = measureTrack(track(240, 2.8, { wobble: 9, accuracy: 14 }));
    expect(result.reasons.has('IMPLAUSIBLE_SPEED')).toBe(false);
    expect(result.distanceMetres).toBeGreaterThan(560);
  });

  it('skips a single GPS spike instead of flagging the run', () => {
    const points = track(200, 3);
    points[100] = { ...points[100], latitude: points[100].latitude + 400 / M_PER_DEG_LAT };
    const result = measureTrack(points);
    expect(result.reasons.has('IMPLAUSIBLE_SPEED')).toBe(false);
    expect(result.distanceMetres).toBeGreaterThan(540);
    expect(result.distanceMetres).toBeLessThan(700);
  });

  it('flags a sustained car-speed segment', () => {
    const walk = track(120, 1.4);
    const drive = track(120, 15, { start: 121, northOffset: 1.4 * 121 });
    const result = measureTrack([...walk, ...drive]);
    expect(result.reasons.has('IMPLAUSIBLE_SPEED')).toBe(true);
    expect(result.distanceMetres).toBeLessThan(400);
  });

  it('measures cycling distance without making it a valid run', () => {
    const ride = track(120, 8);
    expect(measureTrack(ride, { activityType: 'cycle' }).distanceMetres).toBeGreaterThan(900);
    expect(measureTrack(ride, { activityType: 'run' }).reasons.has('IMPLAUSIBLE_SPEED')).toBe(false);
    const fasterRide = track(120, 10);
    expect(measureTrack(fasterRide, { activityType: 'run' }).reasons.has('IMPLAUSIBLE_SPEED')).toBe(true);
    expect(measureTrack(fasterRide, { activityType: 'cycle' }).distanceMetres).toBeGreaterThan(1100);
  });

  it('flags sustained vehicle-speed travel on a cycling activity', () => {
    expect(measureTrack(track(120, 16), { activityType: 'cycle' }).reasons.has('IMPLAUSIBLE_SPEED')).toBe(true);
  });

  it('ignores fixes worse than ±50 m (indoor Wi-Fi location)', () => {
    const indoor = track(6, 0).map((p, i) => ({
      ...p,
      accuracy: [733, 900, 52, 600, 800, 700, 650][i],
      latitude: p.latitude + (i * 100) / M_PER_DEG_LAT,
    }));
    const result = measureTrack(indoor);
    expect(result.distanceMetres).toBe(0);
    expect(result.reasons.has('LOW_GPS_ACCURACY')).toBe(true);
    expect(result.reasons.has('INSUFFICIENT_GPS_DATA')).toBe(true);
  });

  it('the live (trailing) mode agrees with the final measurement on a real walk', () => {
    const points = track(300, 1.4, { wobble: 3, accuracy: 5, seed: 7 });
    const live = measureTrack(points, { trailing: true }).distanceMetres;
    const final = measureTrack(points).distanceMetres;
    expect(Math.abs(live - final)).toBeLessThan(final * 0.1);
  });

  describe('standing still on a phone that drifts', () => {
    /** A position that wanders like Android's does indoors: a slow random walk, not independent wobble. */
    function wander(seconds: number, accuracy: number, seed: number, stepCount: number | null = null): TrackPoint[] {
      const rand = noise(seed);
      let north = 0;
      let east = 0;
      return Array.from({ length: seconds + 1 }, (_, i) => {
        north = Math.max(-accuracy, Math.min(accuracy, north + rand() * 6));
        east = Math.max(-accuracy, Math.min(accuracy, east + rand() * 6));
        return { latitude: LAT + north / M_PER_DEG_LAT, longitude: LON + east / M_PER_DEG_LON, accuracy, recordedAt: new Date(Date.UTC(2026, 9, 19, 7, 0, i)), stepCount };
      });
    }

    it('adds almost nothing while the fix wanders around its accuracy circle', () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        expect(measureTrack(wander(600, 25, seed)).distanceMetres).toBeLessThan(20);
      }
    });

    it('adds nothing at all when the pedometer says you took no steps', () => {
      for (const seed of [1, 2, 3]) expect(measureTrack(wander(600, 25, seed, 0)).distanceMetres).toBe(0);
    });

    it('ignores GPS that looks like walking when no steps were taken', () => {
      const points = track(300, 1.4, { accuracy: 8 }).map((point) => ({ ...point, stepCount: 0 }));
      expect(measureTrack(points).distanceMetres).toBe(0);
    });

    it('counts a real walk with the pedometer on', () => {
      const points = track(300, 1.4, { accuracy: 8 }).map((point, i) => ({ ...point, stepCount: Math.floor(i * 1.8) }));
      const result = measureTrack(points);
      expect(result.distanceMetres).toBeGreaterThan(400);
      expect(result.distanceMetres).toBeLessThan(440);
    });

    it('still counts a walk when step updates arrive in late batches', () => {
      const points = track(300, 1.4, { accuracy: 8 }).map((point, i) => ({ ...point, stepCount: Math.floor(Math.floor(i / 10) * 10 * 1.8) }));
      expect(measureTrack(points).distanceMetres).toBeGreaterThan(390);
    });

    it('never asks a ride for steps', () => {
      const ride = track(300, 6, { accuracy: 8 }).map((point) => ({ ...point, stepCount: 0 }));
      expect(measureTrack(ride, { activityType: 'cycle' }).distanceMetres).toBeGreaterThan(1700);
    });
  });

  describe('gaps in tracking', () => {
    it('doesn’t count a jump across a gap where GPS saw nothing (app closed, then reopened elsewhere)', () => {
      const before = track(60, 1.4, { accuracy: 6 });
      // Ten silent minutes, then fixes resume 3.7 km away.
      const after = track(60, 1.4, { accuracy: 6, start: 660, northOffset: 3700 });
      const result = measureTrack([...before, ...after]);
      expect(result.reasons.has('GPS_GAP')).toBe(true);
      expect(result.distanceMetres).toBeLessThan(200);
    });

    it('still counts a walk after standing still with GPS running', () => {
      const walk = track(120, 1.4, { accuracy: 6 });
      const stand = track(180, 0, { accuracy: 6, start: 121, northOffset: 168 });
      const more = track(120, 1.4, { accuracy: 6, start: 302, northOffset: 168 });
      const result = measureTrack([...walk, ...stand, ...more]);
      expect(result.reasons.has('GPS_GAP')).toBe(false);
      expect(result.distanceMetres).toBeGreaterThan(300);
    });
  });
});
