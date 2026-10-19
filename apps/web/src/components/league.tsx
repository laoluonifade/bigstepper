import type { LeagueDivision, LeagueMembership, LeagueRules } from '../lib/types';
import { cx } from './ui';

const DIVISION_STYLE: Record<string, string> = {
  bronze: 'bg-medal-bronze text-ink',
  silver: 'bg-medal-silver text-ink',
  gold: 'bg-medal-gold text-ink',
  platinum: 'bg-[#CFE3EA] text-ink',
  elite: 'bg-ink text-volt',
};

export function DivisionBadge({ division, size = 'md' }: { division: LeagueDivision | undefined; size?: 'md' | 'lg' }) {
  const name = division?.name ?? 'Division';
  return (
    <span
      className={cx(
        'wide inline-flex shrink-0 items-center justify-center rounded-sm border-2 border-ink font-black uppercase',
        DIVISION_STYLE[name.toLowerCase()] ?? 'bg-card text-ink',
        size === 'lg' ? 'h-16 w-16 text-[26px]' : 'h-10 w-10 text-[15px]',
      )}
      aria-label={`${name} division`}
    >
      {name.slice(0, 1)}
    </span>
  );
}

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

export function ZoneTag({ zone }: { zone: LeagueZone }) {
  return (
    <span
      className={cx(
        'tag',
        zone === 'up' && 'border-ok/60 bg-ok-wash text-ok',
        zone === 'down' && 'border-bad/50 bg-bad-wash text-bad',
        zone === 'safe' && 'border-line bg-card text-ink-2',
      )}
    >
      {ZONE_LABEL[zone]}
    </span>
  );
}

/** One-line rule text, from the API's numbers. */
export function rulesLine(rules: LeagueRules | undefined) {
  if (!rules) return '';
  return `When the season ends, the top ${rules.promotePercent}% of each division move up and the bottom ${rules.relegatePercent}% move down. Runners with no verified distance move down too.`;
}
