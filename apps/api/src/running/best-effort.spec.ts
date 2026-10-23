import { bestEffortSeconds } from './track';

describe('best effort over a distance', () => {
  // A run at 6:00/km for 4 km, a 4 km burst at 4:00/km, then 6 km easy at 6:00/km.
  const profile: Array<[number, number]> = [];
  let seconds = 0;
  for (let km = 0; km <= 14; km += 1) {
    profile.push([seconds * 1000, km * 1000]);
    seconds += km >= 4 && km < 8 ? 240 : 360;
  }

  it('finds the fastest stretch anywhere in the run, not the whole run', () => {
    expect(bestEffortSeconds(profile, 4000)).toBe(960);
    // Best 10 km covers the burst: 4 fast km and 6 easy ones.
    expect(bestEffortSeconds(profile, 10_000)).toBe(4 * 240 + 6 * 360);
  });

  it('interpolates between fixes', () => {
    expect(bestEffortSeconds([[0, 0], [100_000, 400], [200_000, 800]], 600)).toBe(150);
  });

  it('returns null when the run never covered the distance', () => {
    expect(bestEffortSeconds(profile, 15_000)).toBeNull();
    expect(bestEffortSeconds([], 1000)).toBeNull();
  });
});
