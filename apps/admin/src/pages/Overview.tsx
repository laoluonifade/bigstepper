import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { BarChart, Breakdown, CHART, ChartCard, LineChart, type Row, type Series } from '../charts';
import { AdminLink } from '../router';
import { cx, ErrorNotice, PageHeader, Segmented, Skeleton } from '../ui';

type Stats = {
  users: number; newToday: number; newWeek: number; newMonth: number; activeToday: number; movedToday: number;
  verified: number; activeWeek: number; strava: number; liveCompetitions: number;
};

const number = (value: number) => value.toLocaleString('en-GB');

/** How big Jump is today, and the doors into each list. */
export function OverviewPage() {
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api<Stats>('/admin/stats'), refetchInterval: 60_000 });
  const data = stats.data;
  return <>
    <PageHeader eyebrow="Overview" title="Jump today" description="“Today” is the Lagos calendar day." />
    <ErrorNotice error={stats.error} onRetry={() => void stats.refetch()} />
    {!data ? <Skeleton className="h-64 rounded-2xl" /> : <div className="space-y-4">
      <AdminLink to="/people" className="block rounded-2xl border-[1.5px] border-ink bg-card p-5 transition-shadow hover:shadow-hard-sm">
        <p className="text-[13px] text-ink-3">People on Jump</p>
        <p className="score num mt-1 text-[56px] leading-none">{number(data.users)}</p>
        <p className="num mt-2 text-[13px] text-ink-2">
          <b className="text-ink">+{number(data.newToday)}</b> today · <b className="text-ink">+{number(data.newWeek)}</b> this week · <b className="text-ink">+{number(data.newMonth)}</b> this month
        </p>
      </AdminLink>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ['Active today', data.activeToday, 'opened Jump', '/people?view=active-today'],
          ['Recorded today', data.movedToday, 'logged an activity', '/people?view=moved-today'],
          ['New today', data.newToday, 'signed up', '/people?view=new-today'],
          ['Live competitions', data.liveCompetitions, 'open or running', null],
          ['Active this week', data.activeWeek, 'recorded an activity', null],
          ['Verified emails', data.verified, 'of everyone', null],
          ['Strava connected', data.strava, 'accounts linked', null],
        ] as const).map(([label, value, hint, to]) => {
          const tile = <>
            <p className="text-[12px] font-semibold text-ink-2">{label}</p>
            <p className="num text-[28px] font-extrabold leading-tight">{number(value)}</p>
            <p className="text-[11px] text-ink-3">{hint}</p>
          </>;
          return to
            ? <AdminLink key={label} to={to} className="rounded-xl border-[1.5px] border-ink bg-card px-4 py-3 transition-colors hover:bg-ink/[0.03]">{tile}</AdminLink>
            : <div key={label} className="rounded-xl border border-line bg-card px-4 py-3">{tile}</div>;
        })}
      </div>
    </div>}
    <Analytics />
  </>;
}

type Analytics = {
  days: number;
  series: Row[];
  totals: Record<'signups' | 'signupsBefore' | 'movers' | 'moversBefore' | 'verifiedMetres' | 'verifiedMetresBefore' | 'joins' | 'joinsBefore' | 'revenueKobo' | 'revenueKoboBefore', number>;
  verification: Array<{ status: string; count: number }>;
  competitions: Array<{ type: string; count: number }>;
  activation: { eligible: number; activated: number };
};

const km = (metres: number) => `${(metres / 1000).toLocaleString('en-GB', { maximumFractionDigits: metres >= 100_000 ? 0 : 1 })} km`;
const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-GB')}`;
const compactNaira = (kobo: number) => kobo >= 100_000_000 ? `₦${(kobo / 100_000_000).toLocaleString('en-GB', { maximumFractionDigits: 1 })}m` : kobo >= 100_000 ? `₦${(kobo / 100_000).toLocaleString('en-GB', { maximumFractionDigits: 1 })}k` : naira(kobo);
const DISTANCE: Series[] = [
  { key: 'runMetres', label: 'Run', color: CHART.run },
  { key: 'walkMetres', label: 'Walk', color: CHART.walk },
  { key: 'cycleMetres', label: 'Ride', color: CHART.ride },
];
const one = (key: string, label: string): Series => ({ key, label, color: CHART.single });
const STATUS: Record<string, { label: string; color: string }> = {
  VERIFIED: { label: 'Verified', color: '#12805C' },
  PENDING_VERIFICATION: { label: 'Being checked', color: '#8A857B' },
  FLAGGED: { label: 'Flagged for review', color: '#9A6200' },
  REJECTED: { label: 'Rejected', color: '#C2261B' },
};
const KIND: Record<string, string> = { free: 'Free', sponsored: 'Funded', paid: 'Paid' };

/** Change against the period just before, e.g. the 30 days before these 30. */
function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return now ? <span className="text-ink-3">new this period</span> : <span className="text-ink-3">none yet</span>;
  const change = Math.round(((now - before) / before) * 100);
  return <span className={cx('font-semibold', change > 0 ? 'text-ok' : change < 0 ? 'text-bad' : 'text-ink-3')}>
    {change > 0 ? '▲' : change < 0 ? '▼' : '■'} {Math.abs(change)}% <span className="font-normal text-ink-3">vs previous period</span>
  </span>;
}

