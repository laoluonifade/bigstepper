import { Link, useNavigate } from '@tanstack/react-router';
import { RecommendedJoin } from '../components/CompeteHome';
import { PlusIcon } from '../components/icons';
import { useNow } from '../components/ui';
import { useUser } from '../lib/auth';
import { useUnit } from '../lib/queries';
import { skipOnboarding } from '../lib/onboarding';

/**
 * First stop after sign-up, and required: join at least one free competition (or start your own) so the
 * first run already counts. The app keeps bringing new runners back here until they're in one.
 */
export function WelcomePage() {
  const user = useUser();
  const unit = useUnit();
  const now = useNow(60_000);
  const navigate = useNavigate();
  const done = () => void navigate({ to: '/dashboard' });
  return <div className="mx-auto max-w-xl animate-rise">
    <p className="text-[13px] font-medium text-ink-3">Welcome{user.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}</p>
    <h1 className="mt-0.5 text-[26px] font-extrabold leading-tight tracking-tight">Join your first competition</h1>
    <p className="mt-2 text-[14px] text-ink-2">Jump is better with someone to beat. Pick at least one free competition to get started; your first run counts toward a rank straight away.</p>
    <div className="mt-6">
      <RecommendedJoin
        unit={unit} now={now} limit={8} title="Free to join" freeOnly onDone={done}
        // Nothing free to join yet: don't trap anyone on this page.
        empty={<div className="rounded-2xl border-[1.5px] border-dashed border-ink/30 px-4 py-8 text-center">
          <p className="text-[15px] font-bold">No open free competitions right now</p>
          <p className="mt-1 text-[13px] text-ink-3">Start one and invite your people, or look around first.</p>
          <button type="button" className="mt-4 text-[13px] font-semibold text-ink-2 underline underline-offset-4 hover:text-ink" onClick={() => { skipOnboarding(); done(); }}>Continue to Jump</button>
        </div>}
      />
    </div>
    <div className="mt-6 flex items-center gap-3 rounded-2xl border-[1.5px] border-ink bg-card px-4 py-3">
      <span className="min-w-0 flex-1 text-[13px] text-ink-2">Rather race your own people?</span>
      <Link to="/competitions/new" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-3.5 py-2 text-[13px] font-bold text-paper"><PlusIcon size={14} />Start one</Link>
    </div>
    <p className="mt-4 text-center text-[13px]"><Link to="/competitions" className="font-semibold text-ink-2 underline underline-offset-4 hover:text-ink">Browse all competitions</Link></p>
  </div>;
}
