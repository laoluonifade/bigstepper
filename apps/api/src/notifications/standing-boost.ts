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

/** Cheeky lines for each situation, a different one each day. `{gap}`, `{name}`, `{place}`, `{verb}`, `{others}` fill in. */
const JOKES = {
  chasing: [
    '{gap} behind {name} for {place}. That’s basically a walk to the fridge. Go.',
    '{name} is {gap} ahead and probably feeling themselves. Humble them tonight.',
    'Only {gap} between you and {place}. Your trainers are judging you.',
    '{name} leads you by {gap}. Don’t let them screenshot that leaderboard.',
    '{gap} to catch {name}. One {verb} and the group chat goes quiet.',
  ],
  leading: [
    '{gap} ahead of {name}. They’re lacing up as we speak. Keep the gap.',
    'Top of the board, {gap} clear of {name}. Crowns don’t defend themselves.',
    'You lead {name} by {gap}. Resting is for whoever’s in 2nd.',
    '{gap} ahead of {name}. Lovely view from the top. Don’t get comfortable.',
  ],
  tied: [
    'Dead level with {name}. Whoever moves tonight gets the bragging rights.',
    'You and {name} are tied. Someone has to blink first. Make it them.',
  ],
  alone: [
    'Out in front and nobody else has started. Stretch the lead before they wake up.',
    'You’re leading and the rest are still finding their trainers. Keep it that way.',
  ],
  climbing: [
    'One {verb} tonight could move you up. The sofa will understand.',
    'Someone above you is beatable. One {verb} tonight and we’ll see.',
  ],
  unscored: [
    'Your name’s on the board but your legs aren’t. One {verb} fixes that.',
    '{others} already racing and you’re still warming up. Tonight’s the night.',
    'Joined, then vanished? Classic. One {verb} puts you on the board.',
  ],
};

/** The same line all day for one runner, a different one tomorrow. */
function pick(lines: string[], row: StandingRow, day: string) {
  let hash = 0;
  for (const char of `${row.userId}:${row.tableId}:${day}`) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return lines[Math.abs(hash) % lines.length];
}

const fill = (line: string, values: Record<string, string>) => line.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');

/** The evening push: where they stand, against whom, and a cheeky reason to move tonight. */
export function boostMessage(row: StandingRow, day = new Date().toISOString().slice(0, 10)): Boost {
  const link = `/competitions/${row.code}`;
  const method = row.scoringMethod;
  const others = Math.max(0, row.entrants - 1);
  const values = { verb: noun(row.challengeType), others: `${others} ${others === 1 ? 'other is' : 'others are'}` };
  const say = (kind: keyof typeof JOKES, extra: Record<string, string> = {}) => fill(pick(JOKES[kind], row, day), { ...values, ...extra });
  if (!scored(method, row.score)) return { userId: row.userId, link, title: `${row.title} is on`, body: say('unscored') };
  if (row.rank === 1) {
    const title = `You’re leading ${row.title}`;
    if (row.behindScore === null || !scored(method, row.behindScore)) return { userId: row.userId, link, title, body: say('alone') };
    const name = first(row.behindName);
    if (Number(row.score) === Number(row.behindScore)) return { userId: row.userId, link, title, body: say('tied', { name }) };
    const gap = formatGap(method, row.score!, row.behindScore);
    return { userId: row.userId, link, title, body: gap ? say('leading', { gap, name }) : say('alone') };
  }
  const title = `You’re ${ordinal(row.rank)} in ${row.title}`;
  if (row.aheadScore === null || !scored(method, row.aheadScore)) return { userId: row.userId, link, title, body: say('climbing') };
  const name = first(row.aheadName);
  if (Number(row.score) === Number(row.aheadScore)) return { userId: row.userId, link, title, body: say('tied', { name }) };
  const gap = formatGap(method, row.score!, row.aheadScore);
  return { userId: row.userId, link, title, body: gap ? say('chasing', { gap, name, place: ordinal(row.rank - 1) }) : say('climbing') };
}
