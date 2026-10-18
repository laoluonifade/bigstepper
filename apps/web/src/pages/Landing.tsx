import { Link, Navigate } from '@tanstack/react-router';
import { ArrowRightIcon, RunIcon } from '../components/icons';
import { useAuth } from '../lib/auth';

export function LandingPage() {
  const { status } = useAuth();

  if (status === 'checking' || status === 'unreachable') return null;
  if (status === 'signed-in') return <Navigate to="/dashboard" replace />;

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

      <div className="panel-strong animate-rise overflow-hidden" aria-hidden="true">
        <div className="bg-ink px-6 py-8 text-paper">
          <p className="eyebrow text-paper/55">Your next challenge</p>
          <p className="score mt-3 text-[82px] leading-none text-volt">5.00</p>
          <p className="wide mt-1 text-[18px] font-black uppercase">kilometres</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
          <div className="p-5">
            <p className="eyebrow text-ink-3">Compete on</p>
            <p className="wide mt-2 text-[17px] font-black uppercase">Distance</p>
          </div>
          <div className="p-5">
            <p className="eyebrow text-ink-3">Verified by</p>
            <p className="wide mt-2 text-[17px] font-black uppercase">Your route</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-track text-ink"><RunIcon size={20} /></span>
          <p className="text-[13px] leading-relaxed text-ink-2"><span className="font-bold text-ink">Walk or run.</span> Your eligible activity moves you up the board.</p>
        </div>
      </div>
    </section>
  );
}
