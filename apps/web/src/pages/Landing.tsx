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
      <div className="animate-rise">
        <p className="eyebrow">Walk. Run. Compete.</p>
        <h1 className="display mt-4 max-w-3xl text-[clamp(58px,10vw,112px)] leading-[0.82] tracking-[-0.055em]">
          Every step<br />counts.
        </h1>
        <p className="mt-7 max-w-xl text-[18px] leading-relaxed text-ink-2 sm:text-[21px]">
          Join verified challenges, compete with your community, and turn everyday movement into something worth showing up for.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/register" className="btn-primary min-h-12 px-6">
            Join Jump free <ArrowRightIcon size={17} />
          </Link>
          <Link to="/competitions" className="btn-secondary min-h-12 px-6">
            Explore challenges
          </Link>
        </div>
      </div>

      <OpenChallenges />
    </section>
  );
}

/** Real open challenges from the API; until there are any, an honest explainer instead of a mock-up. */
function OpenChallenges() {
  const tables = useTables();
  const now = Date.now();
  const open = (tables.data ?? []).filter((table) => canEnter(table, now)).slice(0, 2);

  if (tables.isLoading) return <Skeleton className="h-72" />;

  if (open.length > 0) {
    return (
      <div className="animate-rise space-y-3">
        <p className="eyebrow">Open for entry now</p>
        {open.map((table) => (
          <CompetitionCard key={table.id} table={table} unit="km" now={now} />
        ))}
        <Link to="/competitions" className="link inline-block text-[14px]">
          See all challenges
        </Link>
      </div>
    );
  }

  return (
    <div className="panel-strong animate-rise overflow-hidden">
      <div className="bg-ink px-6 py-7 text-paper">
        <p className="eyebrow text-paper/55">How it works</p>
        <p className="wide mt-2 text-[22px] font-black uppercase leading-tight">Three steps to the board</p>
      </div>
      <ol className="divide-y divide-line">
        {[
          ['01', 'Record walks and runs with your phone’s GPS.'],
          ['02', 'Distance is checked before it counts — no shortcuts.'],
          ['03', 'Join a challenge and climb its standings.'],
        ].map(([n, text]) => (
          <li key={n} className="flex gap-4 px-6 py-4">
            <span className="score w-7 text-[20px] text-track">{n}</span>
            <span className="pt-0.5 text-[15px] text-ink-2">{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
