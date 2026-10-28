/**
 * Every way to win a Jump competition, for every activity. The web form shows only what's listed here,
 * the API refuses anything that isn't, and the scoring engine reads the same definitions, so a format is
 * added in one place.
 *
 * The canonical copy lives in packages/shared/src/competition-rules.ts. apps/api/src/tables/competition-rules.ts
 * is an exact copy (the API is compiled on its own); a test fails if they ever differ. No imports here.
 */

export type ChallengeType = 'RUN' | 'WALK' | 'DISTANCE' | 'CYCLING' | 'STEP' | 'TIMED';
export type ActivityType = 'run' | 'walk' | 'cycle';

export type ScoringMethod =
  | 'FARTHEST_DISTANCE' | 'FIRST_TO_DISTANCE' | 'FASTEST_FIXED_DISTANCE' | 'FASTEST_TIME' | 'BEST_PACE' | 'BEST_AVERAGE_SPEED'
  | 'LONGEST_SINGLE' | 'MOST_ELEVATION' | 'MOST_SESSIONS' | 'FIRST_TO_SESSIONS' | 'MOST_ACTIVE_DAYS' | 'MOST_TIME'
  | 'FIRST_TO_TIME' | 'LONGEST_SESSION' | 'LONGEST_STREAK' | 'TARGET_DAYS' | 'PACE_CONSISTENCY' | 'DAILY_CONSISTENCY'
  | 'WEEKLY_CONSISTENCY' | 'MOST_STEPS' | 'FIRST_TO_STEPS' | 'MOST_STEPS_ONE_DAY' | 'AVERAGE_DAILY_STEPS';

/** What an activity contributes. Time is moving time (pauses don't count) except where a metric says elapsed. */
export type Measure = 'distance' | 'steps' | 'time' | 'elevation' | 'sessions';
/** How a score reads on a board. */
export type ScoreDisplay = 'distance' | 'steps' | 'duration' | 'sessions' | 'days' | 'elevation' | 'pace' | 'speed' | 'variation';

export type Aggregate =
  | 'total' | 'firstTo' | 'fastest' | 'longest' | 'activeDays' | 'streak' | 'targetDays' | 'bestDay' | 'dailyAverage'
  | 'averagePace' | 'averageSpeed' | 'paceVariation' | 'dailyVariation' | 'weeklyVariation';

export interface MetricDefinition {
  aggregate: Aggregate;
  measure: Measure;
  display: ScoreDisplay;
  better: 'higher' | 'lower';
  /** A target the creator must set: the distance to race, or the amount to reach first. */
  target?: 'distance' | 'steps' | 'time' | 'sessions';
  /** Needs a daily amount: the bar for a day to count (streaks, target days) or the minimum daily average. */
  daily?: 'required' | 'optional';
  /** Uses the minimum number of qualifying sessions before a score counts. */
  minSessions?: true;
  /** Safe to put cash on: hard to inflate with many tiny or doctored sessions. */
  prizes: boolean;
  /** How a tie is broken, after the score itself. */
  tieBreak: string;
}

const FIRST_TO_TIE = 'If nobody finishes, the closest to the target. Exact ties go to whoever got there first.';
const EARLIEST = 'Whoever reached that score first.';

