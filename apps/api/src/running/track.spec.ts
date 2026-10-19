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
});
