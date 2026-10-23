import { Link } from '@tanstack/react-router';
import { ReactNode, useId } from 'react';
import { formatDistanceNumber, ordinal } from '../lib/format';
import type { Unit } from '../lib/types';
import type { AvatarStyle } from '../lib/types';
import { Avatar, cx, VerifiedTick } from './ui';

export interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  avatarUrl?: string | null;
  avatarStyle?: AvatarStyle;
  /** Links the name to their profile when known. */
  username?: string | null;
  metres: number;
  score?: number | null;
  host?: boolean;
  /** Blue tick from a Jump admin. */
  verified?: boolean;
  /** A quieter second line under the name, e.g. the km behind a steps score. */
  detail?: string | null;
}

/** Podium metals: the winner gets platinum and a crown, then gold and bronze. */
const PODIUM: Record<number, { light: string; base: string }> = {
  1: { light: '#F2FBFE', base: '#7FB6CA' },
  2: { light: '#FFE58A', base: '#D7981C' },
  3: { light: '#F2B47E', base: '#B4622A' },
};

export function RankBadge({ rank, size = 'md' }: { rank: number; size?: 'md' | 'lg' }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const metal = PODIUM[rank];
  const px = size === 'lg' ? 48 : 34;
  if (!metal) {
    return (
      <span className={cx('score num inline-flex shrink-0 items-center justify-center rounded-sm text-ink', size === 'lg' ? 'h-12 min-w-12 px-1.5 text-[28px]' : 'h-8 min-w-8 px-1 text-[18px]')}>
        {rank}
      </span>
    );
  }
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: px, height: px }} aria-label={rank === 1 ? '1st, winning' : ordinal(rank)}>
      <svg viewBox="0 0 32 32" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-m`} x1="0" y1="0" x2="0.5" y2="1">
            <stop offset="0" stopColor={metal.light} />
            <stop offset="1" stopColor={metal.base} />
          </linearGradient>
        </defs>
        {rank === 1 ? (
          <path d="M9.5 9.5V2.5l3.3 3L16 .8l3.2 4.7 3.3-3v7z" fill="#E4FF3A" stroke="#121212" strokeWidth="1.4" strokeLinejoin="round" />
        ) : (
          <path d="M10 1h4.5l3 8.5h-4.5zM22 1h-4.5l-3 8.5h4.5z" fill="#121212" />
        )}
        <circle cx="17.2" cy="20.2" r="10.8" fill="#121212" />
        <circle cx="16" cy="19" r="10.8" fill={`url(#${id}-m)`} stroke="#121212" strokeWidth="1.8" />
        <circle cx="16" cy="19" r="7.6" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.1" />
      </svg>
      <span className={cx('score num relative leading-none text-ink', size === 'lg' ? 'text-[21px]' : 'text-[15px]')} style={{ transform: `translateY(${(px * 3) / 32}px)` }}>
        {rank}
      </span>
    </span>
  );
}

export function Leaderboard({
  rows,
  currentUserId,
  unit,
  limit = 50,
  caption,
  empty,
  metricLabel = 'Distance',
  formatScore,
}: {
  rows: LeaderboardRow[];
  currentUserId?: string;
  unit: Unit;
  limit?: number;
  caption?: ReactNode;
  empty?: ReactNode;
  metricLabel?: string;
  formatScore?: (row: LeaderboardRow) => ReactNode;
}) {
  if (rows.length === 0) return <>{empty}</>;

  const meIndex = rows.findIndex((row) => row.userId === currentUserId);
  const visible = rows.slice(0, limit);
  const pinnedMe = meIndex >= limit ? rows[meIndex] : null;

  return (
    <div className="overflow-hidden rounded-md border-[1.5px] border-ink bg-card">
      {caption && <div className="border-b border-line px-4 py-2.5 text-[12px] text-ink-2">{caption}</div>}
      {/* Fixed columns: a long name truncates instead of pushing the score off the edge. */}
      <table className="w-full table-fixed border-collapse text-left">
        <colgroup>
          <col className="w-14" />
          <col />
          <col className="w-[112px]" />
        </colgroup>
        <thead>
          <tr className="border-b-[1.5px] border-ink text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-2">
            <th scope="col" className="py-2 pl-4 font-bold">
              Pos
            </th>
            <th scope="col" className="py-2 font-bold">
              Runner
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-bold">
              {metricLabel}
            </th>
          </tr>
        </thead>
        <tbody className="stagger">
          {visible.map((row) => (
            <Row key={row.userId} row={row} isMe={row.userId === currentUserId} unit={unit} formatScore={formatScore} />
          ))}
          {pinnedMe && (
            <>
              <tr aria-hidden="true">
                <td colSpan={3} className="py-1 text-center text-[11px] tracking-[0.3em] text-ink-3">
                  · · ·
                </td>
              </tr>
              <Row row={pinnedMe} isMe unit={unit} formatScore={formatScore} />
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Row({ row, isMe, unit, formatScore }: { row: LeaderboardRow; isMe: boolean; unit: Unit; formatScore?: (row: LeaderboardRow) => ReactNode }) {
  return (
    <tr className={cx('border-b border-line last:border-b-0', isMe ? 'bg-volt' : 'hover:bg-ink/[0.025]')}>
      <td className="py-2.5 pl-4 align-middle">
        <RankBadge rank={row.rank} />
      </td>
      <td className="min-w-0 py-2.5 pr-2 align-middle">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={row.name} src={row.avatarUrl} avatarStyle={row.avatarStyle} size={30} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">
              {row.username ? (
                <Link to="/runners/$username" params={{ username: row.username }} className="hover:underline hover:underline-offset-4">
                  {row.name}
                </Link>
              ) : (
                row.name
              )}
              {row.verified && <VerifiedTick className="ml-1" />}
              {isMe && <span className="tag ml-2 h-5 border-ink bg-ink px-1.5 text-[9.5px] text-volt">You</span>}
              {row.host && <span className="tag ml-2 h-5 border-line bg-paper px-1.5 text-[9.5px]">Host</span>}
            </p>
            {row.detail && <p className="num truncate text-[12px] text-ink-3">{row.detail}</p>}
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap py-2.5 pr-4 text-right align-middle">
        {formatScore ? formatScore(row) : (
          <><span className="score num text-[20px]">{formatDistanceNumber(row.metres, unit)}</span><span className="ml-1 text-[11px] font-semibold text-ink-2">{unit}</span></>
        )}
      </td>
    </tr>
  );
}
