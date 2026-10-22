import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ReactNode, useState } from 'react';
import { SectionHead } from '../components/CompeteHome';
import { CompeteSubNav } from './Competitions';
import { ChevronRightIcon } from '../components/icons';
import { Avatar, cx, ErrorNotice, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { formatDistance } from '../lib/format';
import { useProfile, useUnit } from '../lib/queries';
import { countryName, flag } from '../lib/countries';
import type { Unit } from '../lib/types';

type BoardActivity = 'foot' | 'run' | 'walk' | 'cycle';
type BoardPeriod = 'week' | 'month' | 'all';
type BoardRow = { rank: number; userId: string; metres: number; activities: number; displayName: string; username: string | null; avatarUrl: string | null; countryCode: string | null; isMe: boolean };
type Board = { rows: BoardRow[]; me: BoardRow | null };

export function useLeaderboard(activity: BoardActivity, period: BoardPeriod, scope: 'global' | 'country', limit: number) {
  return useQuery({
    queryKey: ['leaderboard', activity, period, scope, limit],
    queryFn: () => api<Board>(`/leaderboard?activity=${activity}&period=${period}&scope=${scope}&limit=${limit}`),
    staleTime: 60_000,
  });
}

/** An avatar with the runner's flag pinned to the corner, so a global board reads as a map of who's out there. */
function Runner({ row, size, showFlag, ring }: { row: BoardRow; size: number; showFlag: boolean; ring?: string }) {
  return <span className="relative inline-flex shrink-0">
    <Avatar name={row.displayName} src={row.avatarUrl} size={size} className={cx('rounded-full', ring)} />
    {showFlag && row.countryCode && <span className="absolute -bottom-0.5 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-card text-[12px] leading-none shadow-[0_0_0_1.5px_var(--tw-shadow-color)] shadow-line" title={countryName(row.countryCode)}>{flag(row.countryCode)}</span>}
  </span>;
}

function RowLink({ row, className, children }: { row: BoardRow; className: string; children: ReactNode }) {
  return row.username && !row.isMe
    ? <Link to="/runners/$username" params={{ username: row.username }} search={{}} className={className}>{children}</Link>
    : <div className={className}>{children}</div>;
}

function BoardRowView({ row, unit, leader, showFlag }: { row: BoardRow; unit: Unit; leader: number; showFlag: boolean }) {
  return <RowLink row={row} className={cx('relative flex items-center gap-3 px-4 py-3 transition-colors', row.isMe ? 'bg-volt/30' : 'hover:bg-ink/[0.02]')}>
    <span className="num w-7 shrink-0 text-[15px] font-bold text-ink-3">{row.rank}</span>
    <Runner row={row} size={36} showFlag={showFlag} />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[14px] font-semibold leading-tight">{row.isMe ? 'You' : row.displayName}</span>
      {/* How far off the top they are, as a thin bar. */}
      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-ink/[0.07]"><span className="block h-full rounded-full bg-ink/70" style={{ width: `${leader ? Math.max(4, (row.metres / leader) * 100) : 0}%` }} /></span>
    </span>
    <span className="num shrink-0 text-right text-[15px] font-bold">{formatDistance(row.metres, unit)}</span>
  </RowLink>;
}

function BoardList({ board, unit, showFlag, from = 0 }: { board: Board; unit: Unit; showFlag: boolean; from?: number }) {
  const meOutside = board.me && !board.rows.some((row) => row.isMe);
  const leader = board.rows[0]?.metres ?? 0;
  const rows = board.rows.slice(from);
  if (!rows.length && !meOutside) return null;
  return <div className="overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card">
    <div className="divide-y divide-line">
      {rows.map((row) => <BoardRowView key={row.userId} row={row} unit={unit} leader={leader} showFlag={showFlag} />)}
    </div>
    {meOutside && <div className="border-t-[1.5px] border-dashed border-ink/30"><BoardRowView row={board.me!} unit={unit} leader={leader} showFlag={showFlag} /></div>}
  </div>;
}

/** The top three on a dark stage: first in the middle and highest, the way a real podium stands. */
function Podium({ rows, unit, showFlag }: { rows: BoardRow[]; unit: Unit; showFlag: boolean }) {
  const order = [rows[1], rows[0], rows[2]];
  const heights = ['h-14', 'h-20', 'h-10'];
  return <section className="overflow-hidden rounded-3xl bg-[#121212] px-3 pt-5 text-paper">
    <div className="grid grid-cols-3 items-end gap-2">
      {order.map((row, index) => {
        if (!row) return <span key={index} />;
        const first = row.rank === 1;
        return <RowLink key={row.userId} row={row} className="group flex min-w-0 flex-col items-center text-center">
          <Runner row={row} size={first ? 64 : 48} showFlag={showFlag} ring={cx('ring-2', first ? 'ring-volt' : 'ring-paper/25', row.isMe && 'ring-volt')} />
          <span className={cx('mt-2 w-full truncate px-1 text-[13px] font-semibold', row.isMe && 'text-volt')}>{row.isMe ? 'You' : row.displayName.split(' ')[0]}</span>
          <span className={cx('num text-[15px] font-bold', first ? 'text-volt' : 'text-paper/80')}>{formatDistance(row.metres, unit)}</span>
          <span className={cx('mt-2 flex w-full items-start justify-center rounded-t-xl pt-2', heights[index], first ? 'bg-volt text-ink' : 'bg-paper/10 text-paper/70')}>
            <span className="score num text-[22px] leading-none">{row.rank}</span>
          </span>
        </RowLink>;
      })}
    </div>
  </section>;
}

/** Home: the top three on foot this week, you if you're further back, and the way to the full board. */
export function LeaderboardPreview() {
  const unit = useUnit();
  const board = useLeaderboard('foot', 'week', 'global', 3);
  return <section>
    <SectionHead title="Leaderboard" action={<span className="text-ink-3">This week</span>} />
    {board.isLoading ? <Skeleton className="h-40 rounded-xl" /> : !board.data?.rows.length
      ? <p className="rounded-xl border-[1.5px] border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">No verified distance yet this week. First run takes the top spot.</p>
      : <BoardList board={board.data} unit={unit} showFlag />}
    <Link to="/leaderboard" className="mt-2.5 flex items-center justify-center gap-0.5 text-[13px] font-semibold text-ink-2 hover:text-ink">Show more<ChevronRightIcon size={14} /></Link>
  </section>;
}

const ACTIVITY_TABS: Array<{ value: BoardActivity; label: string }> = [
  { value: 'foot', label: 'On foot' }, { value: 'run', label: 'Run' }, { value: 'walk', label: 'Walk' }, { value: 'cycle', label: 'Ride' },
];
const PERIODS: Array<{ value: BoardPeriod; label: string }> = [{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'all', label: 'All time' }];

export function LeaderboardPage() {
  const unit = useUnit();
  const profile = useProfile();
  const country = profile.data?.countryCode ?? null;
  const [activity, setActivity] = useState<BoardActivity>('foot');
  const [period, setPeriod] = useState<BoardPeriod>('week');
  const [scope, setScope] = useState<'global' | 'country'>('global');
  const board = useLeaderboard(activity, period, scope, 50);
  const data = board.data;
  const global = scope === 'global';
  const me = data?.me;
  const above = me && data ? data.rows.find((row) => row.rank === me.rank - 1) ?? (data.rows.some((row) => row.isMe) ? null : data.rows.at(-1)) : null;
  const countries = global && data ? new Set(data.rows.map((row) => row.countryCode).filter(Boolean)).size : 0;

  return <div className="mx-auto max-w-2xl animate-rise">
    <CompeteSubNav />
    <header className="mb-4">
      <h1 className="text-[26px] font-extrabold tracking-tight">Leaderboard</h1>
      <p className="mt-0.5 text-[13px] text-ink-3">
        Verified distance{activity === 'foot' ? ' from runs and walks' : ''}{global && countries > 1 ? ` · runners from ${countries} countries` : ''}
      </p>
    </header>

    {/* Where: the whole world, or just home. */}
    <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Where">
      {([['global', '🌍', 'Global'], ['country', country ? flag(country) : '🏳️', country ? countryName(country) : 'My country']] as const).map(([value, icon, label]) =>
        <button key={value} type="button" role="tab" aria-selected={scope === value} onClick={() => setScope(value)}
          className={cx('flex h-12 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-ink text-[14px] font-bold transition-all', scope === value ? 'bg-ink text-paper shadow-hard-sm' : 'bg-card text-ink-2 hover:text-ink')}>
          <span className="text-[20px] leading-none">{icon}</span><span className="truncate">{label}</span>
        </button>)}
    </div>

    <div className="no-scrollbar -mx-4 mt-4 flex gap-5 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Activity">
      {ACTIVITY_TABS.map((tab) => <button key={tab.value} type="button" role="tab" aria-selected={activity === tab.value} onClick={() => setActivity(tab.value)} className={cx('relative shrink-0 pb-2.5 text-[14px] font-semibold transition-colors', activity === tab.value ? 'text-ink' : 'text-ink-3 hover:text-ink')}>
        {tab.label}
        {activity === tab.value && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-ink" aria-hidden="true" />}
      </button>)}
    </div>
    <div className="mt-3 flex gap-1.5" role="tablist" aria-label="Period">
      {PERIODS.map((option) => <button key={option.value} type="button" role="tab" aria-selected={period === option.value} onClick={() => setPeriod(option.value)} className={cx('h-8 rounded-full px-3.5 text-[13px] font-semibold transition-colors', period === option.value ? 'bg-ink text-paper' : 'bg-ink/[0.06] text-ink-2 hover:text-ink')}>{option.label}</button>)}
    </div>

    <ErrorNotice error={board.error} onRetry={() => void board.refetch()} />
    {board.isLoading ? <div className="mt-4 space-y-3"><Skeleton className="h-56 rounded-3xl" /><Skeleton className="h-72 rounded-2xl" /></div> : !data?.rows.length
      ? <div className="mt-4 rounded-2xl border-[1.5px] border-dashed border-ink/30 px-4 py-12 text-center">
        <p className="text-[36px] leading-none">{global ? '🌍' : country ? flag(country) : '🏁'}</p>
        <p className="mt-3 text-[15px] font-bold">The top spot is open</p>
        <p className="mt-1 text-[13px] text-ink-3">A verified {activity === 'cycle' ? 'ride' : 'run or walk'} puts you on this board.</p>
        <Link to="/run" className="btn-dark mt-4 inline-flex">Start a run</Link>
      </div>
      : <div className="mt-4 space-y-3">
        <Podium rows={data.rows.slice(0, 3)} unit={unit} showFlag={global} />
        {/* Where you stand and who's next to catch. */}
        {me && <div className="flex items-center gap-3 rounded-2xl border-[1.5px] border-ink bg-volt/40 px-4 py-3">
          <span className="score num text-[28px] leading-none">#{me.rank}</span>
          <p className="min-w-0 flex-1 text-[13px] leading-snug">
            {me.rank === 1 ? <>You’re on top{global ? ' of the world' : country ? ` of ${countryName(country)}` : ''}. Hold it.</>
              : above ? <><span className="num font-bold">{formatDistance(Math.max(0, above.metres - me.metres), unit)}</span> to pass {above.isMe ? 'the next runner' : above.displayName.split(' ')[0]}{data.rows.some((row) => row.isMe) ? '' : ' and reach the top 50'}.</>
                : 'Keep moving to climb.'}
          </p>
          <Link to="/run" className="shrink-0 rounded-full bg-ink px-3.5 py-2 text-[12px] font-bold text-paper">Go</Link>
        </div>}
        <BoardList board={data} unit={unit} showFlag={global} from={3} />
      </div>}
  </div>;
}
