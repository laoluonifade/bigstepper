import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { post } from '../lib/api';
import { duelKey, duelLine, duelPhase, isReady, sides, standing, type Duel, type DuelActivity } from '../lib/duels';
import { formatDistance } from '../lib/format';
import { useUser } from '../lib/auth';
import { useProfile } from '../lib/queries';
import { toast } from '../lib/toast';
import type { AvatarStyle, Unit } from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { CrownIcon, DuelIcon } from './icons';
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
      className="relative flex h-[54px] w-full touch-none select-none items-center justify-center overflow-hidden rounded-xl border-2 border-ink bg-volt disabled:opacity-50"
      onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture?.(event.pointerId); start(); }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onBlur={stop}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => { if (!holdKey(event.key)) return; event.preventDefault(); if (!event.repeat) start(); }}
      onKeyUp={(event) => { if (!holdKey(event.key)) return; event.preventDefault(); stop(); }}
      onClick={(event) => { if (event.detail === 0 && timer.current === null) ask({ title: label, confirmLabel: label.replace(/^Hold to (\w)/i, (_, first: string) => first.toUpperCase()), onConfirm: () => confirm.current() }); }}>
      <span className="absolute inset-y-0 left-0 bg-track ease-linear" style={{ width: holding ? '100%' : '0%', transitionProperty: 'width', transitionDuration: holding ? `${HOLD_MS}ms` : '180ms' }} aria-hidden="true" />
      <span className="wide relative text-[14px] font-black uppercase tracking-[0.08em] text-ink">{label}</span>
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

const PHASE_LABEL = { pending: 'Challenge', accepted: 'Accepted', countdown: 'Starting', live: 'Live', settling: 'Finishing', finished: 'Final', declined: 'Declined', cancelled: 'Called off', expired: 'Expired' } as const;
const RING = { challenger: 'border-track', opponent: 'border-volt' } as const;
const TAG = { challenger: 'bg-track', opponent: 'bg-volt' } as const;
const VERB: Record<DuelActivity, string> = { run: 'Run', walk: 'Walk', cycle: 'Ride', any: 'Move' };

