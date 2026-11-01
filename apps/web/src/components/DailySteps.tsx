import type { AppleHealthStatus, DailySteps, Unit } from '@jump/shared/types';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { formatDistanceNumber } from '../lib/format';

const HEALTH_RED = '#FF2D55';

function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayLabel(day: string) {
  const today = new Date();
  if (day === localDay(today)) return 'Today';
  today.setDate(today.getDate() - 1);
  if (day === localDay(today)) return 'Yesterday';
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Every day's steps and walking distance from Apple Health, synced from the iPhone app and kept apart from recorded activities. */
export function DailyStepsList({ unit }: { unit: Unit }) {
  const status = useQuery({ queryKey: ['apple-health'], queryFn: () => api<AppleHealthStatus>('/apple-health') });
  const days = useQuery({ queryKey: ['apple-health', 'days'], queryFn: () => api<DailySteps[]>('/apple-health/days?limit=30'), enabled: Boolean(status.data?.connected) });
  const [expanded, setExpanded] = useState(false);
  const list = days.data ?? [];
  if (!list.length) return null;
  const shown = expanded ? list : list.slice(0, 7);
  const most = Math.max(...list.map((row) => row.steps), 1);
  return <section className="mb-8 rounded-2xl border-[1.5px] border-ink bg-card p-4 sm:p-5">
    <div className="flex items-center justify-between gap-3">
      <h2 className="wide text-[16px] font-extrabold uppercase sm:text-[18px]">Daily steps</h2>
      <span className="text-[12px] font-bold" style={{ color: HEALTH_RED }}>via Apple Health</span>
    </div>
    <p className="mt-1 text-[12px] text-ink-3">Everything your iPhone and Apple Watch counted, including outside recorded walks and runs.</p>
    <ul className="mt-3 divide-y divide-line">
      {shown.map((row) => <li key={row.day} className="flex items-center gap-3 py-2">
        <span className="w-24 shrink-0 text-[13px] font-semibold">{dayLabel(row.day)}</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full" style={{ width: `${Math.max(2, (row.steps / most) * 100)}%`, backgroundColor: HEALTH_RED }} /></span>
        <span className="w-28 shrink-0 text-right">
          <span className="num block text-[13px] font-bold">{row.steps.toLocaleString('en-GB')}</span>
          {row.distanceMetres != null && <span className="num block text-[11px] text-ink-3">{formatDistanceNumber(row.distanceMetres, unit)} {unit}</span>}
        </span>
      </li>)}
    </ul>
    {list.length > 7 && <button type="button" className="mt-2 text-[13px] font-semibold text-ink-2 hover:text-ink" onClick={() => setExpanded((open) => !open)}>
      {expanded ? 'Show less' : `Show ${list.length} days`}
    </button>}
  </section>;
}
