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
    <div className="mx-auto max-w-5xl text-center">
      {/* Hero, centred. */}
      <section className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center py-12 sm:py-16">
        {/* As big as the screen allows: "COMPETE.", the widest line, is 6.44× the font size, inside 16px gutters. */}
        <h1 className="display text-[min(calc((100vw_-_32px)/6.5),124px)] leading-[0.86] tracking-[-0.055em]">
          <span className="reveal-line">
            <span>Move.</span>
          </span>
          <span className="reveal-line">
            <span className="[animation-delay:90ms]">Compete.</span>
          </span>
          <span className="reveal-line">
            <span className="whitespace-nowrap [animation-delay:180ms]">
              {/* A lemon highlight sweeps in behind "Win" once the lines are up, then the full stop pops. */}
              <span className="relative inline-block px-[0.06em]">
                <span className="absolute inset-x-0 bottom-[0.06em] top-[0.12em] -z-10 origin-left animate-grow-x bg-volt [animation-delay:620ms]" aria-hidden="true" />
                Win
              </span>
              <span className="inline-block animate-pop text-track [animation-delay:1100ms]">.</span>
            </span>
          </span>
        </h1>
        <p className="mt-7 max-w-xl animate-rise-lg text-[18px] leading-relaxed text-ink-2 [animation-delay:350ms] sm:text-[21px]">
          Turn your everyday walks, runs and rides into a race. Compete with friends, clubs and your city, climb the leaderboard, and win real prizes.
        </p>
        <div className="mt-8 flex w-full max-w-md animate-rise-lg flex-col gap-3 [animation-delay:480ms] sm:max-w-none sm:flex-row sm:justify-center">
          {/* The app is the point: the main button gets runners onto the iPhone beta. */}
          <a href={TESTFLIGHT} target="_blank" rel="noreferrer" className="btn-primary min-h-12 px-6">
            <svg className="-mt-0.5 shrink-0" viewBox="0 0 384 512" width="15" height="18" fill="currentColor" aria-hidden="true">
          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
        </svg>
            Download iOS beta
          </a>
          <Link to="/competitions" className="btn-secondary min-h-12 px-6">
            Explore competitions
          </Link>
        </div>
      </section>

      <div className="text-left">
        <OpenChallenges />
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

const TESTFLIGHT = 'https://testflight.apple.com/join/FTERY15d';

/** Real open challenges from the API; until there are any, an honest explainer instead of a mock-up. */
function OpenChallenges() {
  const tables = useTables();
  const now = Date.now();
  const open = (tables.data ?? []).filter((table) => canEnter(table, now)).slice(0, 2);

  if (tables.isLoading) return <Skeleton className="h-72 animate-fade" />;

  if (open.length > 0) {
    return (
      <div className="animate-slide-in [animation-delay:300ms]">
        <p className="eyebrow mb-3 text-center">Open for entry now</p>
        {/* Side by side from tablet up, stacked on phones. */}
        <div className="grid gap-4 md:grid-cols-2">
          {open.map((table) => (
            <CompetitionCard key={table.id} table={table} unit="km" now={now} />
          ))}
        </div>
        <Link to="/competitions" className="link mx-auto mt-4 block w-fit text-[14px]">
          See all competitions
        </Link>
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
