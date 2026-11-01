import { LandingHero } from '../components/LandingHero';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ExploreEventCard } from '../components/ClubEvents';
import { canEnter, CompetitionCard } from '../components/competition';
import { ArrowRightIcon } from '../components/icons';
import { cx, Redirect, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { ClubEvent } from '../lib/club-events';
import { useTables } from '../lib/queries';

export function LandingPage() {
  const { status } = useAuth();

  if (status === 'checking' || status === 'unreachable') return null;
  if (status === 'signed-in') return <Redirect to="/dashboard" />;

  return (
    <div className="mx-auto max-w-5xl text-center">
      {/* Hero, centred. */}
      <LandingHero />

      <div className="text-left">
        <ExploreNow />
      </div>

      {/* For brands: stacked and centred on phones; side by side from tablet up. */}
      <Link to="/brands" className="mb-12 mt-14 flex flex-col items-center gap-5 rounded-2xl bg-ink px-6 py-8 text-center text-paper sm:flex-row sm:text-left">
        <span className="w-full sm:min-w-0 sm:flex-1">
          <span className="eyebrow block text-paper/55">For brands</span>
          <span className="wide mt-2 block text-[20px] font-black uppercase leading-tight sm:text-[24px]">Sponsor a competition. Reach runners across countries.</span>
        </span>
        <span className="btn-primary min-h-12 w-full shrink-0 px-5 sm:w-auto">Jump for brands <ArrowRightIcon size={16} /></span>
      </Link>
    </div>
  );
}


/** Real public activity: competitions and club events use the same Explore rhythm as mobile. */
function ExploreNow() {
  const tables = useTables();
  const events = useQuery({
    queryKey: ['club-events', 'public'],
    queryFn: () => api<{ nearby: ClubEvent[] }>('/events'),
  });
  const now = Date.now();
  // Four on desktop, two on phones: alternate competitions and events, and if one runs short the other fills in.
  const open = (tables.data ?? []).filter((table) => canEnter(table, now));
  const upcoming = events.data?.nearby ?? [];
  const picks: Array<{ kind: 'competition'; table: (typeof open)[number] } | { kind: 'event'; event: ClubEvent }> = [];
  for (let index = 0; picks.length < 4 && (index < open.length || index < upcoming.length); index += 1) {
    if (open[index]) picks.push({ kind: 'competition', table: open[index] });
    if (picks.length < 4 && upcoming[index]) picks.push({ kind: 'event', event: upcoming[index] });
  }

  if (tables.isLoading || events.isLoading) return <Skeleton className="h-72 animate-fade" />;

  if (picks.length > 0) {
    return (
      <div className="grid animate-slide-in gap-3 sm:grid-cols-2 [animation-delay:300ms]">
        {picks.map((pick, index) => <div key={pick.kind === 'event' ? `event-${pick.event.id}` : pick.table.id} className={cx('grid [&>*]:h-full', index >= 2 && 'hidden sm:grid')}>
          {pick.kind === 'event' ? <ExploreEventCard event={pick.event} unit="km" /> : <CompetitionCard table={pick.table} unit="km" now={now} />}
        </div>)}
      </div>
    );
  }

  return (
    <div className="panel-strong mx-auto max-w-xl animate-slide-in overflow-hidden [animation-delay:300ms]">
      <div className="bg-ink px-6 py-7 text-paper">
        <p className="eyebrow text-paper/55">How it works</p>
        <p className="wide mt-2 text-[22px] font-black uppercase leading-tight">Three steps to the board</p>
      </div>
      <ol className="divide-y divide-line">
        {[
          ['01', 'Record walks and runs with your phone’s GPS.'],
          ['02', 'Distance is checked before it counts. No shortcuts.'],
          ['03', 'Join a competition and climb its standings.'],
        ].map(([n, text], index) => (
          <li key={n} className="flex animate-rise gap-4 px-6 py-4" style={{ animationDelay: `${650 + index * 130}ms` }}>
            <span className="score w-7 text-[20px] text-track">{n}</span>
            <span className="pt-0.5 text-[15px] text-ink-2">{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
