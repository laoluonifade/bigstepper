import { describe, expect, it } from 'vitest';
import { computeMilestones } from './progress';
import type { Activity } from './types';

function activity(type: 'walk' | 'run'): Activity {
  return {
    activityType: type,
    verificationStatus: 'VERIFIED',
    validatedDistanceMetres: 5200,
    stepDistanceMetres: 0,
    recordedDistanceMetres: 5200,
    startedAt: '2026-10-20T08:00:00Z',
  } as Activity;
}

describe('run milestones', () => {
  it('does not award run-specific badges for a walk', () => {
    const badges = computeMilestones([activity('walk')], new Date('2026-10-21T12:00:00Z'));
    expect(badges.find((badge) => badge.id === 'first')?.earned).toBe(false);
    expect(badges.find((badge) => badge.id === '5k')?.earned).toBe(false);
  });

  it('awards the first-run and 5K badges for a verified run', () => {
    const badges = computeMilestones([activity('run')], new Date('2026-10-21T12:00:00Z'));
    expect(badges.find((badge) => badge.id === 'first')?.earned).toBe(true);
    expect(badges.find((badge) => badge.id === '5k')?.earned).toBe(true);
  });
});
