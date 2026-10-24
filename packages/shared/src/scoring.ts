import { ACTIVITY_RULES, dailyMeasure, eligibleKinds, METRICS, scoringOption, type MetricDefinition, type ScoringMethod } from './competition-rules';
import { formatDistance, formatDuration } from './format';
import type { CompetitionTable, Unit } from './types';

/** The scoring fields of a competition: enough to label, format and explain its scores. */
export type Scored = Pick<CompetitionTable, 'challengeType' | 'scoringMethod' | 'targetDistanceMetres'> &
  Partial<Pick<CompetitionTable, 'targetSteps' | 'targetSeconds' | 'targetSessions' | 'dailyTarget' | 'minSessions' | 'minActivityMetres' | 'minActivitySeconds' | 'eligibleActivities' | 'timeZone' | 'rulesVersion' | 'distanceCapMetres'>>;

export function metricOf(method: ScoringMethod | string): MetricDefinition {
  return METRICS[method as ScoringMethod] ?? METRICS.FARTHEST_DISTANCE;
}

export const lowerIsBetter = (method: ScoringMethod | string) => metricOf(method).better === 'lower';

const KM_PER_MILE = 1.609344;

/** What a competition is for, in a word or two: "Run", "Walk", "Run + walk", "Steps", "Ride", "Timed". */
export function activityLabel(challengeType: string) {
  return ({ RUN: 'Run', WALK: 'Walk', DISTANCE: 'Run + walk', STEP: 'Steps', CYCLING: 'Ride', TIMED: 'Timed' } as Record<string, string>)[challengeType] ?? challengeType;
}

function sessionNoun(table: Pick<Scored, 'challengeType'>, count: number) {
  const plural = ACTIVITY_RULES[table.challengeType]?.sessions ?? 'sessions';
  return count === 1 ? plural.replace(/s$/, '') : plural;
}

/** "45 min", "2h 30m": a time amount rather than a stopwatch reading. */
export function formatAmountOfTime(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
}

/**
 * A score in its own unit: "12.4 km", "8,120 steps", "24:10", "5:12 /km", "±6.2%". With short, words the
 * column header already says (steps, days, runs) are left off.
 */
