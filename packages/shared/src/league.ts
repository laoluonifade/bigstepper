import type { LeagueDivision, LeagueMembership, LeagueRules } from './types';

/** Rank within the runner's own division, using the API's ordering (distance desc). */
export function divisionRank(standings: LeagueMembership[], membership: LeagueMembership) {
  const peers = standings.filter((row) => row.divisionId === membership.divisionId);
  const index = peers.findIndex((row) => row.userId === membership.userId);
  return { rank: index >= 0 ? index + 1 : null, size: peers.length, peers };
}

export type LeagueZone = 'up' | 'down' | 'safe';

/**
 * Where a runner would land if the season ended now. Mirrors the API's end-of-season rule:
 * top share (rounded up) with any verified distance moves up; bottom share (rounded down) and
 * anyone with no verified distance move down; never past the top or bottom division.
 */
export function leagueZone(
  rank: number,
  size: number,
  metres: number,
  division: LeagueDivision | undefined,
  divisions: LeagueDivision[],
  rules: LeagueRules | undefined,
): LeagueZone {
  if (!division || !rules || divisions.length === 0) return 'safe';
  const levels = divisions.map((item) => item.level);
  const top = Math.max(...levels);
  const bottom = Math.min(...levels);
  const promote = Math.ceil(size * (rules.promotePercent / 100));
  const relegate = Math.floor(size * (rules.relegatePercent / 100));
  if (division.level < top && metres > 0 && rank <= promote) return 'up';
  if (division.level > bottom && (metres === 0 || rank > size - relegate)) return 'down';
  return 'safe';
}

export const ZONE_LABEL: Record<LeagueZone, string> = {
  up: 'Promotion zone',
  down: 'Relegation zone',
  safe: 'Holding steady',
};

export const OUTCOME_LABEL: Record<NonNullable<LeagueMembership['outcome']>, string> = {
  PROMOTED: 'Promoted',
  RELEGATED: 'Moved down',
  STAYED: 'Stayed',
};

/** One-line rule text, from the API's numbers. */
export function rulesLine(rules: LeagueRules | undefined) {
  if (!rules) return '';
  return `When the season ends, the top ${rules.promotePercent}% of each division move up and the bottom ${rules.relegatePercent}% move down. Runners with no verified distance move down too.`;
}
