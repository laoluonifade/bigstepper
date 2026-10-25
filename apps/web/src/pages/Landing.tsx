import { Link } from '@tanstack/react-router';
import { canEnter, CompetitionCard } from '../components/competition';
import { ArrowRightIcon } from '../components/icons';
import { Redirect, Skeleton } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useTables } from '../lib/queries';

export function LandingPage() {
  const { status } = useAuth();

  if (status === 'checking' || status === 'unreachable') return null;
  if (status === 'signed-in') return <Redirect to="/dashboard" />;

  return (
    <section className="grid min-h-[calc(100vh-8rem)] items-center gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:py-16">
      <div>
        <h1 className="display text-[clamp(56px,10vw,104px)] leading-[0.82] tracking-[-0.055em]">
          <span className="reveal-line">
            <span>Every</span>
          </span>
          <span className="reveal-line">
            <span className="[animation-delay:90ms]">step</span>
          </span>
          <span className="reveal-line">
            <span className="whitespace-nowrap [animation-delay:180ms]">
              counts<span className="inline-block animate-pop text-track [animation-delay:750ms]">.</span>
            </span>
          </span>
        </h1>
        <p className="mt-7 max-w-xl animate-rise-lg text-[18px] leading-relaxed text-ink-2 [animation-delay:350ms] sm:text-[21px]">
          Join verified competitions, compete with your community, and turn everyday movement into something worth showing up for.
        </p>
        <div className="mt-8 flex animate-rise-lg flex-wrap gap-3 [animation-delay:480ms]">
          <Link to="/register" className="btn-primary min-h-12 px-6">
            Join Jump free <ArrowRightIcon size={17} />
          </Link>
          <Link to="/competitions" className="btn-secondary min-h-12 px-6">
            Explore competitions
          </Link>
        </div>
      </div>

      <OpenChallenges />
      {/* For brands: one band under the hero, pointing to the shareable /brands page. */}
      {/* Stacked and centred on phones; side by side from tablet up. */}
      <Link to="/brands" className="flex flex-col items-center gap-5 rounded-2xl bg-ink px-6 py-8 text-center text-paper sm:flex-row sm:text-left lg:col-span-2">
        <span className="w-full sm:min-w-0 sm:flex-1">
          <span className="eyebrow block text-paper/55">For brands</span>
          <span className="wide mt-2 block text-[20px] font-black uppercase leading-tight sm:text-[24px]">Sponsor a competition. Reach runners across countries.</span>
        </span>
        <span className="btn-primary min-h-12 w-full shrink-0 px-5 sm:w-auto">See Jump for brands <ArrowRightIcon size={16} /></span>
      </Link>
    </section>
  );
}

/** Real open challenges from the API; until there are any, an honest explainer instead of a mock-up. */
function OpenChallenges() {
  const tables = useTables();
  const now = Date.now();
  const open = (tables.data ?? []).filter((table) => canEnter(table, now)).slice(0, 2);

  if (tables.isLoading) return <Skeleton className="h-72 animate-fade" />;

  if (open.length > 0) {
    return (
      <div className="animate-slide-in space-y-3 [animation-delay:300ms]">
        <p className="eyebrow">Open for entry now</p>
        {open.map((table) => (
          <CompetitionCard key={table.id} table={table} unit="km" now={now} />
        ))}
        <Link to="/competitions" className="link inline-block text-[14px]">
          See all competitions
        </Link>
      </div>
    );
  }

  return (
    <div className="panel-strong animate-slide-in overflow-hidden [animation-delay:300ms]">
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
