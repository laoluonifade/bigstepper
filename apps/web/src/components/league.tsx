import type { LeagueDivision, LeagueMembership, LeagueRules } from '../lib/types';
import { useId } from 'react';
import { cx } from './ui';

/** Metal for each division: highlight, base and the emblem's ink. Unknown names fall back to bronze. */
const DIVISION_METAL: Record<string, { light: string; base: string; mark: string }> = {
  bronze: { light: '#F2B47E', base: '#B4622A', mark: '#121212' },
  silver: { light: '#F4F5F2', base: '#A3A6A0', mark: '#121212' },
  gold: { light: '#FFE58A', base: '#D7981C', mark: '#121212' },
  platinum: { light: '#EEF9FC', base: '#86BCCF', mark: '#121212' },
  elite: { light: '#3A3A3A', base: '#121212', mark: '#E4FF3A' },
};

const SHIELD = 'M24 3 43 9.5V27c0 12.5-8 20.5-19 25.5C13 47.5 5 39.5 5 27V9.5z';

/** Bronze to Gold earn a chevron per level; Platinum gets a gem; Elite a crown. */
function DivisionEmblem({ level, name, colour }: { level: number; name: string; colour: string }) {
  const key = name.toLowerCase();
  if (key === 'elite' || level >= 5) {
    return <path d="M14 34V20.5l5.5 5L24 17l4.5 8.5 5.5-5V34z" fill={colour} stroke={colour} strokeWidth="1.5" strokeLinejoin="round" />;
  }
  if (key === 'platinum' || level === 4) {
    return (
      <g stroke={colour} strokeWidth="2.2" strokeLinejoin="round" fill="none">
        <path d="M17 21h14l4 5-11 12-11-12z" />
        <path d="M13 26h22M21 21l-2 5 5 12 5-12-2-5" strokeWidth="1.6" />
      </g>
    );
  }
  const count = Math.min(3, Math.max(1, level));
  const top = 27 - (count - 1) * 3.5;
  return (
    <g stroke={colour} strokeWidth="3.4" strokeLinecap="square" strokeLinejoin="miter" fill="none">
      {Array.from({ length: count }, (_, index) => (
        <path key={index} d={`M15 ${top + index * 7 + 2}l9-6 9 6`} />
      ))}
    </g>
  );
}

export function DivisionBadge({ division, size = 'md' }: { division: LeagueDivision | undefined; size?: 'md' | 'lg' }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const name = division?.name ?? 'Division';
  const metal = DIVISION_METAL[name.toLowerCase()] ?? DIVISION_METAL.bronze;
  const width = size === 'lg' ? 56 : 36;
  return (
    <svg
      width={width}
      height={width * (58 / 50)}
      viewBox="0 0 50 58"
      className="shrink-0"
      role="img"
      aria-label={`${name} division`}
    >
      <defs>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={metal.light} />
          <stop offset="1" stopColor={metal.base} />
        </linearGradient>
      </defs>
      <path d={SHIELD} transform="translate(2.5 2.5)" fill="#121212" />
      <path d={SHIELD} fill={`url(#${id}-metal)`} stroke="#121212" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M24 8.5 38.5 13.5V27c0 9.5-5.8 16-14.5 20.3" fill="none" stroke="#fff" strokeOpacity={name.toLowerCase() === 'elite' ? 0.18 : 0.55} strokeWidth="1.6" strokeLinecap="round" />
      <DivisionEmblem level={division?.level ?? 1} name={name} colour={metal.mark} />
    </svg>
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
