import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { durationLabel, EVENT_NOUN, posterTime, repeatRule, type ClubEvent } from '../lib/club-events';
import { onAccent } from './ClubEvents';
import { Modal } from './Modal';
import { cx } from './ui';

/** A QR code drawn as one SVG path: dark squares on white, with the quiet zone scanners need. */
export function QrCode({ value, size }: { value: string; size: number }) {
  const { d, count } = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(value);
    code.make();
    const modules = code.getModuleCount();
    let path = '';
    for (let row = 0; row < modules; row += 1) {
      for (let col = 0; col < modules; col += 1) if (code.isDark(row, col)) path += `M${col + 2} ${row + 2}h1v1h-1z`;
    }
    return { d: path, count: modules + 4 };
  }, [value]);
  return <svg width={size} height={size} viewBox={`0 0 ${count} ${count}`} role="img" aria-label={`QR code for ${value}`} shapeRendering="crispEdges">
    <rect width={count} height={count} fill="#FFFFFF" />
    <path d={d} fill="#121212" />
  </svg>;
}

/**
 * Someone's pass to an event, like a ticket: the club's colour band with what it is, when and where,
 * a tear line, then their name, pass code and a QR the host can check in. Stamped once they're in.
 */
export function EventPass({ event, holder, behind = 'bg-paper' }: { event: ClubEvent; holder: string; behind?: string }) {
  const pass = event.pass;
  const accent = event.club.accentColor || '#FF5A1F';
  const ink = onAccent(accent);
  if (!pass) return null;
  const label = 'wide block text-[9.5px] font-bold uppercase tracking-[0.1em] opacity-75';
  return <div className="overflow-hidden rounded-2xl border-2 border-ink bg-card text-ink">
    <div className="p-4 pb-[18px]" style={{ backgroundColor: accent, color: ink }}>
      <div className="wide flex items-center justify-between text-[11px] font-extrabold uppercase tracking-[0.08em]">
        <span className="truncate">{event.club.name} · Pass</span>
        <span>{EVENT_NOUN[event.activity]}</span>
      </div>
      <p className="wide mt-2.5 line-clamp-2 text-[24px] font-black uppercase leading-[1.1] tracking-[-0.01em]">{event.title}</p>
      <div className="mt-3.5 flex gap-3">
        <div className="min-w-0 flex-[1.2]"><span className={label}>Next</span><span className="mt-0.5 block truncate text-[15px] font-bold">{posterTime(event)}</span></div>
        <div className="min-w-0 flex-1"><span className={label}>Lasts</span><span className="mt-0.5 block text-[15px] font-bold">{durationLabel(event.durationMinutes)}</span></div>
      </div>
      <div className="mt-2.5"><span className={label}>Where</span><span className="mt-0.5 line-clamp-2 block text-[15px] font-bold">{event.venue}</span></div>
    </div>
    <div className="relative flex h-6 items-center bg-card" aria-hidden="true">
      <span className={cx('absolute -left-3 top-0 h-6 w-6 rounded-full border-2 border-ink', behind)} />
      <span className="mx-[18px] flex-1 border-t-2 border-dashed border-ink-3" />
      <span className={cx('absolute -right-3 top-0 h-6 w-6 rounded-full border-2 border-ink', behind)} />
    </div>
    <div className="relative flex items-center gap-3.5 bg-card px-4 pb-4 pt-1.5">
      <div className="min-w-0 flex-1 space-y-2.5">
        <div><span className="wide block text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-3">Pass holder</span><span className="mt-0.5 block truncate text-[17px] font-extrabold">{holder}</span></div>
        <div><span className="wide block text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-3">Pass code</span><span className="mt-0.5 block select-all font-mono text-[20px] tracking-[0.08em]">{pass.code}</span></div>
        <p className="line-clamp-2 text-[12px] leading-snug text-ink-2">{event.repeat === 'once' ? 'Show this at the start.' : `${repeatRule(event)}. One pass for every session.`}</p>
      </div>
      <div className="shrink-0 rounded-md border-[1.5px] border-ink bg-white p-1"><QrCode value={pass.code} size={112} /></div>
      {pass.checkedIn && <span className="score pointer-events-none absolute right-[18px] top-[30px] -rotate-12 rounded-md border-[3px] border-ink bg-volt px-2.5 py-0.5 text-[26px] text-ink opacity-95">CHECKED IN</span>}
    </div>
  </div>;
}

/** The pass, big, in a dialog: what you show at the start line. */
export function PassModal({ event, holder, onClose }: { event: ClubEvent; holder: string; onClose: () => void }) {
  return <Modal title="Your pass" onClose={onClose}>
    <p className="-mt-2 mb-4 text-[14px] leading-snug text-ink-2">Show this to the host when you arrive. They’ll check you in with the code or the QR.</p>
    <EventPass event={event} holder={holder} behind="bg-card" />
    <button type="button" className="btn-dark mt-4 w-full" onClick={onClose}>Done</button>
  </Modal>;
}
