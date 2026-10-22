import { assertScoringConfiguration } from './challenge-types';

describe('challenge scoring configuration', () => {
  it.each([
    ['WALK', 'MOST_STEPS'],
    ['STEP', 'MOST_STEPS'],
    ['RUN', 'FARTHEST_DISTANCE'],
    ['DISTANCE', 'FARTHEST_DISTANCE'],
    ['CYCLING', 'FARTHEST_DISTANCE'],
  ] as const)('accepts %s with %s', (type, scoring) => {
    expect(() => assertScoringConfiguration(type, scoring)).not.toThrow();
  });

  it.each([
    ['RUN', 'FASTEST_FIXED_DISTANCE'],
    ['TIMED', 'FASTEST_TIME'],
  ] as const)('requires a target for %s with %s', (type, scoring) => {
    expect(() => assertScoringConfiguration(type, scoring)).toThrow('target distance');
    expect(() => assertScoringConfiguration(type, scoring, 5000)).not.toThrow();
  });

  it('rejects a scoring method that does not match the challenge type', () => {
    expect(() => assertScoringConfiguration('WALK', 'FARTHEST_DISTANCE')).toThrow('not valid');
    expect(() => assertScoringConfiguration('CYCLING', 'FASTEST_TIME')).toThrow('not valid');
  });
});
