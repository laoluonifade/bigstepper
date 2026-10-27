import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { post } from '../lib/api';
import { duelKey, duelLine, duelPhase, isReady, sides, standing, type Duel, type DuelActivity } from '../lib/duels';
import { formatDistance } from '../lib/format';
import { toast } from '../lib/toast';
import type { Unit } from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { Modal } from './Modal';
import { Avatar, cx, ErrorNotice, LiveDot } from './ui';

const HOLD_MS = 1_200;

/**
 * Press and hold to confirm: the button fills while held (pointer, or Space/Enter held down) and fires
 * once it's full. Letting go early drains it, so a stray click never commits. A screen reader's click,
 * which can't be held, gets a confirm dialog instead.
 */
export function HoldButton({ label, onConfirm, disabled }: { label: string; onConfirm: () => void; disabled?: boolean }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const confirm = useRef(onConfirm);
  confirm.current = onConfirm;
  const { dialog, ask } = useConfirm();
  function start() {
    if (disabled || timer.current !== null) return;
    setHolding(true);
    timer.current = window.setTimeout(() => { timer.current = null; setHolding(false); confirm.current(); }, HOLD_MS);
  }
  function stop() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  const holdKey = (key: string) => key === ' ' || key === 'Enter';
  return <>
    <button type="button" disabled={disabled} aria-label={`${label}. Press and hold to confirm`} title="Press and hold to confirm"
      className="relative flex h-12 w-full touch-none select-none items-center justify-center overflow-hidden rounded-xl border-2 border-ink bg-paper disabled:opacity-50"
      onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture?.(event.pointerId); start(); }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onBlur={stop}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => { if (!holdKey(event.key)) return; event.preventDefault(); if (!event.repeat) start(); }}
      onKeyUp={(event) => { if (!holdKey(event.key)) return; event.preventDefault(); stop(); }}
      onClick={(event) => { if (event.detail === 0 && timer.current === null) ask({ title: label, confirmLabel: label.replace(/^Hold to (\w)/i, (_, first: string) => first.toUpperCase()), onConfirm: () => confirm.current() }); }}>
      <span className="absolute inset-y-0 left-0 bg-volt ease-linear" style={{ width: holding ? '100%' : '0%', transitionProperty: 'width', transitionDuration: holding ? `${HOLD_MS}ms` : '180ms' }} aria-hidden="true" />
      <span className="wide relative text-[13px] font-extrabold uppercase tracking-[0.06em] text-ink">{label}</span>
    </button>
    {dialog}
  </>;
}

/** Accept, decline, cancel or get ready: whatever this duel needs from the viewer next. */
export function DuelActions({ duel, viewerId, size = 'sm' }: { duel: Duel; viewerId: string; size?: 'sm' | 'md' }) {
  const queryClient = useQueryClient();
  const side = sides(duel, viewerId);
  const act = useMutation({
    mutationFn: (action: 'accept' | 'decline' | 'cancel' | 'ready') => post<{ status: string }>(`/duels/${duel.id}/${action}`),
    onSuccess(result, action) {
      if (action === 'ready' && result.status !== 'LIVE') toast({ tone: 'ok', message: `${side?.them.displayName ?? 'They'} will get a ping. It starts when they’re ready too.` });
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: duelKey(duel.id) });
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['feed-post'] });
    },
  });
  if (!side) return null;
  const phase = duelPhase(duel);
  const waitingOn = side.them.displayName.split(' ')[0];
  const small = size === 'sm' && 'btn-sm';
  let body = null;
  if (phase === 'pending' && !side.challenger) {
    body = <div className="space-y-2">
      <HoldButton label="Hold to accept" disabled={act.isPending} onConfirm={() => act.mutate('accept')} />
      <button type="button" className={cx('btn-quiet w-full', small)} disabled={act.isPending} onClick={() => act.mutate('decline')}>Decline</button>
    </div>;
  } else if (phase === 'pending') {
    body = <div className="flex items-center justify-between gap-2">
      <p className="min-w-0 flex-1 text-[13px] text-ink-2">Waiting for {waitingOn} to accept</p>
      <button type="button" className="btn-quiet btn-sm" disabled={act.isPending} onClick={() => act.mutate('cancel')}>Cancel</button>
    </div>;
  } else if (phase === 'accepted') {
    const meReady = isReady(side.mineReady);
    const themReady = isReady(side.theirsReady);
    body = <div className="space-y-2">
      <p className="text-[13px] text-ink-2">{meReady ? `You’re ready. Waiting for ${waitingOn}…` : themReady ? `${waitingOn} is ready. Tap to start the clock.` : 'Tap when you’re dressed and outside. It starts once you’re both ready.'}</p>
      {!meReady && <button type="button" className={cx('btn w-full border-2 border-ink bg-volt text-ink shadow-hard active:translate-x-[3px] active:translate-y-[3px] active:shadow-none', small)} disabled={act.isPending} onClick={() => act.mutate('ready')}>{act.isPending ? 'Getting ready…' : 'I’m ready'}</button>}
    </div>;
  }
  if (!body) return null;
  return <div className="mt-3">{body}<ErrorNotice error={act.error} /></div>;
}

