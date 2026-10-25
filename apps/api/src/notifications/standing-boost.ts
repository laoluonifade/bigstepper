import { METRICS, ScoringMethod } from '../tables/competition-rules';

/** One competition a runner is in, with the runners either side of them. */
export interface StandingRow {
  userId: string;
  tableId: string;
  code: string;
  title: string;
  scoringMethod: string;
  challengeType: string;
  rank: number;
  entrants: number;
  score: number | null;
  aheadScore: number | null;
  aheadName: string | null;
  behindScore: number | null;
  behindName: string | null;
}

export interface Boost { userId: string; title: string; body: string; link: string }

const metric = (method: string) => METRICS[method as ScoringMethod];
const lowerIsBetter = (method: string) => metric(method)?.better === 'lower';
const first = (name: string | null) => (name ?? 'someone').trim().split(/\s+/)[0];
const noun = (type: string) => ({ RUN: 'run', WALK: 'walk', CYCLING: 'ride' } as Record<string, string>)[type] ?? 'activity';
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** Whether a board score means they've actually scored (0 km hasn't; a fastest time always has). */
export function scored(method: string, score: number | null) {
  if (score === null || score === undefined) return false;
  return lowerIsBetter(method) ? true : Number(score) > 0;
}

/**
 * The difference between two scores in the board's own unit ("0.40 km", "1,200 steps", "2 days",
 * "42s"), or null where a gap doesn't read naturally (pace, speed, spread).
 */
export function formatGap(method: string, a: number, b: number): string | null {
  const gap = Math.abs(Number(a) - Number(b));
  switch (metric(method)?.display) {
    case 'distance': return `${(gap / 1000).toFixed(2)} km`;
    case 'steps': return `${Math.round(gap).toLocaleString('en-GB')} steps`;
    case 'sessions': return `${Math.round(gap)} ${Math.round(gap) === 1 ? 'session' : 'sessions'}`;
    case 'days': return `${Math.round(gap)} ${Math.round(gap) === 1 ? 'day' : 'days'}`;
    case 'elevation': return `${Math.round(gap).toLocaleString('en-GB')} m`;
    case 'duration': {
      const seconds = Math.round(gap);
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return h ? `${h}h ${m}m` : m ? `${m}m ${seconds % 60}s` : `${seconds}s`;
    }
    default: return null;
  }
}

/** How close the race is for them, lower = more worth a nudge. */
function urgency(row: StandingRow) {
  const mine = row.score;
  if (!scored(row.scoringMethod, mine)) return 3;
  const rival = row.rank > 1 ? row.aheadScore : row.behindScore;
  if (rival === null || !scored(row.scoringMethod, rival)) return row.rank === 1 ? 2.9 : 3.5;
  const gap = Math.abs(Number(mine) - Number(rival)) / Math.max(Math.abs(Number(rival)), Math.abs(Number(mine)), 1);
  // Chasing someone close beats defending a lead; both beat everything else.
  return (row.rank > 1 ? 0 : 1) + Math.min(0.99, gap);
}

/** The one competition to tell each runner about today: the tightest race they're in. */
export function pickBoosts(rows: StandingRow[]): StandingRow[] {
  const best = new Map<string, StandingRow>();
  for (const row of rows) {
    const current = best.get(row.userId);
    if (!current || urgency(row) < urgency(current)) best.set(row.userId, row);
  }
  return [...best.values()];
}

/** The push: where they stand, against whom, and a reason to move today. */
export function boostMessage(row: StandingRow): Boost {
  const link = `/competitions/${row.code}`;
  const verb = noun(row.challengeType);
  const method = row.scoringMethod;
  if (!scored(method, row.score)) {
    const others = Math.max(0, row.entrants - 1);
    return { userId: row.userId, link, title: `${row.title} is on`, body: `Your first ${verb} puts you on the board.${others ? ` ${others} ${others === 1 ? 'other is' : 'others are'} already racing.` : ''}` };
  }
  if (row.rank === 1) {
    if (row.behindScore === null || !scored(method, row.behindScore)) {
      return { userId: row.userId, link, title: `You’re leading ${row.title}`, body: 'Out in front. Keep it that way today.' };
    }
    const gap = Number(row.score) === Number(row.behindScore) ? null : formatGap(method, row.score!, row.behindScore);
    return {
      userId: row.userId, link, title: `You’re leading ${row.title}`,
      body: Number(row.score) === Number(row.behindScore) ? `Level with ${first(row.behindName)}. One more ${verb} takes it.`
        : gap ? `${gap} ahead of ${first(row.behindName)}. Keep the gap today.` : `${first(row.behindName)} is right behind you. Keep moving.`,
    };
  }
  const title = `You’re ${ordinal(row.rank)} in ${row.title}`;
  if (row.aheadScore === null || !scored(method, row.aheadScore)) {
    return { userId: row.userId, link, title, body: `One ${verb} today could move you up.` };
  }
  if (Number(row.score) === Number(row.aheadScore)) {
    return { userId: row.userId, link, title, body: `Level with ${first(row.aheadName)}. One ${verb} breaks the tie.` };
  }
  const gap = formatGap(method, row.score!, row.aheadScore);
  return {
    userId: row.userId, link, title,
    body: gap ? `${gap} behind ${first(row.aheadName)} for ${ordinal(row.rank - 1)}. One ${verb} could change that.` : `${first(row.aheadName)} is just ahead in ${ordinal(row.rank - 1)}. Go get them.`,
  };
}
