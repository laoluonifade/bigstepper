import { withHealthDays } from './competition-credits';
import { countsAppleHealth } from './competition-rules';
import { ScoredActivity } from './scoring-engine';

const row = (patch: Partial<ScoredActivity>): ScoredActivity => ({
  registrationId: 'r', activityId: 'a', startedAt: new Date('2026-11-01T07:00:00Z'), finishedAt: new Date('2026-11-01T08:00:00Z'),
  day: '2026-11-01', distance: 0, steps: 0, movingSeconds: 0, elapsedSeconds: 0, elevation: null, completionSeconds: null, ...patch,
});

describe('Apple Health in competitions', () => {
  it('counts each day once, taking the higher of recorded activities and Apple Health', () => {
    const activities = [
      row({ activityId: 'walk-1', steps: 3000, distance: 2400 }),
      row({ activityId: 'walk-2', steps: 1000, distance: 800 }),
      row({ activityId: 'walk-3', day: '2026-10-31', steps: 5000, distance: 4000 }),
    ];
    const health = [row({ activityId: 'day:2026-11-01', steps: 9000, distance: 2000, startedAt: new Date('2026-10-31T23:00:00Z') })];
    const scored = withHealthDays(activities, health);
    expect(scored.map((item) => [item.activityId, item.steps, item.distance])).toEqual([
      ['walk-3', 5000, 4000],
      ['day:2026-11-01', 9000, 3200],
    ]);
  });

  it('applies only to free step, walking and combined-distance competitions scored on daily totals', () => {
    expect(countsAppleHealth({ type: 'free', challengeType: 'STEP', scoringMethod: 'MOST_STEPS' })).toBe(true);
    expect(countsAppleHealth({ type: 'free', challengeType: 'WALK', scoringMethod: 'FARTHEST_DISTANCE' })).toBe(true);
    expect(countsAppleHealth({ type: 'sponsored', challengeType: 'STEP', scoringMethod: 'MOST_STEPS' })).toBe(false);
    expect(countsAppleHealth({ type: 'free', challengeType: 'RUN', scoringMethod: 'FARTHEST_DISTANCE' })).toBe(false);
    expect(countsAppleHealth({ type: 'free', challengeType: 'WALK', scoringMethod: 'LONGEST_SINGLE' })).toBe(false);
  });
});
