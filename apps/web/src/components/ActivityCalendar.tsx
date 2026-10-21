import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { formatDistance } from '../lib/format';
import type { Unit } from '../lib/types';
import { ErrorNotice, Segmented, Skeleton } from './ui';

type DayTotal = { day: string; activities: number; steps: number; distanceMetres: string };
type Metric = 'steps' | 'distance';

export function ActivityCalendar({ unit }: { unit: Unit }) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [metric, setMetric] = useState<Metric>('steps');
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const totals = useQuery({
    queryKey: ['activity-calendar', monthKey, timeZone],
    queryFn: () => api<DayTotal[]>(`/activities/calendar?month=${monthKey}&tz=${encodeURIComponent(timeZone)}`),
  });
  const days = new Map(totals.data?.map((day) => [day.day, day]));
  const firstWeekday = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthSteps = totals.data?.reduce((sum, day) => sum + day.steps, 0) ?? 0;
  const monthMetres = totals.data?.reduce((sum, day) => sum + Number(day.distanceMetres), 0) ?? 0;

  function changeMonth(amount: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  return (
    <section className="panel-strong mb-8 p-4 sm:p-5" aria-label="Monthly activity calendar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="wide text-[18px] font-extrabold uppercase">Every day counts</h2>
          <p className="text-[12px] text-ink-2">Verified activities, by your local day.</p>
        </div>
        <Segmented<Metric> label="Calendar measure" value={metric} onChange={setMetric} options={[{ value: 'steps', label: 'Steps' }, { value: 'distance', label: 'Distance' }]} />
      </div>
      <div className="mt-5 flex items-center justify-between border-b border-line pb-3">
        <button type="button" className="btn-quiet btn-sm" onClick={() => changeMonth(-1)} aria-label="Previous month">←</button>
        <div className="text-center">
          <p className="font-bold">{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
          <p className="num text-[12px] text-ink-2">{metric === 'steps' ? `${monthSteps.toLocaleString('en-GB')} steps` : formatDistance(monthMetres, unit)}</p>
        </div>
        <button type="button" className="btn-quiet btn-sm" onClick={() => changeMonth(1)} aria-label="Next month">→</button>
      </div>
      <ErrorNotice error={totals.error} onRetry={() => void totals.refetch()} className="mt-3" />
      {totals.isLoading ? <Skeleton className="mt-4 h-56" /> : (
        <div className="mt-3 grid grid-cols-7 gap-1 text-center sm:gap-2">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => <span key={index} className="eyebrow py-1 text-ink-3">{label}</span>)}
          {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const date = `${monthKey}-${String(index + 1).padStart(2, '0')}`;
            const day = days.get(date);
            const value = metric === 'steps' ? (day?.steps ?? 0) : Number(day?.distanceMetres ?? 0);
            const label = metric === 'steps' ? `${value.toLocaleString('en-GB')} steps` : formatDistance(value, unit);
            return <div key={date} className={`min-h-14 rounded-sm px-0.5 py-1 ${value > 0 ? 'bg-volt/25' : 'bg-ink/[0.035]'}`} title={`${date}: ${label}, ${day?.activities ?? 0} verified activities`}>
              <span className="num block text-[11px] text-ink-3">{index + 1}</span>
              {value > 0 && <span className="num block truncate text-[11px] font-bold sm:text-[13px]">{metric === 'steps' ? Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(value) : formatDistance(value, unit)}</span>}
            </div>;
          })}
        </div>
      )}
    </section>
  );
}
