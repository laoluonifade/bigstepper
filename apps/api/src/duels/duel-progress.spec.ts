import { TrackPoint } from '../running/track';
import { matches, progressFor, winnerOf } from './duel-progress';

const LAT = 6.4281;
const LON = 3.4219;
const at = (second: number) => new Date(Date.UTC(2026, 9, 27, 7, 0, second));

function track(seconds: number, speed: number, start = 0): TrackPoint[] {
  return Array.from({ length: seconds + 1 }, (_, i) => ({
    latitude: LAT + (speed * i) / 111_195,
    longitude: LON,
    accuracy: 6,
    recordedAt: at(start + i),
  }));
}

describe('progressFor', () => {
  it('counts only the distance inside the duel window', () => {
    const progress = progressFor([{ activityType: 'run', points: track(600, 3) }], 10_000, at(100), at(400));
    expect(progress.metres).toBeGreaterThan(850);
    expect(progress.metres).toBeLessThan(920);
    expect(progress.reachedAt).toBeNull();
  });

  it('finds when the target was reached', () => {
    const progress = progressFor([{ activityType: 'run', points: track(600, 3) }], 600, at(0), at(600));
    expect(progress.reachedAt).not.toBeNull();
    const second = (progress.reachedAt!.getTime() - at(0).getTime()) / 1000;
    expect(second).toBeGreaterThan(190);
    expect(second).toBeLessThan(215);
  });

  it('adds up two sessions in the window', () => {
    const progress = progressFor([
      { activityType: 'run', points: track(200, 3, 0) },
      { activityType: 'run', points: track(200, 3, 300) },
    ], 1_100, at(0), at(600));
    expect(progress.metres).toBeGreaterThan(1_150);
    expect(progress.reachedAt).not.toBeNull();
    expect(progress.reachedAt!.getTime()).toBeGreaterThan(at(300).getTime());
  });

  it('is zero with nothing recorded', () => {
    expect(progressFor([], 5_000, at(0), at(600))).toEqual({ metres: 0, reachedAt: null });
  });
});

describe('winnerOf', () => {
  const a = (metres: number, reachedAt: Date | null = null) => ({ userId: 'a', metres, reachedAt });
  const b = (metres: number, reachedAt: Date | null = null) => ({ userId: 'b', metres, reachedAt });

  it('gives it to whoever reached the target first', () => {
    expect(winnerOf(a(5_000, at(900)), b(5_200, at(800)))).toBe('b');
  });

  it('beats the farther runner when only one reached the target', () => {
    expect(winnerOf(a(5_000, at(900)), b(4_900))).toBe('a');
  });

  it('falls back to the farthest when nobody reached it', () => {
    expect(winnerOf(a(3_100), b(3_400))).toBe('b');
  });

  it('is a draw on equal distance or nobody moving', () => {
    expect(winnerOf(a(2_000), b(2_000))).toBeNull();
    expect(winnerOf(a(0), b(0))).toBeNull();
  });
});

describe('matches', () => {
  it('takes any activity for an any duel and only its own type otherwise', () => {
    expect(matches('any', 'cycle')).toBe(true);
    expect(matches('run', 'walk')).toBe(false);
  });
});
