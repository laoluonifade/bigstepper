import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { AdminLink } from '../router';
import { ErrorNotice, PageHeader, Skeleton } from '../ui';

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
  </>;
}