/** The jagged orange burst behind "VS". */
export function VsBurst({ size }: { size: number }) {
  const points = Array.from({ length: 24 }, (_, index) => {
    const r = index % 2 ? size * 0.36 : size * 0.5;
    const angle = (Math.PI * 2 * index) / 24 - Math.PI / 2;
    return `${(size / 2 + r * Math.cos(angle)).toFixed(1)},${(size / 2 + r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
  return <span className="relative flex shrink-0 -rotate-[8deg] items-center justify-center" style={{ width: size, height: size }}>
    <svg width={size} height={size} className="absolute inset-0" aria-hidden="true"><polygon points={points} fill="#FF4D12" stroke="#121212" strokeWidth={2} strokeLinejoin="round" /></svg>
    <span className="wide relative font-black tracking-[-0.02em] text-ink" style={{ fontSize: size * 0.3 }}>VS</span>
  </span>;
}

/** Speed lanes and two glows, orange from one corner and volt from the other: the arena's floor. */
export function ArenaBackdrop() {
  return <span className="pointer-events-none absolute inset-0" aria-hidden="true" style={{
    background: 'radial-gradient(circle at 0 0, rgba(255,77,18,0.45), transparent 62%), radial-gradient(circle at 100% 100%, rgba(228,255,58,0.3), transparent 62%), repeating-linear-gradient(110deg, rgba(242,239,232,0.06) 0 10px, transparent 10px 46px)',
  }} />;
}

/**
 * The two of them squared up: faces in their colours either side of a VS burst, the challenge on a tilted
 * sticker, and once it's going, a tug-of-war bar of who's pulling ahead. Always dark, like a fight poster.
 */
export function DuelArena({ duel, viewerId, unit, big = false, live }: { duel: Duel; viewerId: string; unit: Unit; big?: boolean; live?: { challenger: number; opponent: number } }) {
  const phase = duelPhase(duel);
  const done = standing(duel);
  const metres = live ?? (phase === 'finished' ? { challenger: done.challenger.metres, opponent: done.opponent.metres } : null);
  const face = big ? 84 : 58;
  const [amount, measure] = formatDistance(duel.targetMetres, unit).split(' ');
  const lit = phase === 'live' || phase === 'countdown';
  const fighter = (who: 'challenger' | 'opponent', tilt: number) => {
    const runner = duel[who];
    const won = phase === 'finished' && duel.winnerId === runner.userId;
    const lost = phase === 'finished' && duel.winnerId !== null && !won;
    return <div className={cx('flex min-w-0 flex-1 flex-col items-center', lost && 'opacity-45')}>
      <span className={cx('flex items-end justify-center text-volt', big ? 'h-8' : 'h-[22px]')}>{won && <CrownIcon size={big ? 26 : 18} />}</span>
      <span className={cx('rounded-full p-0.5', RING[who], big ? 'border-4' : 'border-[3px]')} style={{ transform: `rotate(${tilt}deg)` }}>
        <Avatar name={runner.displayName} src={runner.avatarUrl} avatarStyle={runner.avatarStyle} size={face} className="rounded-full" />
      </span>
      <span className={cx('wide -mt-2 max-w-[92%] truncate rounded-[7px] border-[1.5px] border-ink px-2 py-0.5 text-[10.5px] font-black uppercase tracking-[0.04em] text-ink', TAG[who])} style={{ transform: `rotate(${-tilt}deg)` }}>
        {runner.userId === viewerId ? 'You' : runner.displayName.split(' ')[0]}
      </span>
      {metres && <span className={cx('score num mt-1 text-paper', big ? 'text-[30px]' : 'text-[22px]')}>{formatDistance(metres[who], unit)}</span>}
    </div>;
  };
  const total = metres ? metres.challenger + metres.opponent : 0;
  return <div className={cx('relative overflow-hidden border-2 border-ink bg-ink p-3.5 text-paper', big ? 'rounded-[22px] py-[18px]' : 'rounded-[18px]')}>
    <ArenaBackdrop />
    <div className="relative flex items-center justify-between gap-2">
      <span className="wide inline-flex -rotate-3 items-center gap-1.5 rounded-lg bg-volt px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-ink"><DuelIcon size={13} strokeWidth={2.6} />Duel</span>
      <span className={cx('wide inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[9.5px] font-extrabold uppercase tracking-[0.06em]', lit ? 'bg-track text-ink' : phase === 'finished' ? 'bg-volt text-ink' : 'bg-paper/[0.14] text-paper')}>
        {phase === 'live' && <LiveDot live className="h-[7px] w-[7px]" />}{PHASE_LABEL[phase]}
      </span>
    </div>
    <div className="relative mt-1.5 flex items-start">
      {fighter('challenger', -4)}
      <span className={big ? 'mt-11' : 'mt-[30px]'}><VsBurst size={big ? 70 : 52} /></span>
      {fighter('opponent', 4)}
    </div>
    <div className={cx('relative flex justify-center', big ? 'mt-4' : 'mt-2.5')}>
      <span className="flex -rotate-2 items-baseline gap-2 rounded-[14px] border-[1.5px] border-ink bg-volt px-4 py-1.5 text-ink shadow-[4px_4px_0_#121212]">
        <span className={cx('score num', big ? 'text-[46px]' : 'text-[34px]')}>{amount}<span className={big ? 'text-[22px]' : 'text-[16px]'}> {measure}</span></span>
        <span className="wide whitespace-pre text-[10px] font-black uppercase leading-[12px] tracking-[0.06em]">{`${VERB[duel.activity]}\n${duel.minutes} min`}</span>
      </span>
    </div>
    {metres && <div className="relative mt-3.5 flex h-3 overflow-hidden rounded-md border-[1.5px] border-paper">
      <span className="bg-track transition-[flex-grow] duration-700" style={{ flexGrow: total ? Math.max(metres.challenger, total * 0.04) : 1 }} />
      <span className="w-[3px] bg-ink" />
      <span className="bg-volt transition-[flex-grow] duration-700" style={{ flexGrow: total ? Math.max(metres.opponent, total * 0.04) : 1 }} />
    </div>}
    {phase === 'finished' && duel.winnerId === null && <p className="wide relative mt-3 text-center text-[12px] font-black uppercase tracking-[0.08em]">It’s a draw</p>}
    {!big && (lit || phase === 'settling') && <p className="wide relative mt-3 text-center text-[12px] font-black uppercase tracking-[0.08em] text-volt">Tap to watch it live →</p>}
  </div>;
}

/** A duel in a chat or the feed: the arena, then whatever it needs from you. Clicking it opens the duel. */
export function DuelCard({ duel, viewerId, unit, actions = true, className }: { duel: Duel; viewerId: string; unit: Unit; actions?: boolean; className?: string }) {
  return <div className={cx('relative min-w-[260px] text-left text-ink', className)}>
    <Link to="/duels/$id" params={{ id: duel.id }} className="block transition-transform hover:-translate-y-0.5 active:scale-[0.99]" aria-label={`Open duel: ${duelLine(duel, unit)}`}>
      <DuelArena duel={duel} viewerId={viewerId} unit={unit} />
    </Link>
    {actions && <DuelActions duel={duel} viewerId={viewerId} />}
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
        className={cx('rounded-full px-3.5 py-2 transition-[transform,colors]', on ? 'wide -rotate-2 border-2 border-ink bg-volt text-[13px] font-black text-ink' : 'border-[1.5px] border-line bg-card text-[14px] font-bold text-ink hover:border-ink')}>
        {text}
      </button>;
    })}
  </div>;
}

/** Set up a duel from a DM: what, how far and how long. It lands in the chat with a hold-to-accept. */
export function DuelComposer({ onClose, username, name, avatarUrl = null, avatarStyle, unit, onSent }: { onClose: () => void; username: string; name: string; avatarUrl?: string | null; avatarStyle?: AvatarStyle; unit: Unit; onSent?: () => void }) {
  const user = useUser();
  const profile = useProfile().data;
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
      <DuelArena viewerId={user.id} unit={unit} duel={{
        id: 'preview', status: 'PENDING', activity, targetMetres: valid ? Math.round(distance * 1000) : 5_000, minutes: valid ? time : 30,
        challengerId: user.id, opponentId: 'them',
        challenger: { userId: user.id, username: profile?.username ?? '', displayName: profile?.displayName ?? 'You', avatarUrl: profile?.avatarUrl ?? null, avatarStyle: profile?.gender === 'male' ? 'masculine' : profile?.gender === 'female' ? 'feminine' : 'neutral' },
        opponent: { userId: 'them', username, displayName: name, avatarUrl, avatarStyle },
        acceptedAt: null, challengerReadyAt: null, opponentReadyAt: null, startsAt: null, endsAt: null, expiresAt: '', settledAt: null,
        challengerMetres: null, opponentMetres: null, challengerReachedAt: null, opponentReachedAt: null, winnerId: null,
      }} />
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
