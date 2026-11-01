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
  const days = useQuery({ queryKey: ['apple-health', 'days'], queryFn: () => api<DailySteps[]>('/apple-health/days?limit=30'), enabled: Boolean(status.data?.connected) });
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
  return <Link to="/activities" className="block rounded-[20px] border-[1.5px] border-line bg-card p-3.5 transition-colors hover:border-ink" aria-label={`Steps today, ${(today?.steps ?? 0).toLocaleString('en-GB')}, from Apple Health`}>
    <span className="flex items-center justify-between">
      <span className="text-[15px] font-bold">Steps today</span>
      <span className="text-[12px] font-bold text-[#FF2D55]">Apple Health</span>
    </span>
    <span className="mt-1 flex items-end justify-between gap-4">
      <span className="min-w-0">
        <span className="num block text-[28px] font-bold leading-8 tracking-tight">{(today?.steps ?? 0).toLocaleString('en-GB')}</span>
        <span className="num mt-0.5 block truncate text-[13px] text-ink-2">
          {today?.distanceMetres != null && <><b className="text-ink">{formatDistanceNumber(today.distanceMetres, unit)} {unit}</b> walked · </>}7-day avg {average.toLocaleString('en-GB')}
        </span>
      </span>
      <span className="flex h-14 shrink-0 items-end gap-1.5" aria-hidden="true">
        {week.map((day, index) => <span key={day.key} className="flex h-full flex-col items-center gap-1">
          <span className={cx('flex w-2.5 flex-1 flex-col justify-end overflow-hidden rounded bg-ink/[0.07]', index === 6 && 'ring-1 ring-ink-3')}>
            {day.steps > 0 && <span className="block rounded bg-[#FF2D55]" style={{ height: `${Math.max(8, (day.steps / most) * 100)}%` }} />}
          </span>
          <span className={cx('text-[9px] font-semibold', index === 6 ? 'text-ink' : 'text-ink-3')}>{day.letter}</span>
        </span>)}
      </span>
    </span>
  </Link>;
}