export const METRICS: Record<ScoringMethod, MetricDefinition> = {
  FARTHEST_DISTANCE: { aggregate: 'total', measure: 'distance', display: 'distance', better: 'higher', prizes: true, tieBreak: EARLIEST },
  FIRST_TO_DISTANCE: { aggregate: 'firstTo', measure: 'distance', display: 'distance', better: 'higher', target: 'distance', prizes: true, tieBreak: FIRST_TO_TIE },
  FASTEST_FIXED_DISTANCE: { aggregate: 'fastest', measure: 'time', display: 'duration', better: 'lower', target: 'distance', prizes: true, tieBreak: 'Whoever set that time first.' },
  /** Older timed races; same rules as fastest fixed distance. Kept for competitions created with it. */
  FASTEST_TIME: { aggregate: 'fastest', measure: 'time', display: 'duration', better: 'lower', target: 'distance', prizes: true, tieBreak: 'Whoever set that time first.' },
  BEST_PACE: { aggregate: 'averagePace', measure: 'time', display: 'pace', better: 'lower', target: 'distance', prizes: false, tieBreak: EARLIEST },
  BEST_AVERAGE_SPEED: { aggregate: 'averageSpeed', measure: 'time', display: 'speed', better: 'higher', target: 'distance', prizes: false, tieBreak: EARLIEST },
  LONGEST_SINGLE: { aggregate: 'longest', measure: 'distance', display: 'distance', better: 'higher', prizes: true, tieBreak: 'Whoever did it first.' },
  MOST_ELEVATION: { aggregate: 'total', measure: 'elevation', display: 'elevation', better: 'higher', prizes: false, tieBreak: EARLIEST },
  MOST_SESSIONS: { aggregate: 'total', measure: 'sessions', display: 'sessions', better: 'higher', prizes: false, tieBreak: EARLIEST },
  FIRST_TO_SESSIONS: { aggregate: 'firstTo', measure: 'sessions', display: 'sessions', better: 'higher', target: 'sessions', prizes: false, tieBreak: FIRST_TO_TIE },
  MOST_ACTIVE_DAYS: { aggregate: 'activeDays', measure: 'distance', display: 'days', better: 'higher', daily: 'optional', prizes: false, tieBreak: EARLIEST },
  MOST_TIME: { aggregate: 'total', measure: 'time', display: 'duration', better: 'higher', prizes: false, tieBreak: EARLIEST },
  FIRST_TO_TIME: { aggregate: 'firstTo', measure: 'time', display: 'duration', better: 'higher', target: 'time', prizes: false, tieBreak: FIRST_TO_TIE },
  LONGEST_SESSION: { aggregate: 'longest', measure: 'time', display: 'duration', better: 'higher', prizes: false, tieBreak: 'Whoever did it first.' },
  LONGEST_STREAK: { aggregate: 'streak', measure: 'distance', display: 'days', better: 'higher', daily: 'required', prizes: false, tieBreak: 'Whoever completed the streak first.' },
  TARGET_DAYS: { aggregate: 'targetDays', measure: 'distance', display: 'days', better: 'higher', daily: 'required', prizes: false, tieBreak: EARLIEST },
  PACE_CONSISTENCY: { aggregate: 'paceVariation', measure: 'time', display: 'variation', better: 'lower', target: 'distance', minSessions: true, prizes: false, tieBreak: EARLIEST },
  DAILY_CONSISTENCY: { aggregate: 'dailyVariation', measure: 'distance', display: 'variation', better: 'lower', daily: 'required', prizes: false, tieBreak: EARLIEST },
  WEEKLY_CONSISTENCY: { aggregate: 'weeklyVariation', measure: 'time', display: 'variation', better: 'lower', minSessions: true, prizes: false, tieBreak: EARLIEST },
  MOST_STEPS: { aggregate: 'total', measure: 'steps', display: 'steps', better: 'higher', prizes: true, tieBreak: EARLIEST },
  FIRST_TO_STEPS: { aggregate: 'firstTo', measure: 'steps', display: 'steps', better: 'higher', target: 'steps', prizes: true, tieBreak: FIRST_TO_TIE },
  MOST_STEPS_ONE_DAY: { aggregate: 'bestDay', measure: 'steps', display: 'steps', better: 'higher', prizes: false, tieBreak: 'Whoever did it first.' },
  AVERAGE_DAILY_STEPS: { aggregate: 'dailyAverage', measure: 'steps', display: 'steps', better: 'higher', prizes: false, tieBreak: EARLIEST },
};

export interface ScoringOption {
  method: ScoringMethod;
  label: string;
  /** One line under the label: how a winner is decided. */
  summary: string;
  /** What the daily amount is measured in, when it isn't the metric's own measure. */
  dailyMeasure?: 'distance' | 'steps' | 'time';
}

export interface ActivityRules {
  label: string;
  /** Plural noun for one qualifying session: "runs", "walks", "rides", "sessions". */
  sessions: string;
  /** Which recorded activities count. Timed competitions let the creator narrow this. */
  kinds: ActivityType[];
  options: ScoringOption[];
}

