import { METRICS, ScoringMethod } from './competition-rules';

export interface ScoredActivity {
  registrationId: string;
  activityId: string;
  startedAt: Date;
  finishedAt: Date;
  day: string;
  distance: number;
  steps: number;
  movingSeconds: number;
  elapsedSeconds: number;
  elevation: number | null;
  completionSeconds: number | null;
}

export interface ScoringRules {
  method: ScoringMethod;
  rulesVersion: number;
  targetDistanceMetres: number | null;
  targetSteps: number | null;
  targetSeconds: number | null;
  targetSessions: number | null;
  dailyTarget: number | null;
  dailyMeasure: 'distance' | 'steps' | 'time' | null;
  minSessions: number | null;
  windowDays: string[];
}

export interface EntrantScore {
  score: number | null;
  rankScore: number | null;
  targetReachedAt: Date | null;
  scoredAt: Date | null;
  qualified: boolean;
}

export const RANK_ORDER = `r."qualified" DESC, r."targetReachedAt" ASC NULLS LAST, r."rankScore" DESC NULLS LAST, r."scoredAt" ASC NULLS LAST, r."joinedAt" ASC, r."userId" ASC`;

export function scoreEntrants(rules: ScoringRules, registrationIds: string[], activities: ScoredActivity[]): Map<string, EntrantScore> {
  const byEntrant = new Map<string, ScoredActivity[]>(registrationIds.map((id) => [id, []]));
  for (const activity of activities) byEntrant.get(activity.registrationId)?.push(activity);
  const out = new Map<string, EntrantScore>();
  for (const [id, own] of byEntrant) {
    const counted = rules.rulesVersion >= 2 ? withoutOverlaps(own) : [...own].sort(chronological);
    out.set(id, scoreOne(rules, counted));
  }
  return out;
}

function chronological(a: ScoredActivity, b: ScoredActivity) {
  return a.finishedAt.getTime() - b.finishedAt.getTime() || a.activityId.localeCompare(b.activityId);
}

function withoutOverlaps(activities: ScoredActivity[]) {
  const byStart = [...activities].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime() || a.activityId.localeCompare(b.activityId));
  const kept: ScoredActivity[] = [];
  let busyUntil = -Infinity;
  for (const activity of byStart) {
    if (activity.startedAt.getTime() < busyUntil) continue;
    kept.push(activity);
    busyUntil = activity.finishedAt.getTime();
  }
  return kept.sort(chronological);
}

function amount(activity: ScoredActivity, measure: 'distance' | 'steps' | 'time' | 'elevation' | 'sessions') {
  switch (measure) {
    case 'distance': return activity.distance;
    case 'steps': return activity.steps;
    case 'time': return activity.movingSeconds;
    case 'elevation': return activity.elevation ?? 0;
    case 'sessions': return 1;
  }
}

function scoreOne(rules: ScoringRules, activities: ScoredActivity[]): EntrantScore {
  const metric = METRICS[rules.method];
  const qualifiedBySessions = activities.length >= (rules.minSessions ?? 0);
  const result = (score: number | null, scoredAt: Date | null, extra: Partial<EntrantScore> = {}): EntrantScore => {
    const rounded = score === null ? null : Math.round(score * 100) / 100;
    return {
      score: rounded,
      rankScore: rounded === null ? null : metric.better === 'higher' ? rounded : -rounded,
      targetReachedAt: null,
      scoredAt: rules.rulesVersion >= 2 ? scoredAt : null,
      qualified: qualifiedBySessions,
      ...extra,
    };
  };
  const last = activities.at(-1)?.finishedAt ?? null;

  switch (metric.aggregate) {
    case 'total': {
      let total = 0;
      let at: Date | null = null;
      for (const activity of activities) {
        const value = amount(activity, metric.measure);
        if (value > 0) { total += value; at = activity.finishedAt; }
      }
      return result(total, at);
    }
    case 'firstTo': {
      const target = targetFor(rules, metric.target!);
      let total = 0;
      let reached: Date | null = null;
      for (const activity of activities) {
        total += amount(activity, metric.measure);
        if (reached === null && target !== null && total >= target) reached = activity.finishedAt;
      }
      return result(total, reached ?? last, { targetReachedAt: reached });
    }
    case 'fastest': {
      let best: { seconds: number; at: Date } | null = null;
      for (const activity of activities) {
        if (activity.completionSeconds === null || activity.completionSeconds <= 0) continue;
        if (!best || activity.completionSeconds < best.seconds) best = { seconds: activity.completionSeconds, at: activity.finishedAt };
      }
      return result(best?.seconds ?? null, best?.at ?? null);
    }
    case 'longest': {
      let best: { value: number; at: Date } | null = null;
      for (const activity of activities) {
        const value = amount(activity, metric.measure);
        if (!best || value > best.value) best = { value, at: activity.finishedAt };
      }
      return result(best?.value ?? 0, best?.at ?? null);
    }
    case 'averagePace':
    case 'averageSpeed': {
      const counted = activities.filter((activity) => activity.distance >= (rules.targetDistanceMetres ?? 0) && activity.movingSeconds > 0);
      const metres = counted.reduce((sum, activity) => sum + activity.distance, 0);
      const seconds = counted.reduce((sum, activity) => sum + activity.movingSeconds, 0);
      if (!metres || !seconds) return result(null, null, { qualified: false });
      const score = metric.aggregate === 'averagePace' ? seconds / (metres / 1000) : (metres / 1000) / (seconds / 3600);
      return result(score, counted.at(-1)!.finishedAt, { qualified: counted.length >= (rules.minSessions ?? 1) });
    }
    case 'paceVariation': {
      const counted = activities.filter((activity) => activity.distance >= (rules.targetDistanceMetres ?? 0) && activity.movingSeconds > 0);
      const needed = Math.max(2, rules.minSessions ?? 3);
      if (counted.length < needed) return result(null, null, { qualified: false });
      const paces = counted.map((activity) => activity.movingSeconds / (activity.distance / 1000));
      return result(variation(paces), counted.at(-1)!.finishedAt, { qualified: true });
    }
    default:
      return scoreDays(rules, metric.aggregate, metric.measure, activities, result);
  }
}