/** Trends over the last 7, 30 or 90 Lagos days. */
function Analytics() {
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const query = useQuery({ queryKey: ['admin', 'analytics', days], queryFn: () => api<Analytics>(`/admin/analytics?days=${days}`), refetchInterval: 5 * 60_000 });
  const data = query.data;
  const sum = (key: string) => (data?.series ?? []).reduce((total, row) => total + Number(row[key] ?? 0), 0);
  const rate = data && data.activation.eligible ? Math.round((data.activation.activated / data.activation.eligible) * 100) : null;
  return <section className="mt-10">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="wide text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-3">Analytics</p>
        <h2 className="text-[22px] font-extrabold">How Jump is growing</h2>
      </div>
      <Segmented label="Period" size="sm" value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
    </div>
    <ErrorNotice error={query.error} onRetry={() => void query.refetch()} />
    {!data ? <Skeleton className="mt-4 h-[520px] rounded-2xl" /> : <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ['New people', data.totals.signups.toLocaleString('en-GB'), data.totals.signups, data.totals.signupsBefore],
          ['People who recorded', data.totals.movers.toLocaleString('en-GB'), data.totals.movers, data.totals.moversBefore],
          ['Verified distance', km(data.totals.verifiedMetres), data.totals.verifiedMetres, data.totals.verifiedMetresBefore],
          ['Paid entries', naira(data.totals.revenueKobo), data.totals.revenueKobo, data.totals.revenueKoboBefore],
        ] as const).map(([label, value, now, before]) => <div key={label} className="rounded-xl border border-line bg-card px-4 py-3">
          <p className="text-[12px] font-semibold text-ink-2">{label}</p>
          <p className="num text-[24px] font-extrabold leading-tight">{value}</p>
          <p className="text-[11px]"><Delta now={now} before={before} /></p>
        </div>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="New people per day" headline={sum('signups').toLocaleString('en-GB')} hint={`signed up in the last ${data.days} days`}
          rows={data.series} series={[one('signups', 'Sign-ups')]} format={(value) => value.toLocaleString('en-GB')}>
          <BarChart rows={data.series} series={[one('signups', 'Sign-ups')]} format={(value) => value.toLocaleString('en-GB')} />
        </ChartCard>
        <ChartCard title="People recording each day" headline={data.totals.movers.toLocaleString('en-GB')} hint="different people recorded at least once"
          rows={data.series} series={[one('movers', 'People'), one('activities', 'Activities')]} format={(value) => value.toLocaleString('en-GB')}>
          <LineChart rows={data.series} series={one('movers', 'People recording')} format={(value) => value.toLocaleString('en-GB')} />
        </ChartCard>
        <ChartCard title="Verified distance by activity" headline={km(sum('runMetres') + sum('walkMetres') + sum('cycleMetres'))} hint="only verified activities count" legend={DISTANCE}
          rows={data.series} series={DISTANCE} format={km} className="lg:col-span-2">
          <BarChart rows={data.series} series={DISTANCE} format={km} height={220} />
        </ChartCard>
        <ChartCard title="Competition joins per day" headline={sum('joins').toLocaleString('en-GB')} hint="entries into competitions"
          rows={data.series} series={[one('joins', 'Joins')]} format={(value) => value.toLocaleString('en-GB')}>
          <BarChart rows={data.series} series={[one('joins', 'Joins')]} format={(value) => value.toLocaleString('en-GB')} />
        </ChartCard>
        <ChartCard title="Paid entries per day" headline={naira(sum('revenueKobo'))} hint="successful payments into paid competitions"
          rows={data.series} series={[one('revenueKobo', 'Paid')]} format={naira}>
          {sum('revenueKobo') ? <BarChart rows={data.series} series={[one('revenueKobo', 'Paid')]} format={compactNaira} />
            : <p className="py-16 text-center text-[13px] text-ink-3">No paid entries in this period.</p>}
        </ChartCard>
        <ChartCard title="Messages per day" headline={sum('messages').toLocaleString('en-GB')} hint="direct, club and group messages"
          rows={data.series} series={[one('messages', 'Messages')]} format={(value) => value.toLocaleString('en-GB')}>
          <BarChart rows={data.series} series={[one('messages', 'Messages')]} format={(value) => value.toLocaleString('en-GB')} />
        </ChartCard>
        <ChartCard title="New people who record in their first week" headline={rate === null ? '—' : `${rate}%`}
          hint={data.activation.eligible ? `${data.activation.activated.toLocaleString('en-GB')} of ${data.activation.eligible.toLocaleString('en-GB')} who joined over a week ago` : 'Needs people who joined over a week ago'}>
          {rate !== null && <div className="mt-2 h-3 rounded-[4px] bg-ink/[0.06]"><div className="h-full rounded-[4px]" style={{ width: `${Math.max(1.5, rate)}%`, background: CHART.single }} /></div>}
        </ChartCard>
        <ChartCard title="How activities were judged" hint={`every activity recorded in the last ${data.days} days`}>
          <Breakdown items={data.verification.map((row) => ({ label: STATUS[row.status]?.label ?? row.status, value: row.count, color: STATUS[row.status]?.color ?? '#8A857B' }))} />
        </ChartCard>
        <ChartCard title="New competitions by kind" hint={`created in the last ${data.days} days`}>
          <Breakdown items={['free', 'sponsored', 'paid'].map((type) => ({ label: KIND[type], value: data.competitions.find((row) => row.type === type)?.count ?? 0, color: '#121212' }))} />
        </ChartCard>
      </div>
    </div>}
  </section>;
}