export const ACTIVITY_RULES: Record<ChallengeType, ActivityRules> = {
  RUN: {
    label: 'Running', sessions: 'runs', kinds: ['run'],
    options: [
      { method: 'FARTHEST_DISTANCE', label: 'Farthest distance', summary: 'Most verified running distance in the window wins.' },
      { method: 'FIRST_TO_DISTANCE', label: 'First to distance', summary: 'First to run the target distance in total wins.' },
      { method: 'FASTEST_FIXED_DISTANCE', label: 'Fastest fixed distance', summary: 'Lowest elapsed time over the same distance, e.g. 5K.' },
      { method: 'MOST_SESSIONS', label: 'Most runs', summary: 'Most qualifying runs wins.' },
      { method: 'MOST_ACTIVE_DAYS', label: 'Most active days', summary: 'Most days with at least one qualifying run.' },
      { method: 'LONGEST_SINGLE', label: 'Longest single run', summary: 'The longest one run wins.' },
      { method: 'MOST_ELEVATION', label: 'Most elevation', summary: 'Most climbing across all runs.' },
      { method: 'BEST_PACE', label: 'Best pace', summary: 'Lowest average time per km across runs of at least the set distance.' },
      { method: 'PACE_CONSISTENCY', label: 'Pace consistency', summary: 'Steadiest pace across comparable runs wins.' },
      { method: 'MOST_TIME', label: 'Most time running', summary: 'Most total moving time wins.' },
      { method: 'LONGEST_STREAK', label: 'Longest streak', summary: 'Most days in a row hitting a daily distance.' },
      { method: 'FIRST_TO_SESSIONS', label: 'Target completion', summary: 'First to complete a set number of runs wins.' },
    ],
  },
  WALK: {
    label: 'Walking', sessions: 'walks', kinds: ['walk'],
    options: [
      { method: 'FARTHEST_DISTANCE', label: 'Farthest distance', summary: 'Most verified walking distance in the window wins.' },
      { method: 'FIRST_TO_DISTANCE', label: 'First to distance', summary: 'First to walk the target distance in total wins.' },
      { method: 'FASTEST_FIXED_DISTANCE', label: 'Fastest fixed distance', summary: 'Lowest elapsed time over the same walking distance.' },
      { method: 'MOST_STEPS', label: 'Most steps', summary: 'Most measured steps from walks wins.' },
      { method: 'MOST_SESSIONS', label: 'Most walks', summary: 'Most qualifying walks wins.' },
      { method: 'MOST_ACTIVE_DAYS', label: 'Most active days', summary: 'Most days with at least one qualifying walk.' },
      { method: 'LONGEST_SINGLE', label: 'Longest single walk', summary: 'The longest one walk wins.' },
      { method: 'MOST_TIME', label: 'Most time walking', summary: 'Most total moving time wins.' },
      { method: 'MOST_ELEVATION', label: 'Most elevation', summary: 'Most climbing across all walks.' },
      { method: 'LONGEST_STREAK', label: 'Longest streak', summary: 'Most days in a row hitting a daily distance.' },
      { method: 'TARGET_DAYS', label: 'Daily step target', summary: 'Most days reaching your daily step goal.', dailyMeasure: 'steps' },
      { method: 'DAILY_CONSISTENCY', label: 'Distance consistency', summary: 'Most even daily distance wins, above a minimum average.' },
    ],
  },
  DISTANCE: {
    label: 'Running + walking + cycling', sessions: 'sessions', kinds: ['run', 'walk', 'cycle'],
    options: [
      { method: 'FARTHEST_DISTANCE', label: 'Combined distance', summary: 'Runs, walks and rides added together. Most distance wins.' },
      { method: 'FIRST_TO_DISTANCE', label: 'First to target', summary: 'First to reach the combined distance wins.' },
      { method: 'MOST_SESSIONS', label: 'Most sessions', summary: 'Most qualifying runs, walks and rides.' },
      { method: 'MOST_ACTIVE_DAYS', label: 'Most active days', summary: 'Most days with a run, walk or ride.' },
      { method: 'MOST_TIME', label: 'Most active time', summary: 'Most moving time across runs, walks and rides.' },
      { method: 'LONGEST_SINGLE', label: 'Longest single session', summary: 'The longest run, walk or ride wins.' },
      { method: 'LONGEST_STREAK', label: 'Longest streak', summary: 'Most days in a row hitting a daily distance.' },
      { method: 'TARGET_DAYS', label: 'Target consistency', summary: 'Most days reaching a daily distance.' },
    ],
  },
  CYCLING: {
    label: 'Cycling', sessions: 'rides', kinds: ['cycle'],
    options: [
      { method: 'FARTHEST_DISTANCE', label: 'Farthest distance', summary: 'Most verified cycling distance wins.' },
      { method: 'FIRST_TO_DISTANCE', label: 'First to target', summary: 'First to ride the target distance in total wins.' },
      { method: 'FASTEST_FIXED_DISTANCE', label: 'Fastest fixed distance', summary: 'Lowest elapsed time over the same distance.' },
      { method: 'MOST_SESSIONS', label: 'Most rides', summary: 'Most qualifying rides wins.' },
      { method: 'MOST_ACTIVE_DAYS', label: 'Most active days', summary: 'Most days with at least one qualifying ride.' },
      { method: 'LONGEST_SINGLE', label: 'Longest single ride', summary: 'The longest one ride wins.' },
      { method: 'MOST_ELEVATION', label: 'Most elevation', summary: 'Most climbing across all rides.' },
      { method: 'MOST_TIME', label: 'Most time cycling', summary: 'Most total moving time wins.' },
      { method: 'BEST_AVERAGE_SPEED', label: 'Best average speed', summary: 'Highest average speed across rides of at least the set distance.' },
      { method: 'LONGEST_STREAK', label: 'Longest streak', summary: 'Most days in a row hitting a daily distance.' },
      { method: 'TARGET_DAYS', label: 'Distance target consistency', summary: 'Most days reaching a daily distance.' },
    ],
  },
  STEP: {
    label: 'Steps', sessions: 'sessions', kinds: ['run', 'walk'],
    options: [
      { method: 'MOST_STEPS', label: 'Most steps', summary: 'Most measured steps wins.' },
      { method: 'FIRST_TO_STEPS', label: 'First to target', summary: 'First to reach the step total wins.' },
      { method: 'MOST_STEPS_ONE_DAY', label: 'Most steps in one day', summary: 'The biggest single day wins.' },
      { method: 'TARGET_DAYS', label: 'Most target days', summary: 'Most days reaching the daily step goal.', dailyMeasure: 'steps' },
      { method: 'AVERAGE_DAILY_STEPS', label: 'Average daily steps', summary: 'Highest average per competition day so far.' },
      { method: 'DAILY_CONSISTENCY', label: 'Consistency', summary: 'Most even daily steps wins, above a minimum average.', dailyMeasure: 'steps' },
      { method: 'LONGEST_STREAK', label: 'Longest streak', summary: 'Most days in a row reaching the daily step goal.', dailyMeasure: 'steps' },
      { method: 'MOST_ACTIVE_DAYS', label: 'Most active days', summary: 'Most days with at least the minimum steps.', dailyMeasure: 'steps' },
    ],
  },
  TIMED: {
    label: 'Timed activity', sessions: 'sessions', kinds: ['run', 'walk', 'cycle'],
    options: [
      { method: 'MOST_TIME', label: 'Most active time', summary: 'Most total moving time wins.' },
      { method: 'FIRST_TO_TIME', label: 'First to target', summary: 'First to build up the target time wins.' },
      { method: 'MOST_SESSIONS', label: 'Most sessions', summary: 'Most qualifying sessions wins.' },
      { method: 'LONGEST_SESSION', label: 'Longest session', summary: 'The longest one session wins.' },
      { method: 'MOST_ACTIVE_DAYS', label: 'Most active days', summary: 'Most days with qualifying activity.', dailyMeasure: 'time' },
      { method: 'LONGEST_STREAK', label: 'Longest streak', summary: 'Most days in a row reaching a daily time.', dailyMeasure: 'time' },
      { method: 'TARGET_DAYS', label: 'Most qualifying days', summary: 'Most days reaching the daily time.', dailyMeasure: 'time' },
      { method: 'WEEKLY_CONSISTENCY', label: 'Weekly consistency', summary: 'Most even weekly time wins, after a minimum number of sessions.' },
    ],
  },
};

