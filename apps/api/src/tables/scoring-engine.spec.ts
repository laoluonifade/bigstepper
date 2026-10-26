import { daysBetween, ScoredActivity, scoreEntrants, ScoringRules } from './scoring-engine';

const base: ScoringRules = {
  method: 'FARTHEST_DISTANCE', rulesVersion: 2, targetDistanceMetres: null, targetSteps: null, targetSeconds: null,
  targetSessions: null, dailyTarget: null, dailyMeasure: null, minSessions: null, windowDays: daysBetween('2026-10-01', '2026-10-07'),
};

let sequence = 0;
function activity(registrationId: string, day: string, hour: number, fields: Partial<ScoredActivity> = {}): ScoredActivity {
  const startedAt = new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);
  const moving = fields.movingSeconds ?? 1800;
  return {
    registrationId, activityId: `a${(sequence += 1).toString().padStart(4, '0')}`, startedAt,
    finishedAt: new Date(startedAt.getTime() + (fields.elapsedSeconds ?? moving) * 1000), day,
    distance: 5000, steps: 6000, movingSeconds: moving, elapsedSeconds: moving, elevation: null, completionSeconds: null,
    ...fields,
  };
}

const score = (rules: Partial<ScoringRules>, activities: ScoredActivity[], ids = ['amy', 'ben']) => scoreEntrants({ ...base, ...rules }, ids, activities);

