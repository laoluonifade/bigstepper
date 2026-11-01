import type { AppleHealthStatus, DailySteps, Unit } from '@jump/shared/types';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { api } from '../lib/api';
import { formatDistanceNumber } from '../lib/format';
import { cx } from './ui';

function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Today's steps and walking distance from Apple Health, synced by the iPhone app, with the last seven days as bars. */
export function HealthToday({ unit }: { unit: Unit }) {
  const status = useQuery({ queryKey: ['apple-health'], queryFn: () => api<AppleHealthStatus>('/apple-health') });
  const days = useQuery({ queryKey: ['apple-health', 'days'], queryFn: () => api<DailySteps[]>('/apple-health/days?limit=60'), enabled: Boolean(status.data?.connected) });
  if (!days.data?.length) return null;
  const byDay = new Map(days.data.map((row) => [row.day, row]));
  const today = byDay.get(localDay(new Date()));
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return { key: localDay(date), letter: date.toLocaleDateString('en-GB', { weekday: 'narrow' }), steps: byDay.get(localDay(date))?.steps ?? 0 };
  });
  const counted = week.filter((day) => day.steps > 0);
  const average = counted.length ? Math.round(counted.reduce((sum, day) => sum + day.steps, 0) / counted.length) : 0;
  const most = Math.max(1000, ...week.map((day) => day.steps));
  return <Link to="/activities" className="flex items-center gap-3 rounded-[20px] border-[1.5px] border-line bg-card p-3 pl-3.5 transition-colors hover:border-ink" aria-label={`Steps today, ${(today?.steps ?? 0).toLocaleString('en-GB')}, from Apple Health`}>
    <span className="min-w-0 flex-1">
      <span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-[#FF2D55]">Steps today</span>
      <span className="num mt-0.5 block text-[22px] font-bold leading-[26px] tracking-tight">{(today?.steps ?? 0).toLocaleString('en-GB')}</span>
      <span className="num block text-[12px] text-ink-2">{today?.distanceMetres != null ? `${formatDistanceNumber(today.distanceMetres, unit)} ${unit} · ` : ''}avg {average.toLocaleString('en-GB')}/day</span>
    </span>
    <span className="flex h-11 shrink-0 items-end gap-[5px]" aria-hidden="true">
      {week.map((day, index) => <span key={day.key} className="flex h-full flex-col items-center gap-[3px]">
        <span className={cx('flex w-2 flex-1 flex-col justify-end overflow-hidden rounded-[3px] bg-ink/[0.07]', index === 6 && 'ring-1 ring-ink-3')}>
          {day.steps > 0 && <span className="block rounded-[3px] bg-[#FF2D55]" style={{ height: `${Math.max(8, (day.steps / most) * 100)}%` }} />}
        </span>
        <span className={cx('text-[9px] font-semibold', index === 6 ? 'text-ink' : 'text-ink-3')}>{day.letter}</span>
      </span>)}
    </span>
  </Link>;
}

/** Your Apple Health days, synced by the iPhone app, for the history list. */
export function useHealthDays() {
  const status = useQuery({ queryKey: ['apple-health'], queryFn: () => api<AppleHealthStatus>('/apple-health') });
  return useQuery({ queryKey: ['apple-health', 'days'], queryFn: () => api<DailySteps[]>('/apple-health/days?limit=60'), enabled: Boolean(status.data?.connected) });
}

/** One day of Apple Health in your history: all-day steps and walking distance. There's no route, so it has no page of its own. */
export function HealthDayRow({ day, unit }: { day: DailySteps; unit: Unit }) {
  const date = new Date(`${day.day}T12:00:00`);
  return <div className="flex items-center gap-3 border-b border-line px-1 py-3.5">
    <div className="w-11 shrink-0 text-center">
      <p className="score num text-[26px]">{date.getDate()}</p>
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-2">{date.toLocaleDateString('en-GB', { month: 'short' })}</p>
    </div>
    <div className="min-w-0 flex-1">
      <p className="flex items-baseline gap-1"><span className="score num text-[26px]">{day.steps.toLocaleString('en-GB')}</span><span className="text-[12px] font-semibold text-ink-2">steps</span></p>
      <p className="num mt-0.5 truncate text-[12px] text-ink-2">
        <span className="font-bold text-ink">All day</span>{day.distanceMetres != null && ` · ${formatDistanceNumber(day.distanceMetres, unit)} ${unit} walked`}<span className="font-bold text-[#FF2D55]"> · Apple Health</span>
      </p>
    </div>
    <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-[#FF2D55] text-white" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.4 10.6 20.1C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.6L12 21.4Z" /></svg>
    </span>
  </div>;
}