const PHASE_LABEL = { pending: 'Challenge', accepted: 'Accepted', countdown: 'Starting', live: 'Live', settling: 'Finishing', finished: 'Final', declined: 'Declined', cancelled: 'Cancelled', expired: 'Expired' } as const;

/** A duel as a card: what it is, who's in it and where it stands. Clicking it opens the duel. */
export function DuelCard({ duel, viewerId, unit, actions = true, className }: { duel: Duel; viewerId: string; unit: Unit; actions?: boolean; className?: string }) {
  const phase = duelPhase(duel);
  const done = standing(duel);
  const running = phase === 'live' || phase === 'countdown';
  const person = (who: 'challenger' | 'opponent') => {
    const runner = duel[who];
    const won = phase === 'finished' && duel.winnerId === runner.userId;
    return <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
      <span className={cx('rounded-full p-px', won ? 'border-[3px] border-volt ring-[1.5px] ring-ink' : 'border-[1.5px] border-line')}>
        <Avatar name={runner.displayName} src={runner.avatarUrl} avatarStyle={runner.avatarStyle} size={44} className="rounded-full" />
      </span>
      <span className="block w-full truncate text-[13px] font-bold">{runner.userId === viewerId ? 'You' : runner.displayName.split(' ')[0]}</span>
      {phase === 'finished' && <span className="score num text-[18px]">{formatDistance(done[who].metres, unit)}</span>}
      {won && <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">🏆 Winner</span>}
    </div>;
  };
  return <div className={cx('relative min-w-[240px] rounded-2xl border-[1.5px] border-ink bg-card p-3.5 text-left text-ink', className)}>
    <Link to="/duels/$id" params={{ id: duel.id }} className="absolute inset-0 rounded-2xl" aria-label={`Open duel: ${duelLine(duel, unit)}`} />
    <div className="flex items-center justify-between gap-2">
      <p className="wide text-[11px] font-extrabold uppercase tracking-[0.12em]">⚔️ Duel</p>
      <span className={cx('wide inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.08em]', running ? 'bg-track text-paper' : phase === 'finished' ? 'bg-volt text-ink' : 'bg-ink/[0.07] text-ink')}>
        {phase === 'live' && <LiveDot live className="h-[7px] w-[7px]" />}
        {PHASE_LABEL[phase]}
      </span>
    </div>
    <p className="score mt-1.5 truncate text-[26px]">{duelLine(duel, unit)}</p>
    <div className="mt-2.5 flex items-start justify-between gap-2">
      {person('challenger')}
      <span className="wide mt-3.5 text-[16px] font-black text-track">VS</span>
      {person('opponent')}
    </div>
    {phase === 'finished' && duel.winnerId === null && <p className="mt-1.5 text-center text-[13px] font-semibold">It’s a draw</p>}
    {(running || phase === 'settling') && <p className="mt-2 text-center text-[13px] font-semibold underline">Watch it live</p>}
    {actions && <div className="relative z-[1]"><DuelActions duel={duel} viewerId={viewerId} /></div>}
  </div>;
}

const ACTIVITIES: Array<[DuelActivity, string]> = [['run', 'Run'], ['walk', 'Walk'], ['cycle', 'Ride'], ['any', 'Any']];
const DISTANCES = [1, 3, 5, 10];
const MINUTES = [15, 30, 45, 60];

function Chips<T extends string | number>({ options, value, onChange, label }: { options: Array<[T, string]>; value: T | null; onChange: (value: T) => void; label: string }) {
  return <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
    {options.map(([option, text]) => {
      const on = option === value;
      return <button key={String(option)} type="button" role="radio" aria-checked={on} onClick={() => onChange(option)}
        className={cx('rounded-full border-[1.5px] px-3.5 py-2 text-[14px] font-bold transition-colors', on ? 'border-ink bg-ink text-paper' : 'border-line bg-card text-ink hover:border-ink')}>
        {text}
      </button>;
    })}
  </div>;
}

/** Set up a duel from a DM: what, how far and how long. It lands in the chat with a hold-to-accept. */
export function DuelComposer({ onClose, username, name, unit, onSent }: { onClose: () => void; username: string; name: string; unit: Unit; onSent?: () => void }) {
  const [activity, setActivity] = useState<DuelActivity>('run');
  const [km, setKm] = useState<number | null>(5);
  const [customKm, setCustomKm] = useState('');
  const [minutes, setMinutes] = useState<number | null>(30);
  const [customMinutes, setCustomMinutes] = useState('');
  const first = name.split(' ')[0];
  const distance = km ?? Number(customKm.replace(',', '.'));
  const time = minutes ?? Number(customMinutes);
  const valid = Boolean(km ?? customKm) && Number.isFinite(distance) && distance >= 0.5 && distance <= 200 && Boolean(minutes ?? customMinutes) && Number.isInteger(time) && time >= 5 && time <= 600;
  const send = useMutation({
    mutationFn: () => post<{ id: string }>('/duels', { username, activity, targetMetres: Math.round(distance * 1000), minutes: time }),
    onSuccess() {
      toast({ tone: 'ok', message: `Duel sent. ${first} gets a push and an email.` });
      onClose();
      onSent?.();
    },
  });
  return <Modal title={`Duel ${first}`} onClose={onClose}>
    <p className="-mt-2 mb-4 text-[13px] leading-snug text-ink-2">First to the distance wins. If time runs out, whoever went farthest wins. The winner gets it in their trophy cabinet.</p>
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="eyebrow">Activity</p>
        <Chips options={ACTIVITIES} value={activity} onChange={setActivity} label="Activity" />
      </div>
      <div className="space-y-2">
        <p className="eyebrow">Distance</p>
        <Chips options={DISTANCES.map((value) => [value, `${value} km`] as [number, string])} value={km} onChange={(value) => { setKm(value); setCustomKm(''); }} label="Distance" />
        <input className="field num" type="text" inputMode="decimal" placeholder="Other distance in km" aria-label="Other distance in kilometres" value={customKm} onChange={(event) => { setCustomKm(event.target.value.replace(/[^\d.,]/g, '')); setKm(null); }} />
      </div>
      <div className="space-y-2">
        <p className="eyebrow">Time limit</p>
        <Chips options={MINUTES.map((value) => [value, `${value} min`] as [number, string])} value={minutes} onChange={(value) => { setMinutes(value); setCustomMinutes(''); }} label="Time limit" />
        <input className="field num" type="text" inputMode="numeric" placeholder="Other time in minutes" aria-label="Other time in minutes" value={customMinutes} onChange={(event) => { setCustomMinutes(event.target.value.replace(/\D/g, '')); setMinutes(null); }} />
      </div>
      <ErrorNotice error={send.error} />
    </div>
    <button type="button" className="btn-primary mt-5 w-full" disabled={!valid || send.isPending} onClick={() => send.mutate()}>
      {send.isPending ? 'Sending…' : valid ? `Send · ${duelLine({ activity, targetMetres: Math.round(distance * 1000), minutes: time }, unit)}` : 'Send duel'}
    </button>
  </Modal>;
}