export function formatScore(table: Pick<Scored, 'challengeType' | 'scoringMethod'>, value: number | string | null | undefined, unit: Unit, { short = false } = {}): string | null {
  if (value === null || value === undefined || value === '') return null;
  const score = Number(value);
  const whole = Math.round(score);
  switch (metricOf(table.scoringMethod).display) {
    case 'distance': return formatDistance(score, unit);
    case 'steps': return short ? whole.toLocaleString('en-GB') : `${whole.toLocaleString('en-GB')} steps`;
    case 'duration': return metricOf(table.scoringMethod).aggregate === 'fastest' ? formatDuration(whole) : formatAmountOfTime(whole);
    case 'sessions': return short ? String(whole) : `${whole} ${sessionNoun(table, whole)}`;
    case 'days': return short ? String(whole) : `${whole} ${whole === 1 ? 'day' : 'days'}`;
    case 'elevation': return unit === 'km' ? `${whole.toLocaleString('en-GB')} m` : `${Math.round(score * 3.28084).toLocaleString('en-GB')} ft`;
    case 'pace': {
      const perUnit = unit === 'km' ? score : score * KM_PER_MILE;
      const seconds = Math.round(perUnit);
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} /${unit}`;
    }
    case 'speed': return `${(unit === 'km' ? score : score / KM_PER_MILE).toFixed(1)} ${unit === 'km' ? 'km/h' : 'mph'}`;
    case 'variation': return `±${score.toFixed(1)}%`;
  }
}

/** The column header for a board. */
export function scoreHeader(table: Pick<Scored, 'challengeType' | 'scoringMethod'>) {
  const display = metricOf(table.scoringMethod).display;
  return {
    distance: 'Distance', steps: 'Steps', duration: 'Time', sessions: ACTIVITY_RULES[table.challengeType]?.sessions.replace(/^./, (c) => c.toUpperCase()) ?? 'Sessions',
    days: 'Days', elevation: 'Climb', pace: 'Pace', speed: 'Speed', variation: 'Spread',
  }[display];
}

/** How far behind the leader, in the score's own unit ("1.2 km", "3 days", "0:42"). */
export function formatGap(table: Pick<Scored, 'challengeType' | 'scoringMethod'>, mine: number, leader: number, unit: Unit) {
  const gap = Math.abs(lowerIsBetter(table.scoringMethod) ? mine - leader : leader - mine);
  if (metricOf(table.scoringMethod).display === 'variation') return `${gap.toFixed(1)} pts`;
  return formatScore(table, gap, unit);
}

/** 0–1: how close a score is to the leader's (1 = level). */
export function towardLeader(method: ScoringMethod | string, mine: number | null | undefined, leader: number | null | undefined) {
  if (mine === null || mine === undefined || leader === null || leader === undefined) return 0;
  if (lowerIsBetter(method)) return mine <= 0 ? 1 : Math.max(0, Math.min(1, leader / mine));
  return leader <= 0 ? 0 : Math.min(1, mine / leader);
}

/** Whether a board score means someone has actually scored (a 0 km total hasn't; a 0% spread has). */
export function hasScored(method: ScoringMethod | string, score: number | string | null | undefined) {
  if (score === null || score === undefined) return false;
  return lowerIsBetter(method) || Number(score) > 0;
}

/** The daily amount, e.g. "3 km", "8,000 steps", "30 min". */
export function formatDaily(table: Scored, unit: Unit) {
  const measure = dailyMeasure(table.challengeType, table.scoringMethod);
  if (!measure || !table.dailyTarget) return null;
  if (measure === 'steps') return `${table.dailyTarget.toLocaleString('en-GB')} steps`;
  if (measure === 'time') return formatAmountOfTime(table.dailyTarget);
  return formatDistance(table.dailyTarget, unit);
}

function targetText(table: Scored, unit: Unit) {
  switch (metricOf(table.scoringMethod).target) {
    case 'distance': return table.targetDistanceMetres ? formatDistance(table.targetDistanceMetres, unit) : null;
    case 'steps': return table.targetSteps ? `${table.targetSteps.toLocaleString('en-GB')} steps` : null;
    case 'time': return table.targetSeconds ? formatAmountOfTime(table.targetSeconds) : null;
    case 'sessions': return table.targetSessions ? `${table.targetSessions} ${sessionNoun(table, table.targetSessions)}` : null;
    default: return null;
  }
}

/** "Fastest 5 km", "First to 100,000 steps", "Longest streak · 3 km a day". */
export function winsLabel(table: Scored, unit: Unit) {
  const label = scoringOption(table.challengeType, table.scoringMethod)?.label ?? (metricOf(table.scoringMethod).aggregate === 'fastest' ? 'Fastest completion' : 'Farthest distance');
  const target = targetText(table, unit);
  const daily = formatDaily(table, unit);
  const metric = metricOf(table.scoringMethod);
  if (metric.aggregate === 'fastest' && target) return `Fastest ${target}`;
  if (metric.aggregate === 'firstTo' && target) return `First to ${target}`;
  if ((metric.aggregate === 'averagePace' || metric.aggregate === 'averageSpeed' || metric.aggregate === 'paceVariation') && target) return `${label} · ${target}+ ${ACTIVITY_RULES[table.challengeType]?.sessions ?? 'sessions'}`;
  if (daily) return `${label} · ${daily} a day`;
  return label;
}

/** The one big word (or number) on a competition's cover and card, and the line under it. */
export function headline(table: Scored, unit: Unit): { big: string; small: string } {
  const metric = metricOf(table.scoringMethod);
  const daily = formatDaily(table, unit);
  const noun = ACTIVITY_RULES[table.challengeType]?.sessions ?? 'sessions';
  if (metric.target === 'distance' && table.targetDistanceMetres && (metric.aggregate === 'fastest' || metric.aggregate === 'firstTo')) {
    const value = unit === 'km' ? table.targetDistanceMetres / 1000 : table.targetDistanceMetres / 1609.344;
    const label = Number.isInteger(Math.round(value * 10) / 10) ? String(Math.round(value)) : value.toFixed(1);
    const big = `${label}${unit === 'km' ? 'K' : ' MI'}`;
    return metric.aggregate === 'fastest'
      ? { big, small: `fastest ${table.challengeType === 'WALK' ? 'walk' : 'time'} wins` }
      : { big, small: 'first there wins' };
  }
  if (metric.aggregate === 'firstTo') {
    const target = targetText(table, unit);
    return { big: 'First', small: target ? `to ${target}` : 'first there wins' };
  }
  switch (table.scoringMethod) {
    case 'MOST_STEPS': return { big: 'Steps', small: 'most steps wins' };
    case 'MOST_STEPS_ONE_DAY': return { big: 'Big day', small: 'most steps in one day' };
    case 'AVERAGE_DAILY_STEPS': return { big: 'Daily', small: 'best daily step average' };
    case 'LONGEST_STREAK': return { big: 'Streak', small: daily ? `${daily} a day, every day` : 'most days in a row' };
    case 'TARGET_DAYS': return { big: 'Days', small: daily ? `days hitting ${daily}` : 'most target days' };
    case 'MOST_ACTIVE_DAYS': return { big: 'Days', small: 'most active days wins' };
    case 'MOST_SESSIONS': return { big: noun.replace(/^./, (c) => c.toUpperCase()), small: `most ${noun} wins` };
    case 'MOST_TIME': return { big: 'Time', small: 'most active time wins' };
    case 'LONGEST_SINGLE': return { big: 'Longest', small: `longest single ${noun.replace(/s$/, '')}` };
    case 'LONGEST_SESSION': return { big: 'Longest', small: 'longest single session' };
    case 'MOST_ELEVATION': return { big: 'Climb', small: 'most elevation wins' };
    case 'BEST_PACE': return { big: 'Pace', small: 'best average pace' };
    case 'BEST_AVERAGE_SPEED': return { big: 'Speed', small: 'best average speed' };
    case 'PACE_CONSISTENCY':
    case 'DAILY_CONSISTENCY':
    case 'WEEKLY_CONSISTENCY': return { big: 'Steady', small: 'most consistent wins' };
    default: return { big: 'Farthest', small: `most ${unit} wins` };
  }
}

function list(words: string[]) {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/** Plain-language scoring rules for the competition page: how it's won, what counts, ties and data. */
export function rulesLines(table: Scored, unit: Unit): string[] {
  const metric = metricOf(table.scoringMethod);
  const option = scoringOption(table.challengeType, table.scoringMethod);
  const engine = (table.rulesVersion ?? 2) >= 2;
  const kinds = eligibleKinds(table.challengeType, table.eligibleActivities).map((kind) => ({ run: 'runs', walk: 'walks', cycle: 'rides' })[kind]);
  const target = targetText(table, unit);
  const daily = formatDaily(table, unit);
  const lines: string[] = [];

  lines.push(`${winsLabel(table, unit)}. ${option?.summary ?? 'The best verified score wins.'}`);
  if (metric.aggregate === 'fastest' && table.targetDistanceMetres) {
    lines.push(`Your fastest ${target} inside any one ${ACTIVITY_RULES[table.challengeType]?.sessions.replace(/s$/, '') ?? 'activity'} counts, timed from its GPS track on the clock (pauses included). A longer ${table.challengeType === 'CYCLING' ? 'ride' : 'run'} counts its best ${target} stretch.`);
  }
  if (metric.aggregate === 'firstTo' && target) lines.push(`Whoever reaches ${target} first wins. If nobody does, the closest wins.`);
  if (metric.display === 'pace' || metric.display === 'speed' || metric.measure === 'time' && metric.aggregate !== 'fastest') lines.push('Time is moving time, so stops and pauses don’t count against you.');
  if (metric.aggregate === 'dailyVariation') lines.push(`Ranked on how evenly your days spread, over every day so far.${daily ? ` You need an average of at least ${daily} a day to be ranked.` : ''}`);
  if (metric.aggregate === 'weeklyVariation') lines.push('Ranked on how evenly your weekly time spreads across full weeks.');
  if (metric.aggregate === 'paceVariation') lines.push(`Ranked on how steady your pace is across ${kinds.join(' and ')} of at least ${target}. You need at least ${Math.max(2, table.minSessions ?? 3)} to be ranked.`);

  lines.push(`Verified ${list(kinds)} count if they start after the competition starts and finish before it ends, whenever you joined. Flagged activities count only after a reviewer approves them.`);
  if (table.minActivityMetres || table.minActivitySeconds) {
    const parts = [table.minActivityMetres ? formatDistance(table.minActivityMetres, unit) : null, table.minActivitySeconds ? formatAmountOfTime(table.minActivitySeconds) : null].filter(Boolean);
    lines.push(`An activity must be at least ${parts.join(' and ')} to count.`);
  }
  if (table.minSessions && metric.aggregate !== 'paceVariation') lines.push(`You need at least ${table.minSessions} qualifying ${sessionNoun(table, table.minSessions)} to rank above anyone who hasn’t reached that.`);
  if (engine) lines.push('Each outing counts once. If the same activity arrives twice (say from Jump and Strava), only one copy counts.');
  if (engine && (metric.measure === 'steps' || dailyMeasure(table.challengeType, table.scoringMethod) === 'steps')) {
    lines.push('Only measured steps count: your phone’s motion sensor in Jump, or cadence from a watch synced through Strava. Steps estimated from GPS distance don’t.');
  }
  if (metric.measure === 'elevation') lines.push('Elevation comes from Strava. Activities recorded in Jump don’t carry elevation yet, so they add none.');
  if (metric.daily || metric.aggregate === 'dailyAverage' || metric.aggregate === 'bestDay' || metric.aggregate === 'activeDays' || metric.aggregate === 'dailyVariation') {
    lines.push(`Days follow the calendar in ${(table.timeZone ?? 'Africa/Lagos').replace(/_/g, ' ')}.`);
  }
  if (metric.measure === 'distance' && table.distanceCapMetres) lines.push(`Each activity counts up to ${formatDistance(table.distanceCapMetres, unit)}.`);
  lines.push(engine ? `Ties: ${metric.tieBreak.charAt(0).toLowerCase()}${metric.tieBreak.slice(1)}` : 'Ties go to whoever joined first.');
  return lines;
}
