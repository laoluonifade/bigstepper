import type { LeagueDivision, LeagueMembership } from '../lib/types';
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
