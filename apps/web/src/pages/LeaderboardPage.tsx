import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { SectionHead } from '../components/CompeteHome';
import { CompeteSubNav } from './Competitions';
import { ChevronRightIcon } from '../components/icons';
import { Avatar, cx, ErrorNotice, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { formatDistance } from '../lib/format';
import { useUnit } from '../lib/queries';
import type { Unit } from '../lib/types';

type BoardActivity = 'foot' | 'run' | 'walk' | 'cycle';
type BoardPeriod = 'week' | 'month' | 'all';
type BoardRow = { rank: number; userId: string; metres: number; activities: number; displayName: string; username: string | null; avatarUrl: string | null; isMe: boolean };
type Board = { rows: BoardRow[]; me: BoardRow | null };

export function useLeaderboard(activity: BoardActivity, period: BoardPeriod, scope: 'global' | 'country', limit: number) {
  return useQuery({
    queryKey: ['leaderboard', activity, period, scope, limit],
    queryFn: () => api<Board>(`/leaderboard?activity=${activity}&period=${period}&scope=${scope}&limit=${limit}`),
    staleTime: 60_000,
  });
}

function BoardRowView({ row, unit }: { row: BoardRow; unit: Unit }) {
  const content = <>
    <span className={cx('num w-6 shrink-0 text-center text-[14px] font-semibold', row.rank <= 3 ? 'text-ink' : 'text-ink-3')}>{row.rank}</span>
    <Avatar name={row.displayName} src={row.avatarUrl} size={32} className="shrink-0 rounded-full" />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[14px] font-semibold leading-tight">{row.isMe ? 'You' : row.displayName}</span>
      <span className="block truncate text-[12px] text-ink-3">{row.activities} {row.activities === 1 ? 'activity' : 'activities'}</span>
    </span>
    <span className="num shrink-0 text-[14px] font-semibold">{formatDistance(row.metres, unit)}</span>
  </>;
  const className = cx('flex items-center gap-3 px-3.5 py-2.5', row.isMe && 'bg-ink/[0.04]');
  return row.username && !row.isMe
    ? <Link to="/runners/$username" params={{ username: row.username }} search={{}} className={cx(className, 'transition-colors hover:bg-ink/[0.02]')}>{content}</Link>
    : <div className={className}>{content}</div>;
}

function BoardList({ board, unit }: { board: Board; unit: Unit }) {
  const meOutside = board.me && !board.rows.some((row) => row.isMe);
  return <div className="overflow-hidden rounded-xl border-[1.5px] border-ink bg-card">
    <div className="divide-y divide-line">
      {board.rows.map((row) => <BoardRowView key={row.userId} row={row} unit={unit} />)}
    </div>
    {meOutside && <div className="border-t-[1.5px] border-dashed border-line"><BoardRowView row={board.me!} unit={unit} /></div>}
  </div>;
}

/** Home: the top three on foot this week, you if you're further back, and the way to the full board. */
export function LeaderboardPreview() {
  const unit = useUnit();
  const board = useLeaderboard('foot', 'week', 'global', 3);
  return <section>
    <SectionHead title="Leaderboard" action={<span className="text-ink-3">This week</span>} />
    {board.isLoading ? <Skeleton className="h-40 rounded-xl" /> : !board.data?.rows.length
      ? <p className="rounded-xl border-[1.5px] border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">No verified distance yet this week. First run takes the top spot.</p>
      : <BoardList board={board.data} unit={unit} />}
    <Link to="/leaderboard" className="mt-2.5 flex items-center justify-center gap-0.5 text-[13px] font-semibold text-ink-2 hover:text-ink">Show more<ChevronRightIcon size={14} /></Link>
  </section>;
}

const ACTIVITY_TABS: Array<{ value: BoardActivity; label: string }> = [
  { value: 'foot', label: 'On foot' }, { value: 'run', label: 'Run' }, { value: 'walk', label: 'Walk' }, { value: 'cycle', label: 'Ride' },
];
const PERIODS: Array<{ value: BoardPeriod; label: string }> = [{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'all', label: 'All time' }];

export function LeaderboardPage() {
  const unit = useUnit();
  const [activity, setActivity] = useState<BoardActivity>('foot');
  const [period, setPeriod] = useState<BoardPeriod>('week');
  const [scope, setScope] = useState<'global' | 'country'>('global');
  const board = useLeaderboard(activity, period, scope, 50);
  const segment = (active: boolean) => cx('h-8 rounded-[9px] text-[13px] font-semibold transition-colors', active ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink');

  return <div className="mx-auto max-w-2xl animate-rise">
    <CompeteSubNav />
    <header className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-[26px] font-extrabold tracking-tight">Leaderboard</h1>
      <div className="grid grid-cols-2 rounded-xl border-[1.5px] border-ink bg-card p-[3px]" role="tablist" aria-label="Where">
        {(['global', 'country'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={scope === value} onClick={() => setScope(value)} className={cx(segment(scope === value), 'px-3')}>{value === 'global' ? 'Global' : 'Country'}</button>)}
      </div>
    </header>

    <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Activity">
      {ACTIVITY_TABS.map((tab) => <button key={tab.value} type="button" role="tab" aria-selected={activity === tab.value} onClick={() => setActivity(tab.value)} className={cx('-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[14px] font-semibold transition-colors', activity === tab.value ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink')}>{tab.label}</button>)}
    </div>

    <div className="mt-3 grid grid-cols-3 rounded-xl border-[1.5px] border-ink bg-card p-[3px]" role="tablist" aria-label="Period">
      {PERIODS.map((option) => <button key={option.value} type="button" role="tab" aria-selected={period === option.value} onClick={() => setPeriod(option.value)} className={segment(period === option.value)}>{option.label}</button>)}
    </div>

    <p className="mb-2.5 mt-4 text-[12px] text-ink-3">Verified distance{activity === 'foot' ? ' from runs and walks' : ''}. Rides rank separately.</p>
    <ErrorNotice error={board.error} onRetry={() => void board.refetch()} />
    {board.isLoading ? <Skeleton className="h-96 rounded-xl" /> : !board.data?.rows.length
      ? <p className="rounded-xl border-[1.5px] border-dashed border-line px-4 py-10 text-center text-[14px] text-ink-3">Nobody on this board yet. A verified {activity === 'cycle' ? 'ride' : 'run or walk'} puts you at the top.</p>
      : <BoardList board={board.data} unit={unit} />}
  </div>;
}
