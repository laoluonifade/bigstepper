import { Link } from '@tanstack/react-router';
import { ReactNode } from 'react';
import { formatDistance, formatDistanceNumber, ordinal } from '../lib/format';
import type { Unit } from '../lib/types';
import { Avatar, cx } from './ui';

export interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  avatarUrl?: string | null;
  /** Links the name to their profile when known. */
  username?: string | null;
  metres: number;
  score?: number | null;
}

const medal: Record<number, string> = {
  1: 'bg-medal-gold',
  2: 'bg-medal-silver',
  3: 'bg-medal-bronze',
};

export function RankBadge({ rank, size = 'md' }: { rank: number; size?: 'md' | 'lg' }) {
  const isPodium = rank <= 3;
  return (
    <span
      className={cx(
        'score num inline-flex shrink-0 items-center justify-center rounded-sm',
        size === 'lg' ? 'h-12 min-w-12 px-1.5 text-[28px]' : 'h-8 min-w-8 px-1 text-[18px]',
        isPodium ? cx(medal[rank], 'text-ink') : 'text-ink',
      )}
    >
      {rank}
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
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b-[1.5px] border-ink text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-2">
            <th scope="col" className="w-14 py-2 pl-4 font-bold">
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
          {visible.map((row, index) => (
            <Row key={row.userId} row={row} above={visible[index - 1]} isMe={row.userId === currentUserId} unit={unit} formatScore={formatScore} />
          ))}
          {pinnedMe && (
            <>
              <tr aria-hidden="true">
                <td colSpan={3} className="py-1 text-center text-[11px] tracking-[0.3em] text-ink-3">
                  · · ·
                </td>
              </tr>
              <Row row={pinnedMe} above={rows[meIndex - 1]} isMe unit={unit} formatScore={formatScore} />
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Row({ row, above, isMe, unit, formatScore }: { row: LeaderboardRow; above?: LeaderboardRow; isMe: boolean; unit: Unit; formatScore?: (row: LeaderboardRow) => ReactNode }) {
  const gap = !formatScore && isMe && above ? above.metres - row.metres : null;
  return (
    <tr className={cx('border-b border-line last:border-b-0', isMe ? 'bg-volt' : 'hover:bg-ink/[0.025]')}>
      <td className="py-2.5 pl-4 align-middle">
        <RankBadge rank={row.rank} />
      </td>
      <td className="min-w-0 py-2.5 pr-2 align-middle">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={row.name} src={row.avatarUrl} highlight={isMe} size={30} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">
              {row.username ? (
                <Link to="/runners/$username" params={{ username: row.username }} className="hover:underline hover:underline-offset-4">
                  {row.name}
                </Link>
              ) : (
                row.name
              )}
              {isMe && <span className="tag ml-2 h-5 border-ink bg-ink px-1.5 text-[9.5px] text-volt">You</span>}
            </p>
            {gap !== null && (
              <p className="text-[12px] text-ink/70">
                {gap > 0
                  ? `${formatDistance(gap, unit)} to take ${ordinal(above!.rank)}`
                  : `Level with ${ordinal(above!.rank)} . Next verified run decides it`}
              </p>
            )}
            {isMe && row.rank === 1 && <p className="text-[12px] text-ink/70">You’re leading. Hold it.</p>}
          </div>
        </div>
      </td>
      <td className="py-2.5 pr-4 text-right align-middle">
        {formatScore ? formatScore(row) : (
          <><span className="score num text-[20px]">{formatDistanceNumber(row.metres, unit)}</span><span className="ml-1 text-[11px] font-semibold text-ink-2">{unit}</span></>
        )}
      </td>
    </tr>
  );
}
