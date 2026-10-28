import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProfile } from '../lib/queries';
import { VsBurst } from './Duel';
import { CrownIcon, DuelIcon, FinishFlagIcon } from './icons';
import { Avatar } from './ui';

const SEEN_KEY = 'jump_seen_duel_launch';

const seen = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* shows again next visit */ } };

const STEPS = [
  { icon: DuelIcon, text: 'Open any chat and tap the swords. Pick the distance and the clock.' },
  { icon: FinishFlagIcon, text: 'They hold to accept. You both tap Ready and the race goes live.' },
  { icon: CrownIcon, text: 'First there wins, or the farthest when time runs out. The win goes in your trophy cabinet.' },
];

/** The once-per-browser "Duels are live" pop: a fight poster with you in the orange corner. */
export function DuelLaunch() {
  const profile = useProfile();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (seen()) return;
    const timer = window.setTimeout(() => setOpen(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);

  if (!open) return null;
  function close() { markSeen(); setOpen(false); }
  const go = () => { close(); void navigate({ to: '/messages' }); };
  const me = profile.data;

  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center p-5" role="dialog" aria-modal="true" aria-label="Duels are live">
    <div className="absolute inset-0 animate-fade bg-black/70" onClick={close} />
    <div className="relative w-full max-w-[400px] animate-pop overflow-hidden rounded-2xl border-2 border-ink bg-[#141416] text-paper" style={{ boxShadow: '5px 5px 0 #E4FF3A' }}>
      <div className="relative overflow-hidden px-5 pb-5 pt-6 text-center">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true" style={{ background: 'radial-gradient(circle at 0 0, rgba(255,90,31,0.45), transparent 60%), radial-gradient(circle at 100% 100%, rgba(228,255,58,0.3), transparent 60%), repeating-linear-gradient(115deg, rgba(242,239,232,0.05) 0 10px, transparent 10px 46px)' }} />
        <span className="wide relative inline-block -rotate-[4deg] rounded border-2 border-ink bg-volt px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink">New on Jump</span>
        <div className="relative mt-5 flex items-center justify-center gap-1.5">
          <span className="flex h-[84px] w-[84px] items-center justify-center rounded-full border-4 border-track bg-ink">
            <Avatar name={me?.displayName ?? 'You'} src={me?.avatarUrl} size={72} className="rounded-full" />
          </span>
          <VsBurst size={84} />
          <span className="wide flex h-[84px] w-[84px] items-center justify-center rounded-full border-4 border-volt bg-[#1E1E21] text-[34px] font-black text-volt">?</span>
        </div>
        <p className="wide relative mt-4 text-[38px] font-black leading-[1.05] tracking-[-0.01em]">DUELS<br />ARE LIVE</p>
        <p className="relative mx-auto mt-2 max-w-[280px] text-[14px] leading-snug text-paper/75">Race anyone on Jump, head to head, wherever you both are.</p>
      </div>
      <div className="space-y-3 border-t border-paper/10 p-5 pt-4">
        {STEPS.map(({ icon: Icon, text }, index) => <div key={index} className="flex items-center gap-3">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-volt text-ink"><Icon size={18} /></span>
          <p className="text-[13.5px] font-medium leading-snug">{text}</p>
        </div>)}
        <button type="button" className="btn mt-2 w-full border-2 border-ink bg-volt text-ink hover:brightness-95" onClick={go}><DuelIcon size={18} />Challenge someone</button>
        <button type="button" className="wide mx-auto block p-1.5 text-[12px] font-extrabold uppercase tracking-[0.08em] text-paper/60 hover:text-paper" onClick={close}>Maybe later</button>
      </div>
    </div>
  </div>, document.body);
}
