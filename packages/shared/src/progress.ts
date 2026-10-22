/**
 * Gamification derived purely from the runner's own activity history.
 * Only VERIFIED distance counts toward milestones and weekly totals, mirroring
 * how the API credits competitions.
 */
import type { Activity, PublicStats } from './types';

const DAY = 24 * 60 * 60 * 1000;

export function isVerified(activity: Activity) {
  return activity.verificationStatus === 'VERIFIED';
}

/**
 * Distance that counts once verified: GPS, or steps × stride when larger (indoors) — the same
 * figure leagues credit and activity rows show. Nothing before verification.
 */
export function creditedMetres(activity: Activity) {
  return isVerified(activity) ? Math.max(activity.validatedDistanceMetres, activity.stepDistanceMetres ?? 0) : 0;
}

export type ActivityKind = 'all' | 'run' | 'walk';

export function ofKind(activities: Activity[], kind: ActivityKind) {
  return kind === 'all' ? activities : activities.filter((activity) => activity.activityType === kind);
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Monday 00:00 local time of the week containing `date`. */
export function startOfWeek(date: Date) {
  const day = startOfDay(date);
  const offset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - offset);
  return day;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export interface WeekDay {
  date: Date;
  label: string;
  metres: number;
  isToday: boolean;
  isFuture: boolean;
}

export interface WeekSummary {
  days: WeekDay[];
  verifiedMetres: number;
  pendingMetres: number;
  runs: number;
}

export function summariseWeek(activities: Activity[], now = new Date()): WeekSummary {
  const start = startOfWeek(now);
  const todayKey = dayKey(now);
  const days: WeekDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      label: date.toLocaleDateString('en-GB', { weekday: 'narrow' }),
      metres: 0,
      isToday: dayKey(date) === todayKey,
      isFuture: date.getTime() > now.getTime() && dayKey(date) !== todayKey,
    };
  });
  const byKey = new Map(days.map((day) => [dayKey(day.date), day]));
  let pendingMetres = 0;
  let runs = 0;
  for (const activity of activities) {
    const started = new Date(activity.startedAt);
    if (started < start) continue;
    const day = byKey.get(dayKey(started));
    if (!day) continue;
    if (activity.verificationStatus !== 'REJECTED') runs += 1;
    if (isVerified(activity)) day.metres += creditedMetres(activity);
    else if (activity.verificationStatus === 'PENDING_VERIFICATION') pendingMetres += activity.recordedDistanceMetres;
  }
  return {
    days,
    verifiedMetres: days.reduce((total, day) => total + day.metres, 0),
    pendingMetres,
    runs,
  };
}

/**
 * A day counts toward a streak when it has at least one run that hasn't been rejected.
 * The current streak survives until the end of today, so a runner who ran yesterday
 * still sees their streak alive this morning.
 */
export function computeStreaks(activities: Activity[], now = new Date()) {
  const days = new Set(
    activities
      .filter((activity) => activity.verificationStatus !== 'REJECTED' && Math.max(activity.recordedDistanceMetres, creditedMetres(activity)) >= 500)
      .map((activity) => startOfDay(new Date(activity.startedAt)).getTime()),
  );
  const sorted = [...days].sort((a, b) => a - b);

  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of sorted) {
    run = previous !== null && Math.round((day - previous) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }

  const today = startOfDay(now).getTime();
  let cursor = days.has(today) ? today : today - DAY;
  let current = 0;
  while (days.has(cursor)) {
    current += 1;
    cursor = startOfDay(new Date(cursor - DAY / 2)).getTime();
  }
  return { current, best, ranToday: days.has(today) };
}

export interface Milestone {
  id: string;
  mark: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  earned: boolean;
  kind: 'distance' | 'single' | 'streak' | 'count';
}

export function computeMilestones(activities: Activity[], now = new Date()): Milestone[] {
  const verified = activities.filter(isVerified);
  const verifiedRuns = verified.filter((activity) => activity.activityType === 'run');
  const total = verified.reduce((sum, activity) => sum + creditedMetres(activity), 0);
  const longest = verifiedRuns.reduce((max, activity) => Math.max(max, creditedMetres(activity)), 0);
  const { best } = computeStreaks(verifiedRuns, now);

  const make = (
    id: string,
    mark: string,
    title: string,
    description: string,
    kind: Milestone['kind'],
    progress: number,
    target: number,
  ): Milestone => ({ id, mark, title, description, kind, progress: Math.min(progress, target), target, earned: progress >= target });

  return [
    make('first', '01', 'First count', 'Log your first verified run', 'count', verifiedRuns.length, 1),
    make('5k', '5K', 'Five', 'A single verified run of 5 km', 'single', longest, 5000),
    make('10k', '10K', 'Ten', 'A single verified run of 10 km', 'single', longest, 10000),
    make('half', '21K', 'Half', 'A single verified run of 21.1 km', 'single', longest, 21097),
    make('streak3', '3D', 'Three-peat', 'Run three days in a row', 'streak', best, 3),
    make('streak7', '7D', 'Full week', 'Run seven days in a row', 'streak', best, 7),
    make('total50', '50', 'Fifty club', '50 km of verified distance', 'distance', total, 50000),
    make('total100', '100', 'Century', '100 km of verified distance', 'distance', total, 100000),
    make('total500', '500', 'Long haul', '500 km of verified distance', 'distance', total, 500000),
  ];
}

/** The unearned milestone the runner is closest to finishing. */
export function nextMilestone(milestones: Milestone[]): Milestone | null {
  return (
    milestones
      .filter((milestone) => !milestone.earned)
      .sort((a, b) => b.progress / b.target - a.progress / a.target)[0] ?? null
  );
}

export function lifetimeStats(activities: Activity[]) {
  const verified = activities.filter(isVerified);
  return {
    verifiedRuns: verified.length,
    totalMetres: verified.reduce((sum, activity) => sum + creditedMetres(activity), 0),
    longestMetres: verified.reduce((max, activity) => Math.max(max, creditedMetres(activity)), 0),
    movingSeconds: verified.reduce((sum, activity) => sum + activity.movingSeconds, 0),
  };
}

/** The same totals a public profile shows, from the runner's own history. */
export function profileStats(activities: Activity[], now = new Date()): PublicStats {
  const verified = activities.filter(isVerified);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sum = (list: Activity[]) => list.reduce((total, activity) => total + creditedMetres(activity), 0);
  const runs = verified.filter((activity) => activity.activityType === 'run');
  const walks = verified.filter((activity) => activity.activityType === 'walk');
  const cycles = verified.filter((activity) => activity.activityType === 'cycle');
  return {
    totalMetres: sum(verified),
    activities: verified.length,
    runs: runs.length,
    walks: walks.length,
    cycles: cycles.length,
    runMetres: sum(runs),
    walkMetres: sum(walks),
    cycleMetres: sum(cycles),
    longestMetres: verified.reduce((max, activity) => Math.max(max, creditedMetres(activity)), 0),
    movingSeconds: verified.reduce((total, activity) => total + activity.movingSeconds, 0),
    monthMetres: sum(verified.filter((activity) => new Date(activity.startedAt) >= monthStart)),
  };
}