describe('scoring engine', () => {
  it('totals distance, and counts one outing recorded twice only once', () => {
    const scores = score({}, [
      activity('amy', '2026-10-01', 7),
      activity('amy', '2026-10-01', 7, { distance: 5100 }),
      activity('amy', '2026-10-02', 7, { distance: 3000 }),
    ]);
    expect(scores.get('amy')!.score).toBe(8000);
    expect(scores.get('ben')!.score).toBe(0);
  });

  it('ranks first-to formats by when the target was crossed', () => {
    const scores = score({ method: 'FIRST_TO_DISTANCE', targetDistanceMetres: 10_000 }, [
      activity('amy', '2026-10-01', 7, { distance: 6000 }),
      activity('amy', '2026-10-03', 7, { distance: 6000 }),
      activity('ben', '2026-10-02', 7, { distance: 11_000 }),
    ]);
    expect(scores.get('ben')!.targetReachedAt).toEqual(new Date('2026-10-02T07:30:00Z'));
    expect(scores.get('amy')!.targetReachedAt).toEqual(new Date('2026-10-03T07:30:00Z'));
  });

  it('ranks fixed-distance races on each activity’s best effort over the distance', () => {
    const scores = score({ method: 'FASTEST_FIXED_DISTANCE', targetDistanceMetres: 10_000 }, [
      activity('amy', '2026-10-01', 7, { distance: 14_020, movingSeconds: 4832, completionSeconds: 3120 }),
      activity('amy', '2026-10-02', 7, { distance: 10_100, completionSeconds: 3300 }),
      activity('ben', '2026-10-02', 7, { distance: 9_800, completionSeconds: null }),
    ]);
    expect(scores.get('amy')!.score).toBe(3120);
    expect(scores.get('amy')!.rankScore).toBe(-3120);
    expect(scores.get('ben')!.score).toBeNull();
  });

  it('counts sessions, active days and target days', () => {
    const runs = [
      activity('amy', '2026-10-01', 7, { distance: 2000 }),
      activity('amy', '2026-10-01', 18, { distance: 2000 }),
      activity('amy', '2026-10-03', 7, { distance: 1000 }),
    ];
    expect(score({ method: 'MOST_SESSIONS' }, runs).get('amy')!.score).toBe(3);
    expect(score({ method: 'MOST_ACTIVE_DAYS' }, runs).get('amy')!.score).toBe(2);
    expect(score({ method: 'TARGET_DAYS', dailyTarget: 3000, dailyMeasure: 'distance' }, runs).get('amy')!.score).toBe(1);
  });

  it('finds the longest streak of qualifying days', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06'];
    const scores = score({ method: 'LONGEST_STREAK', dailyTarget: 3000, dailyMeasure: 'distance' }, [
      ...days.map((day) => activity('amy', day, 7)),
      activity('amy', '2026-10-03', 7, { distance: 1000 }),
    ]);
    expect(scores.get('amy')!.score).toBe(3);
  });

  it('scores step days: best day and the average over the days so far', () => {
    const steps = [
      activity('amy', '2026-10-01', 7, { steps: 4000 }),
      activity('amy', '2026-10-01', 19, { steps: 9000 }),
      activity('amy', '2026-10-02', 7, { steps: 1000 }),
    ];
    expect(score({ method: 'MOST_STEPS_ONE_DAY', dailyMeasure: 'steps' }, steps).get('amy')!.score).toBe(13_000);
    expect(score({ method: 'AVERAGE_DAILY_STEPS', dailyMeasure: 'steps' }, steps).get('amy')!.score).toBe(2000);
  });

  it('rewards even days and leaves out anyone under the minimum average', () => {
    const window = daysBetween('2026-10-01', '2026-10-04');
    const even = window.map((day) => activity('amy', day, 7, { steps: 8000 }));
    const lumpy = [activity('ben', '2026-10-01', 7, { steps: 30_000 }), activity('ben', '2026-10-02', 7, { steps: 2000 })];
    const scores = score({ method: 'DAILY_CONSISTENCY', dailyMeasure: 'steps', dailyTarget: 5000, windowDays: window }, [...even, ...lumpy]);
    expect(scores.get('amy')!.score).toBe(0);
    expect(scores.get('ben')!.score).toBeGreaterThan(100);
    const strict = score({ method: 'DAILY_CONSISTENCY', dailyMeasure: 'steps', dailyTarget: 9000, windowDays: window }, even);
    expect(strict.get('amy')!.qualified).toBe(false);
  });

  it('needs enough comparable runs for pace consistency', () => {
    const runs = [1500, 1530, 1470].map((seconds, index) => activity('amy', `2026-10-0${index + 1}`, 7, { movingSeconds: seconds }));
    expect(score({ method: 'PACE_CONSISTENCY', targetDistanceMetres: 5000 }, runs).get('amy')!.qualified).toBe(true);
    expect(score({ method: 'PACE_CONSISTENCY', targetDistanceMetres: 5000 }, runs.slice(0, 2)).get('amy')!.qualified).toBe(false);
  });

  it('scores average pace in seconds per km, lower ranking higher', () => {
    const scores = score({ method: 'BEST_PACE', targetDistanceMetres: 5000 }, [
      activity('amy', '2026-10-01', 7, { distance: 5000, movingSeconds: 1500 }),
      activity('amy', '2026-10-02', 7, { distance: 3000, movingSeconds: 600 }),
    ]);
    expect(scores.get('amy')!.score).toBe(300);
    expect(scores.get('amy')!.rankScore).toBe(-300);
  });

  it('only counts elevation that was recorded', () => {
    const scores = score({ method: 'MOST_ELEVATION' }, [
      activity('amy', '2026-10-01', 7, { elevation: 120 }),
      activity('amy', '2026-10-02', 7, { elevation: null }),
    ]);
    expect(scores.get('amy')!.score).toBe(120);
  });

  it('ranks entrants under the minimum sessions after everyone who met it', () => {
    const scores = score({ method: 'FARTHEST_DISTANCE', minSessions: 2 }, [
      activity('amy', '2026-10-01', 7, { distance: 20_000 }),
      activity('ben', '2026-10-01', 7), activity('ben', '2026-10-02', 7),
    ]);
    expect(scores.get('amy')!.qualified).toBe(false);
    expect(scores.get('ben')!.qualified).toBe(true);
  });

  it('keeps rules v1 competitions scored exactly as before', () => {
    const legacy = score({ method: 'FASTEST_FIXED_DISTANCE', rulesVersion: 1, targetDistanceMetres: 5000 }, [
      activity('amy', '2026-10-01', 7, { distance: 10_000, completionSeconds: 1400 }),
    ]);
    expect(legacy.get('amy')).toEqual({ score: 1400, rankScore: -1400, targetReachedAt: null, scoredAt: null, qualified: true });
    const both = [activity('ben', '2026-10-01', 7), activity('ben', '2026-10-01', 7)];
    expect(score({ rulesVersion: 1 }, both).get('ben')!.score).toBe(10_000);
  });
});
