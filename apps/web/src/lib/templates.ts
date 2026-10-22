import type { ChallengeType, ScoringMethod } from './types';

/** One-tap starters for "Challenge someone": a private competition already set up for who you'd race. */
export type CompetitionTemplate = {
  id: string;
  who: string;
  /** Two-word rules for the Home shortcut row. */
  short: string;
  title: string;
  summary: string;
  challengeType: ChallengeType;
  scoringMethod: ScoringMethod;
  /** Kilometres, for fastest-time races. */
  targetKm?: number;
  days: number;
  capacity: number;
};

export const TEMPLATES: CompetitionTemplate[] = [
  { id: 'coworkers', short: 'Steps · 7d', who: 'Your coworkers', title: 'Office step battle', summary: 'Most steps · 7 days', challengeType: 'STEP', scoringMethod: 'MOST_STEPS', days: 7, capacity: 30 },
  { id: 'partner', short: '5K · 14d', who: 'Your partner', title: 'Couple’s 5K race', summary: 'Fastest 5K · 14 days', challengeType: 'RUN', scoringMethod: 'FASTEST_FIXED_DISTANCE', targetKm: 5, days: 14, capacity: 2 },
  { id: 'squad', short: 'Km · 7d', who: 'Your squad', title: 'Squad distance week', summary: 'Most km · 7 days', challengeType: 'DISTANCE', scoringMethod: 'FARTHEST_DISTANCE', days: 7, capacity: 10 },
  { id: 'family', short: 'Walk · 30d', who: 'Your family', title: 'Family walk-off', summary: 'Most steps · 30 days', challengeType: 'WALK', scoringMethod: 'MOST_STEPS', days: 30, capacity: 12 },
];

export const templateById = (id: string | undefined) => TEMPLATES.find((template) => template.id === id);
