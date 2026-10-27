import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { DuelActions } from '../components/Duel';
import { ArrowLeftIcon } from '../components/icons';
import { Avatar, cx, ErrorNotice, LiveDot, Loading, Notice, useNow } from '../components/ui';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { duelKey, duelLine, duelPhase, sides, standing, type DuelPerson, type DuelView } from '../lib/duels';
import { formatDistance } from '../lib/format';
import { useUnit } from '../lib/queries';

const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * One duel, for the two in it and anyone watching: the countdown, both runners' distance against the
 * target while it's live (about ten seconds behind), and the result. Recording happens in the app.
 */
export function DuelPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const user = useUser();
  const unit = useUnit();
  const duel = useQuery({
    queryKey: duelKey(id),
    queryFn: () => api<DuelView>(`/duels/${encodeURIComponent(id)}`),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const phase = duelPhase(data);
      return phase === 'live' || phase === 'countdown' || phase === 'settling' ? 4_000 : phase === 'pending' || phase === 'accepted' ? 8_000 : false;
    },
  });
  const data = duel.data;
  const now = useNow(250, data?.status === 'LIVE');
  // This browser's clock, corrected to the server's, so the countdown matches both phones.
  const skew = data ? new Date(data.now).getTime() - duel.dataUpdatedAt : 0;
  const serverNow = now + skew;

  const back = <Link to="/messages" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink"><ArrowLeftIcon size={16} /> Messages</Link>;
  if (duel.isLoading) return <div className="mx-auto max-w-[600px]">{back}<Loading /></div>;
  if (!data) return <div className="mx-auto max-w-[600px]">{back}<ErrorNotice error={duel.error} onRetry={() => void duel.refetch()} /><Notice tone="neutral" title="Couldn’t load this duel">It may have been removed, or you’re offline.</Notice></div>;

  const phase = duelPhase(data, serverNow);
  const side = sides(data, user.id);
  const standings = standing(data);
  const leader = standings.challenger.metres === standings.opponent.metres ? null : standings.challenger.metres > standings.opponent.metres ? data.challengerId : data.opponentId;
  const startsIn = data.startsAt ? new Date(data.startsAt).getTime() - serverNow : 0;
  const endsIn = data.endsAt ? new Date(data.endsAt).getTime() - serverNow : 0;
  const box = 'flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-ink px-4 py-6 text-center';

  const lane = (who: 'challenger' | 'opponent', runner: DuelPerson) => {
    const mine = runner.userId === user.id;
    const { metres, reachedAt } = standings[who];
    const share = Math.min(1, metres / data.targetMetres);
    const won = phase === 'finished' && data.winnerId === runner.userId;
    const ahead = (phase === 'live' || phase === 'settling') && leader === runner.userId;
    return <div className={cx('space-y-3 rounded-2xl bg-card p-3.5', won || ahead ? 'border-2 border-ink' : 'border-[1.5px] border-line')}>
      <div className="flex items-center gap-2.5">
        <Avatar name={runner.displayName} src={runner.avatarUrl} avatarStyle={runner.avatarStyle} size={40} className="rounded-full" />
        <div className="min-w-0 flex-1 leading-tight">
          <Link to="/runners/$username" params={{ username: runner.username }} search={{}} className="block truncate text-[15px] font-bold hover:underline">{mine ? 'You' : runner.displayName}</Link>
          <span className="block truncate text-[12px] text-ink-3">{won ? '🏆 Winner' : reachedAt ? `Reached ${formatDistance(data.targetMetres, unit)}` : ahead ? 'In front' : `@${runner.username}`}</span>
        </div>
        <span className="score num text-[30px]">{formatDistance(metres, unit)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-md bg-ink/10" role="progressbar" aria-label={`${mine ? 'Your' : `${runner.displayName}’s`} distance`} aria-valuemin={0} aria-valuemax={data.targetMetres} aria-valuenow={Math.min(metres, data.targetMetres)}>
        <div className={cx('h-full rounded-md transition-[width] duration-700 ease-out', who === 'challenger' ? 'bg-track' : 'bg-volt')} style={{ width: `${Math.max(share * 100, metres > 0 ? 2 : 0)}%` }} />
      </div>
    </div>;
  };

  return <div className="mx-auto max-w-[600px] animate-rise">
    {back}
    <header className="mb-5">
      <p className="eyebrow mb-2 flex items-center gap-2">{phase === 'live' && <LiveDot live className="text-track" />}⚔️ {data.challenger.displayName.split(' ')[0]} vs {data.opponent.displayName.split(' ')[0]}</p>
      <h1 className="display text-[30px] sm:text-[40px]">{duelLine(data, unit)}</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-2">First to the distance wins. If nobody gets there, the farthest when time’s up wins.</p>
    </header>

    <div className="space-y-4">
      {phase === 'countdown' && <div className={cx(box, 'bg-volt text-ink')} role="timer" aria-live="assertive">
        <span key={Math.ceil(startsIn / 1000)} className="score num animate-pop text-[96px]">{startsIn > 1000 ? Math.ceil(startsIn / 1000) : 'GO'}</span>
        <span className="wide text-[12px] font-extrabold uppercase tracking-[0.12em]">Start moving</span>
      </div>}
      {phase === 'live' && <div className={cx(box, 'bg-ink text-paper')} role="timer">
        <span className="score num text-[64px]">{clock(endsIn)}</span>
        <span className="wide text-[12px] font-extrabold uppercase tracking-[0.12em] text-volt">Left on the clock</span>
      </div>}
      {phase === 'settling' && <div className={cx(box, 'bg-card')}>
        <span className="wide text-[14px] font-extrabold uppercase tracking-[0.12em]">Time’s up</span>
        <span className="text-[13px] text-ink-2">Counting the last metres from both phones…</span>
      </div>}
      {phase === 'finished' && <div className={cx(box, data.winnerId ? 'bg-volt text-ink' : 'bg-card')}>
        <span className="display text-[26px]">
          {data.winnerId === null ? 'It’s a draw' : data.winnerId === user.id ? 'You won 🏆' : `${(data.winnerId === data.challengerId ? data.challenger : data.opponent).displayName.split(' ')[0]} won 🏆`}
        </span>
        {data.winnerId === user.id && <span className="text-[13px]">It’s in your trophy cabinet.</span>}
      </div>}
      {(phase === 'declined' || phase === 'cancelled' || phase === 'expired') && <div className={cx(box, 'bg-card')}>
        <span className="wide text-[14px] font-extrabold uppercase tracking-[0.12em]">{phase === 'declined' ? 'Declined' : phase === 'cancelled' ? 'Called off' : 'Expired'}</span>
        <span className="text-[13px] text-ink-2">{phase === 'expired' ? 'Nobody got it started in time.' : 'This duel won’t go ahead.'}</span>
      </div>}

      {lane('challenger', data.challenger)}
      {lane('opponent', data.opponent)}

      {side && (phase === 'accepted' || phase === 'countdown' || phase === 'live') && <Notice tone="neutral" title="Record it in the Jump app">Only what you record during the duel counts. Keep recording until the clock runs out.</Notice>}
      <DuelActions duel={data} viewerId={user.id} size="md" />
      {side && <Link to="/messages/$username" params={{ username: side.them.username }} className="btn-quiet w-full">Message {side.them.displayName.split(' ')[0]}</Link>}
    </div>
  </div>;
}
