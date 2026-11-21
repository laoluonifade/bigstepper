import { dailyGoals, scorePersonal, targetFor } from './personal-targets';
import type { ScoredActivity } from './scoring-engine';

const day = (registrationId: string, date: string, steps: number): ScoredActivity => ({
  registrationId, activityId: `day:${date}`, startedAt: new Date(`${date}T00:00:00Z`), finishedAt: new Date(`${date}T20:00:00Z`), day: date,
  distance: 0, steps, movingSeconds: 0, elapsedSeconds: 0, elevation: null, completionSeconds: null,
});

describe('personal targets', () => {
  it('sizes targets to each walker', () => {
    expect(targetFor({ baseline: 'daily_average', factor: 1.2, perDay: true }, 5000, 7)).toBe(42_000);
    expect(targetFor({ baseline: 'daily_average', factor: 0.3, min: 2000, max: 5000 }, 3000, 1)).toBe(2000);
    expect(targetFor({ baseline: 'daily_average', factor: 0.3, min: 2000, max: 5000 }, 30_000, 1)).toBe(5000);
    expect(targetFor({ baseline: 'last_period_total', factor: 1, add: 1 }, 48_123, 7)).toBe(48_130);
  });

  it('eases off for walkers who already do a lot', () => {
    const rule = { baseline: 'daily_average' as const, factor: 2, highActive: { above: 10_000, factor: 1.5 } };
    expect(targetFor(rule, 3000, 1)).toBe(6000);
    expect(targetFor(rule, 12_000, 1)).toBe(18_000);
  });

  it('ranks how far along your own target you are, not raw steps', () => {
    const scores = scorePersonal('personalTotal', { baseline: 'daily_average', factor: 1 }, '2026-11-23',
      new Map([['beginner', 2000], ['regular', 12_000], ['unset', null]]),
      [day('beginner', '2026-11-23', 3000), day('regular', '2026-11-23', 9000)]);
    expect(scores.get('beginner')?.score).toBe(150);
    expect(scores.get('regular')?.score).toBe(75);
    expect(scores.get('unset')?.score).toBeNull();
  });

  it('counts the days each walker hits a climbing target', () => {
    const rule = { baseline: 'daily_average' as const, factor: 1, ladder: 0.05 };
    expect(dailyGoals(rule, 4000, 3)).toEqual([4000, 4200, 4400]);
    const scores = scorePersonal('personalDays', rule, '2026-11-23', new Map([['a', 4000]]),
      [day('a', '2026-11-23', 4000), day('a', '2026-11-24', 4100), day('a', '2026-11-25', 5000)]);
    expect(scores.get('a')?.score).toBe(2);
    expect(scores.get('a')?.rankScore).toBeGreaterThan(2);
  });
});
