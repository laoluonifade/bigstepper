import { measureTrack, TrackPoint } from './track';

const LAT = 6.4281;
const LON = 3.4219;
const METRES_PER_DEG_LAT = 111_195;

/** A straight line north at `speed` m/s, one fix per second, with optional deterministic wobble. */
function line(seconds: number, speed: number, accuracy = 8, wobble = 0, start = 0): TrackPoint[] {
  return Array.from({ length: seconds + 1 }, (_, i) => {
    const jitter = wobble ? Math.sin(i * 1.7) * wobble : 0;
    return {
      latitude: LAT + (speed * i + jitter) / METRES_PER_DEG_LAT,
      longitude: LON,
      accuracy,
      recordedAt: new Date(Date.UTC(2026, 9, 19, 7, 0, start + i)),
    };
  });
}

describe('measureTrack', () => {
  it('measures a steady run close to its true distance', () => {
    const result = measureTrack(line(300, 3)); // 900 m
    expect(result.distanceMetres).toBeGreaterThan(860);
    expect(result.distanceMetres).toBeLessThanOrEqual(905);
    expect(result.reasons.size).toBe(0);
  });

  it('does not invent distance while standing still with GPS wobble', () => {
    const result = measureTrack(line(120, 0, 12, 9));
    expect(result.distanceMetres).toBe(0);
    expect(result.reasons.has('IMPLAUSIBLE_SPEED')).toBe(false);
  });

  it('a jittery but real run is not flagged for speed', () => {
    const result = measureTrack(line(240, 2.8, 14, 9)); // the case that used to fail
    expect(result.reasons.has('IMPLAUSIBLE_SPEED')).toBe(false);
    expect(result.distanceMetres).toBeGreaterThan(560);
  });

  it('skips a single GPS spike instead of flagging the run', () => {
    const points = line(200, 3);
    points[100] = { ...points[100], latitude: points[100].latitude + 400 / METRES_PER_DEG_LAT };
    const result = measureTrack(points);
    expect(result.reasons.has('IMPLAUSIBLE_SPEED')).toBe(false);
    expect(result.distanceMetres).toBeGreaterThan(540);
    expect(result.distanceMetres).toBeLessThan(700);
  });

  it('flags a sustained car-speed segment', () => {
    const walk = line(120, 1.4);
    const drive = line(120, 15, 8, 0, 121).map((p) => ({ ...p, latitude: p.latitude + (1.4 * 120) / METRES_PER_DEG_LAT }));
    const result = measureTrack([...walk, ...drive]);
    expect(result.reasons.has('IMPLAUSIBLE_SPEED')).toBe(true);
    expect(result.distanceMetres).toBeLessThan(400);
  });

  it('ignores fixes worse than ±50 m (indoor Wi-Fi location)', () => {
    const indoor = line(6, 0).map((p, i) => ({ ...p, accuracy: [733, 900, 52, 600, 800, 700, 650][i], latitude: p.latitude + (i * 100) / METRES_PER_DEG_LAT }));
    const result = measureTrack(indoor);
    expect(result.distanceMetres).toBe(0);
    expect(result.reasons.has('LOW_GPS_ACCURACY')).toBe(true);
    expect(result.reasons.has('INSUFFICIENT_GPS_DATA')).toBe(true);
  });
});
