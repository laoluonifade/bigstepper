export const CHALLENGE_TYPES = ['WALK', 'RUN', 'DISTANCE', 'STEP', 'TIMED', 'CYCLING'] as const;
export type ChallengeType = (typeof CHALLENGE_TYPES)[number];

export const SCORING_METHODS = ['MOST_STEPS', 'FARTHEST_DISTANCE', 'FASTEST_FIXED_DISTANCE', 'FASTEST_TIME'] as const;
export type ScoringMethod = (typeof SCORING_METHODS)[number];

export function assertScoringConfiguration(
  challengeType: ChallengeType,
  scoringMethod: ScoringMethod,
  targetDistanceMetres?: number,
): void {
  const allowed: Record<ChallengeType, ScoringMethod[]> = {
    WALK: ['MOST_STEPS'],
    RUN: ['FARTHEST_DISTANCE', 'FASTEST_FIXED_DISTANCE'],
    DISTANCE: ['FARTHEST_DISTANCE'],
    STEP: ['MOST_STEPS'],
    TIMED: ['FASTEST_TIME'],
    CYCLING: ['FARTHEST_DISTANCE'],
  };
  if (!allowed[challengeType].includes(scoringMethod)) {
    throw new Error(`${scoringMethod} is not valid for a ${challengeType} competition`);
  }
  if (['FASTEST_FIXED_DISTANCE', 'FASTEST_TIME'].includes(scoringMethod) && !targetDistanceMetres) {
    throw new Error('A target distance is required for fastest-time competitions');
  }
}
