import { Link, useNavigate } from '@tanstack/react-router';
import { RecommendedJoin } from '../components/CompeteHome';
import { useNow } from '../components/ui';
import { useUser } from '../lib/auth';
import { useUnit } from '../lib/queries';

/** First stop after sign-up: get into competitions before anything else, so the first run already counts. */
export function WelcomePage() {
  const user = useUser();
  const unit = useUnit();
  const now = useNow(60_000);
  const navigate = useNavigate();
  const done = () => void navigate({ to: '/dashboard' });
  return <div className="mx-auto max-w-xl animate-rise">
    <p className="text-[13px] font-medium text-ink-3">Welcome{user.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}</p>
    <h1 className="mt-0.5 text-[26px] font-extrabold leading-tight tracking-tight">Pick your first competitions</h1>
    <p className="mt-2 text-[14px] text-ink-2">Jump is better with someone to beat. Join a few and your first run already counts toward a rank.</p>
    <div className="mt-6">
      <RecommendedJoin unit={unit} now={now} limit={8} title="Ready for you" onDone={done} />
    </div>
    <div className="mt-5 flex items-center justify-between gap-3 text-[13px]">
      <Link to="/competitions" className="font-bold underline decoration-2 underline-offset-4">Browse everything</Link>
      <button type="button" className="font-semibold text-ink-2 hover:text-ink" onClick={done}>Skip for now</button>
    </div>
  </div>;
}
