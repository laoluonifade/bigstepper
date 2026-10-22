import { describe, expect, it } from 'vitest';
import { estimatedCalories } from './calories';
import type { Activity } from './types';

const run = {
  verificationStatus: 'VERIFIED', activityType: 'run', validatedDistanceMetres: 5000,
  validatedSteps: 5500, movingSeconds: 1800,
} as Activity;

describe('estimated calories', () => {
  it('uses activity type, moving time and optional body weight', () => {
    expect(estimatedCalories(run, 70)).toBe(368);
    expect(estimatedCalories({ ...run, activityType: 'walk' }, 70)).toBe(140);
    expect(estimatedCalories({ ...run, activityType: 'cycle', validatedSteps: 0 }, 70)).toBe(238);
  });

  it('does not invent a value without weight, verification, or moving time', () => {
    expect(estimatedCalories(run, null)).toBeNull();
    expect(estimatedCalories({ ...run, verificationStatus: 'FLAGGED' }, 70)).toBeNull();
    expect(estimatedCalories({ ...run, movingSeconds: 0 }, 70)).toBeNull();
  });
});
