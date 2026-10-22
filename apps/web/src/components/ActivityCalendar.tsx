import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { formatDistance, formatDistanceNumber } from '../lib/format';
import type { Unit } from '../lib/types';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { cx, ErrorNotice, Segmented, Skeleton } from './ui';

type DayTotal = { day: string; activities: number; steps: number; distanceMetres: string };
type Metric = 'steps' | 'distance';

export function ActivityCalendar({ unit }: { unit: Unit }) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [metric, setMetric] = useState<Metric>('distance');
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const totals = useQuery({
    queryKey: ['activity-calendar', monthKey, timeZone],
    queryFn: () => api<DayTotal[]>(`/activities/calendar?month=${monthKey}&tz=${encodeURIComponent(timeZone)}`),
  });
  const days = new Map(totals.data?.map((day) => [day.day, day]));
  const firstWeekday = (month.getDay() + 6) % 7;
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthSteps = totals.data?.reduce((sum, day) => sum + day.steps, 0) ?? 0;
  const monthMetres = totals.data?.reduce((sum, day) => sum + Number(day.distanceMetres), 0) ?? 0;

  function changeMonth(amount: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  return (
    <section className="panel-strong mb-8 p-4 sm:p-5" aria-label="Monthly activity calendar">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="wide text-[16px] font-extrabold uppercase sm:text-[18px]">Every day counts</h2>
          <p className="mt-0.5 text-[12px] text-ink-2">Orange days are days you moved.</p>
        </div>
        <div className="shrink-0"><Segmented<Metric> size="sm" label="Calendar measure" value={metric} onChange={setMetric} options={[{ value: 'distance', label: 'Km' }, { value: 'steps', label: 'Steps' }]} /></div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-[1.5px] border-ink bg-card shadow-hard-sm transition-transform hover:bg-paper active:translate-x-[2px] active:translate-y-[2px] active:shadow-none" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeftIcon size={18} /></button>
        <div className="text-center leading-tight">
          <p className="text-[16px] font-bold">{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
          <p className="num text-[12px] text-ink-2">{metric === 'steps' ? `${monthSteps.toLocaleString('en-GB')} steps` : formatDistance(monthMetres, unit)} · {totals.data?.length ?? 0} active {totals.data?.length === 1 ? 'day' : 'days'}</p>
        </div>
        <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-[1.5px] border-ink bg-card shadow-hard-sm transition-transform hover:bg-paper active:translate-x-[2px] active:translate-y-[2px] active:shadow-none" onClick={() => changeMonth(1)} aria-label="Next month"><ChevronRightIcon size={18} /></button>
      </div>
      <ErrorNotice error={totals.error} onRetry={() => void totals.refetch()} className="mt-3" />
      {totals.isLoading ? <Skeleton className="mt-4 h-56" /> : (
        <div className="mt-4 grid grid-cols-7 gap-1.5 text-center sm:gap-2">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => <span key={index} className="eyebrow py-1 text-ink-3">{label}</span>)}
          {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const date = `${monthKey}-${String(index + 1).padStart(2, '0')}`;
            const day = days.get(date);
            const moved = (day?.activities ?? 0) > 0;
            const isToday = date === todayKey;
            const value = metric === 'steps' ? (day?.steps ?? 0) : Number(day?.distanceMetres ?? 0);
            const label = metric === 'steps' ? `${value.toLocaleString('en-GB')} steps` : formatDistance(value, unit);
            return (
              <div
                key={date}
                className={cx(
                  'flex aspect-square min-w-0 flex-col items-center justify-center rounded-lg px-0.5',
                  moved ? 'bg-track text-paper' : 'bg-ink/[0.035]',
                  isToday && 'ring-2 ring-ink ring-offset-1 ring-offset-card',
                )}
                title={moved ? `${date}: ${day!.activities} ${day!.activities === 1 ? 'activity' : 'activities'}, ${label}` : `${date}: rest day`}
              >
                <span className={cx('num block text-[12px] font-bold', !moved && 'font-medium text-ink-3')}>{index + 1}</span>
                {moved && (
                  <span className="num block truncate text-[10px] font-semibold opacity-90 sm:text-[12px]">
                    {value > 0 ? (metric === 'steps' ? Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(value) : formatDistanceNumber(value, unit)) : '•'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
