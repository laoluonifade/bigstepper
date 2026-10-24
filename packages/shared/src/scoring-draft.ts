import { ACTIVITY_RULES, dailyMeasure, METRICS, scoringProblem, type ActivityType, type ChallengeType, type ScoringMethod } from './competition-rules';
import { toMetres } from './format';
import type { Unit } from './types';

/** The scoring part of the create form, as typed: amounts are in the units shown next to each field. */
export interface ScoringDraft {
  challengeType: ChallengeType;
  scoringMethod: ScoringMethod;
  /** km/mi, steps, hours or sessions, depending on the method's target. */
  target: string;
  /** km/mi, steps or minutes, depending on the daily measure. */
  daily: string;
  minSessions: string;
  minActivityDistance: string;
  minActivityMinutes: string;
  /** Timed competitions only: which activities count. */
  kinds: ActivityType[];
}

const TARGET_DEFAULTS = { distance: '5', steps: '100000', time: '10', sessions: '10' } as const;
const DAILY_DEFAULTS = { distance: '3', steps: '8000', time: '30' } as const;

export function draftFor(challengeType: ChallengeType, scoringMethod: ScoringMethod, previous?: ScoringDraft): ScoringDraft {
  const metric = METRICS[scoringMethod];
  const daily = dailyMeasure(challengeType, scoringMethod);
  const sameTarget = previous && METRICS[previous.scoringMethod]?.target === metric.target;
  const sameDaily = previous && dailyMeasure(previous.challengeType, previous.scoringMethod) === daily;
  return {
    challengeType,
    scoringMethod,
    target: metric.target ? (sameTarget && previous.target ? previous.target : TARGET_DEFAULTS[metric.target]) : '',
    daily: daily && metric.daily === 'required' ? (sameDaily && previous.daily ? previous.daily : DAILY_DEFAULTS[daily]) : sameDaily ? previous?.daily ?? '' : '',
    minSessions: scoringMethod === 'PACE_CONSISTENCY' ? previous?.minSessions || '3' : previous?.minSessions ?? '',
    minActivityDistance: previous?.minActivityDistance ?? '',
    minActivityMinutes: previous?.minActivityMinutes ?? '',
    kinds: previous?.challengeType === challengeType ? previous.kinds : ACTIVITY_RULES[challengeType].kinds,
  };
}

const number = (value: string) => (value.trim() === '' ? undefined : Number(value));

/** The API fields for a draft, and the first thing wrong with it (same checks the API runs). */
export function scoringPayload(draft: ScoringDraft, unit: Unit, prizes: boolean) {
  const metric = METRICS[draft.scoringMethod];
  const daily = dailyMeasure(draft.challengeType, draft.scoringMethod);
  const target = number(draft.target);
  const dailyValue = number(draft.daily);
  const round = (value: number | undefined) => (value === undefined || Number.isNaN(value) ? undefined : Math.round(value));
  const payload = {
    challengeType: draft.challengeType,
    scoringMethod: draft.scoringMethod,
    targetDistanceMetres: metric.target === 'distance' ? round(target === undefined ? undefined : toMetres(target, unit)) : undefined,
    targetSteps: metric.target === 'steps' ? round(target) : undefined,
    targetSeconds: metric.target === 'time' ? round(target === undefined ? undefined : target * 3600) : undefined,
    targetSessions: metric.target === 'sessions' ? round(target) : undefined,
    dailyTarget: !daily || dailyValue === undefined ? undefined
      : round(daily === 'distance' ? toMetres(dailyValue, unit) : daily === 'time' ? dailyValue * 60 : dailyValue),
    minSessions: round(number(draft.minSessions)),
    minActivityMetres: round(number(draft.minActivityDistance) === undefined ? undefined : toMetres(Number(draft.minActivityDistance), unit)),
    minActivitySeconds: round(number(draft.minActivityMinutes) === undefined ? undefined : Number(draft.minActivityMinutes) * 60),
    eligibleActivities: draft.challengeType === 'TIMED' ? draft.kinds : undefined,
  };
  const problem = scoringProblem({ ...payload, prizes })
    ?? (payload.minActivityMetres !== undefined && (payload.minActivityMetres < 100 || payload.minActivityMetres > 100_000) ? 'Minimum activity distance is out of range' : null)
    ?? (payload.minActivitySeconds !== undefined && (payload.minActivitySeconds < 60 || payload.minActivitySeconds > 36_000) ? 'Minimum activity time must be 1 to 600 minutes' : null);
  // Leave out what isn't set so the API stores nothing for it.
  const fields = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  return { fields, problem };
}
