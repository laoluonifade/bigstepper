import { readFileSync } from 'fs';
import { join } from 'path';
import { transpileModule } from 'typescript';
import { assertScoringConfiguration } from './challenge-types';
import { ACTIVITY_RULES, eligibleKinds, METRICS } from './competition-rules';
import { scoringColumns } from './scoring-columns';

describe('challenge scoring configuration', () => {
  it('is the same catalog the web app uses', () => {
    const code = (path: string) => transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { removeComments: true } }).outputText;
    expect(code(join(__dirname, 'competition-rules.ts'))).toBe(code(join(__dirname, '../../../../packages/shared/src/competition-rules.ts')));
  });

  it.each([
    ['WALK', 'MOST_STEPS'],
    ['STEP', 'MOST_STEPS'],
    ['RUN', 'FARTHEST_DISTANCE'],
    ['DISTANCE', 'FARTHEST_DISTANCE'],
    ['CYCLING', 'FARTHEST_DISTANCE'],
    ['TIMED', 'MOST_TIME'],
  ] as const)('accepts %s with %s', (challengeType, scoringMethod) => {
    expect(() => assertScoringConfiguration({ challengeType, scoringMethod })).not.toThrow();
  });

  it('requires the target each method needs', () => {
    expect(() => assertScoringConfiguration({ challengeType: 'RUN', scoringMethod: 'FASTEST_FIXED_DISTANCE' })).toThrow('distance');
    expect(() => assertScoringConfiguration({ challengeType: 'RUN', scoringMethod: 'FASTEST_FIXED_DISTANCE', targetDistanceMetres: 5000 })).not.toThrow();
    expect(() => assertScoringConfiguration({ challengeType: 'STEP', scoringMethod: 'FIRST_TO_STEPS' })).toThrow('step target');
    expect(() => assertScoringConfiguration({ challengeType: 'TIMED', scoringMethod: 'FIRST_TO_TIME', targetSeconds: 36_000 })).not.toThrow();
    expect(() => assertScoringConfiguration({ challengeType: 'WALK', scoringMethod: 'TARGET_DAYS' })).toThrow('daily');
    expect(() => assertScoringConfiguration({ challengeType: 'WALK', scoringMethod: 'TARGET_DAYS', dailyTarget: 8000 })).not.toThrow();
  });

  it('rejects a method that does not belong to the activity', () => {
    expect(() => assertScoringConfiguration({ challengeType: 'WALK', scoringMethod: 'BEST_PACE', targetDistanceMetres: 5000 })).toThrow("isn't a way to win");
    expect(() => assertScoringConfiguration({ challengeType: 'TIMED', scoringMethod: 'FASTEST_TIME', targetDistanceMetres: 5000 })).toThrow("isn't a way to win");
  });

  it('keeps cash prizes to formats that are hard to game', () => {
    expect(() => assertScoringConfiguration({ challengeType: 'RUN', scoringMethod: 'MOST_SESSIONS', prizes: true })).toThrow('cash prizes');
    expect(() => assertScoringConfiguration({ challengeType: 'RUN', scoringMethod: 'FARTHEST_DISTANCE', prizes: true })).not.toThrow();
    expect(() => assertScoringConfiguration({ challengeType: 'CYCLING', scoringMethod: 'FARTHEST_DISTANCE', prizes: true })).toThrow('cash prizes');
  });

  it('only allows the activity kinds an activity includes', () => {
    expect(() => assertScoringConfiguration({ challengeType: 'TIMED', scoringMethod: 'MOST_TIME', eligibleActivities: ['cycle'] })).not.toThrow();
    expect(() => assertScoringConfiguration({ challengeType: 'RUN', scoringMethod: 'MOST_TIME', eligibleActivities: ['cycle'] })).toThrow();
  });

  it('counts runs, walks and rides in new Distance competitions, including prize competitions', () => {
    expect(eligibleKinds('DISTANCE')).toEqual(['run', 'walk', 'cycle']);
    expect(scoringColumns({ challengeType: 'DISTANCE', scoringMethod: 'FARTHEST_DISTANCE' }, true).eligibleActivities)
      .toEqual(['run', 'walk', 'cycle']);
  });

  it('lists only methods the engine can score', () => {
    for (const activity of Object.values(ACTIVITY_RULES)) {
      for (const option of activity.options) expect(METRICS[option.method]).toBeDefined();
    }
  });
});