/** Who competes, separate from how the score works. */
export type CompetitionFormat = 'open' | 'invite' | 'head_to_head';

export const FORMATS: Record<CompetitionFormat, { label: string; summary: string }> = {
  open: { label: 'Open leaderboard', summary: 'Listed on Compete. Anyone eligible can join.' },
  invite: { label: 'Invite-only', summary: 'Hidden from Compete. Only people you invite can join.' },
  head_to_head: { label: 'Head-to-head', summary: 'You and one other person. Better score wins.' },
};

export function scoringOption(challengeType: ChallengeType, method: ScoringMethod): ScoringOption | undefined {
  return ACTIVITY_RULES[challengeType]?.options.find((option) => option.method === method);
}

/** What the daily amount of this option is measured in, or null when it takes none. */
export function dailyMeasure(challengeType: ChallengeType, method: ScoringMethod): 'distance' | 'steps' | 'time' | null {
  const metric = METRICS[method];
  if (!metric?.daily) return null;
  const option = scoringOption(challengeType, method);
  if (option?.dailyMeasure) return option.dailyMeasure;
  return metric.measure === 'steps' ? 'steps' : metric.measure === 'time' ? 'time' : 'distance';
}

export interface ScoringSettings {
  challengeType: ChallengeType;
  scoringMethod: ScoringMethod;
  targetDistanceMetres?: number | null;
  targetSteps?: number | null;
  targetSeconds?: number | null;
  targetSessions?: number | null;
  dailyTarget?: number | null;
  minSessions?: number | null;
  eligibleActivities?: ActivityType[] | null;
  /** Cash on the line (paid or funded). */
  prizes?: boolean;
}

