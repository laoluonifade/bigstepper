import { ACTIVITY_RULES, ChallengeType, METRICS, ScoringMethod, ScoringSettings, scoringProblem } from './competition-rules';

export type { ChallengeType, ScoringMethod };
export const CHALLENGE_TYPES = Object.keys(ACTIVITY_RULES) as ChallengeType[];
export const SCORING_METHODS = Object.keys(METRICS) as ScoringMethod[];

/** Throws with a runner-readable reason when a competition's scoring settings can't be used. */
export function assertScoringConfiguration(settings: ScoringSettings): void {
  const problem = scoringProblem(settings);
  if (problem) throw new Error(problem);
}