function targetFor(rules: ScoringRules, target: 'distance' | 'steps' | 'time' | 'sessions') {
  return target === 'distance' ? rules.targetDistanceMetres : target === 'steps' ? rules.targetSteps : target === 'time' ? rules.targetSeconds : rules.targetSessions;
}

function scoreDays(
  rules: ScoringRules,
  aggregate: string,
  measure: 'distance' | 'steps' | 'time' | 'elevation' | 'sessions',
  activities: ScoredActivity[],
  result: (score: number | null, scoredAt: Date | null, extra?: Partial<EntrantScore>) => EntrantScore,
): EntrantScore {
  const dayMeasure = rules.dailyMeasure ?? (measure === 'sessions' || measure === 'elevation' ? 'distance' : measure);
  const days = new Map<string, { total: number; sessions: number; at: Date }>();
  for (const activity of activities) {
    const day = days.get(activity.day) ?? { total: 0, sessions: 0, at: activity.finishedAt };
    day.total += amount(activity, dayMeasure);
    day.sessions += 1;
    day.at = activity.finishedAt;
    days.set(activity.day, day);
  }
  const meets = (day: { total: number; sessions: number } | undefined) =>
    Boolean(day && day.sessions > 0 && (rules.dailyTarget ? day.total >= rules.dailyTarget : true));
  const sortedDays = [...days.keys()].sort();
  const lastAt = (keys: string[]) => keys.length ? days.get(keys.at(-1)!)!.at : null;

  switch (aggregate) {
    case 'activeDays':
    case 'targetDays': {
      const hit = sortedDays.filter((key) => meets(days.get(key)));
      return result(hit.length, lastAt(hit));
    }
    case 'streak': {
      let best = 0;
      let bestEnd: string | null = null;
      let run = 0;
      let previous: string | null = null;
      for (const key of sortedDays) {
        if (!meets(days.get(key))) { run = 0; previous = null; continue; }
        run = previous !== null && nextDay(previous) === key ? run + 1 : 1;
        previous = key;
        if (run > best) { best = run; bestEnd = key; }
      }
      return result(best, bestEnd ? days.get(bestEnd)!.at : null);
    }
    case 'bestDay': {
      let best: { total: number; at: Date } | null = null;
      for (const key of sortedDays) {
        const day = days.get(key)!;
        if (!best || day.total > best.total) best = { total: day.total, at: day.at };
      }
      return result(best?.total ?? 0, best?.at ?? null);
    }
    case 'dailyAverage': {
      const total = [...days.values()].reduce((sum, day) => sum + day.total, 0);
      return result(total / Math.max(1, rules.windowDays.length), lastAt(sortedDays));
    }
    case 'dailyVariation': {
      const window = rules.windowDays.length ? rules.windowDays : sortedDays;
      const totals = window.map((key) => days.get(key)?.total ?? 0);
      const average = totals.reduce((sum, value) => sum + value, 0) / Math.max(1, totals.length);
      if (!totals.length || average <= 0 || average < (rules.dailyTarget ?? 0)) return result(null, null, { qualified: false });
      return result(variation(totals), lastAt(sortedDays));
    }
    case 'weeklyVariation': {
      const window = rules.windowDays.length ? rules.windowDays : sortedDays;
      const weeks: number[] = [];
      for (let start = 0; start < window.length; start += 7) {
        const week = window.slice(start, start + 7);
        if (week.length < 7 && weeks.length) break;
        weeks.push(week.reduce((sum, key) => sum + (days.get(key)?.total ?? 0), 0));
      }
      const total = weeks.reduce((sum, value) => sum + value, 0);
      if (!total || activities.length < (rules.minSessions ?? 1)) return result(null, null, { qualified: false });
      return result(weeks.length < 2 ? 0 : variation(weeks), lastAt(sortedDays));
    }
    default:
      throw new Error(`No scoring for ${aggregate}`);
  }
}

function variation(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!mean) return 0;
  const spread = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  return (spread / mean) * 100;
}

export function nextDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string) {
  const days: string[] = [];
  for (let day = start; day <= end && days.length < 3660; day = nextDay(day)) days.push(day);
  return days;
}