/** Why these settings can't be used, or null when they're fine. The API and the form use the same checks. */
export function scoringProblem(settings: ScoringSettings): string | null {
  const activity = ACTIVITY_RULES[settings.challengeType];
  if (!activity) return 'Choose an activity';
  const option = scoringOption(settings.challengeType, settings.scoringMethod);
  if (!option) return `${settings.scoringMethod.toLowerCase().replace(/_/g, ' ')} isn't a way to win ${activity.label.toLowerCase()}`;
  const metric = METRICS[settings.scoringMethod];
  if (settings.prizes && !metric.prizes) return `${option.label} competitions can't have cash prizes yet`;
  const between = (value: number | null | undefined, min: number, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
  if (metric.target === 'distance' && !between(settings.targetDistanceMetres, 100, 1_000_000)) return 'Set a distance between 0.1 and 1,000 km';
  if (metric.target === 'steps' && !between(settings.targetSteps, 1_000, 10_000_000)) return 'Set a step target between 1,000 and 10,000,000';
  if (metric.target === 'time' && !between(settings.targetSeconds, 600, 1_000 * 3600)) return 'Set a time target between 10 minutes and 1,000 hours';
  if (metric.target === 'sessions' && !between(settings.targetSessions, 1, 1_000)) return 'Set a number of sessions between 1 and 1,000';
  const daily = dailyMeasure(settings.challengeType, settings.scoringMethod);
  if (metric.daily === 'required' && !(typeof settings.dailyTarget === 'number' && settings.dailyTarget > 0)) return 'Set the daily amount';
  if (daily && settings.dailyTarget != null) {
    const [min, max] = daily === 'steps' ? [100, 200_000] : daily === 'time' ? [60, 86_400] : [100, 500_000];
    if (!between(settings.dailyTarget, min, max)) return 'That daily amount is out of range';
  }
  if (settings.minSessions != null && !between(settings.minSessions, 1, 100)) return 'Minimum sessions must be between 1 and 100';
  if (settings.eligibleActivities) {
    if (!settings.eligibleActivities.length || settings.eligibleActivities.some((kind) => !activity.kinds.includes(kind))) return `Choose which ${activity.sessions} count`;
  }
  return null;
}

/** The activity kinds a competition counts: the creator's choice for timed ones, else the activity's own. */
export function eligibleKinds(challengeType: ChallengeType, chosen?: ActivityType[] | null): ActivityType[] {
  return chosen?.length ? chosen : ACTIVITY_RULES[challengeType]?.kinds ?? [];
}
