import { useMutation } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { isApiError, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { calendarFile, savePass, type ClubEvent, type Registration, type TicketType } from '../lib/club-events';
import { useProfile } from '../lib/queries';
import { PhoneField, splitNumber } from './CountryPicker';
import { EventPass } from './EventPass';
import { CalendarIcon, CheckIcon, TicketIcon } from './icons';
import { Modal } from './Modal';
import { cx } from './ui';

const FREE: TicketType = { id: 'free', name: 'Free pass', description: null, priceMinor: 0, currency: 'NGN', capacity: null, remaining: null };

function price(ticket: TicketType) {
  if (!ticket.priceMinor) return 'Free';
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: ticket.currency, maximumFractionDigits: 0 }).format(ticket.priceMinor / 100);
}

/**
 * Getting a pass, the way any ticket site works: pick the ticket, say who it's for, done. Nobody signs in
 * or makes a password: Jump keeps the pass in an account made from these details, and emails it.
 * Signed-in runners see their details filled in and only confirm.
 */
export function GetPassSheet({ event, onClose, onIssued }: { event: ClubEvent; onClose: () => void; onIssued: (result: Registration) => void }) {
  const { user } = useAuth();
  const profile = useProfile().data;
  const tickets = event.tickets?.length ? event.tickets : [FREE];
  const [ticketId, setTicketId] = useState(tickets[0].id);
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [marketing, setMarketing] = useState(false);
  const [result, setResult] = useState<Registration | null>(null);
  const savedPhone = profile?.whatsappNumber ?? '';
  const ticket = ticketId === FREE.id ? {} : { ticketTypeId: ticketId };

  const register = useMutation({
    mutationFn: () => post<Registration>(`/events/${event.id}/register`, user
      ? { ...(phone && phone !== savedPhone ? { phone } : {}), marketing, ...ticket }
      : { firstName: firstName.trim(), email: email.trim(), ...(phone ? { phone, countryCode: splitNumber(phone, 'NG').country } : {}), marketing, ...ticket }),
    onSuccess(next) {
      setResult(next);
      if (next.status === 'issued' && !user) savePass(event.id, { code: next.pass.code, holder: next.holder ?? firstName.trim() });
      onIssued(next);
    },
  });

  const ready = user ? true : firstName.trim().length > 0 && /^\S+@\S+\.\S+$/.test(email.trim()) && phone.length >= 9;
  const submit = (formEvent: FormEvent) => { formEvent.preventDefault(); if (ready && !register.isPending) register.mutate(); };

  if (result) return <PassIssued event={event} result={result} onClose={onClose} />;
  const soldOut = (ticket: TicketType) => ticket.remaining === 0;

  return <Modal title="Get your pass" onClose={onClose}>
    <form onSubmit={submit} className="space-y-5">
      <fieldset>
        <legend className="label">Ticket</legend>
        <div className="space-y-2" role="radiogroup">
          {tickets.map((ticket) => <button key={ticket.id} type="button" role="radio" aria-checked={ticket.id === ticketId} disabled={soldOut(ticket)} onClick={() => setTicketId(ticket.id)}
            className={cx('flex w-full items-center gap-3 rounded-xl border-2 p-3.5 text-left transition-colors disabled:opacity-50', ticket.id === ticketId ? 'border-ink bg-volt/40 shadow-hard-sm' : 'border-line bg-card hover:border-ink')}>
            <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-ink', ticket.id === ticketId && 'bg-ink text-paper')}>{ticket.id === ticketId && <CheckIcon size={12} />}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold">{ticket.name}</span>
              <span className="block text-[12.5px] text-ink-2">{soldOut(ticket) ? 'Sold out' : ticket.description ?? (ticket.remaining != null ? `${ticket.remaining} left` : 'Entry, a reminder the day before, and check-in at the start')}</span>
            </span>
            <span className="wide shrink-0 text-[15px] font-black uppercase">{price(ticket)}</span>
          </button>)}
        </div>
      </fieldset>

      {user ? <div className="rounded-xl border-[1.5px] border-line bg-paper p-3.5">
        <p className="text-[12px] font-semibold text-ink-3">Booking as</p>
        <p className="truncate text-[15px] font-bold">{profile?.displayName ?? user.displayName}</p>
        <p className="truncate text-[13px] text-ink-2">{user.email}</p>
        {!savedPhone && <div className="mt-3"><label className="label" htmlFor="pass-phone">Phone <span className="font-normal text-ink-3">Optional</span></label><PhoneField id="pass-phone" value={phone} onChange={setPhone} /></div>}
      </div>
        : <fieldset className="space-y-3.5">
          <legend className="label">Who’s it for</legend>
          <div>
            <label className="sr-only" htmlFor="pass-first">First name</label>
            <input id="pass-first" className="field" autoComplete="given-name" maxLength={60} required value={firstName} onChange={(changeEvent) => setFirstName(changeEvent.target.value)} placeholder="First name" />
          </div>
          <div>
            <label className="sr-only" htmlFor="pass-email">Email</label>
            <input id="pass-email" className="field" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required value={email} onChange={(changeEvent) => setEmail(changeEvent.target.value)} placeholder="Email (your pass goes here)" />
          </div>
          <div>
            <label className="sr-only" htmlFor="pass-phone">Phone number</label>
            <PhoneField id="pass-phone" value={phone} onChange={setPhone} required />
          </div>
        </fieldset>}

      <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-snug text-ink-2">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#121212]" checked={marketing} onChange={(changeEvent) => setMarketing(changeEvent.target.checked)} />
        <span>Tell me about other runs, events and competitions near me. Unsubscribe any time.</span>
      </label>

      {register.error && <p className="text-[13px] font-semibold text-bad">{isApiError(register.error, 429) ? 'Too many tries. Wait a minute and try again.' : register.error.message}</p>}

      <div>
        <button type="submit" className="btn-primary w-full" disabled={!ready || register.isPending}><TicketIcon size={16} />{register.isPending ? 'Getting your pass…' : 'Get free pass'}</button>
        {!user && <p className="mt-2.5 text-center text-[12px] leading-snug text-ink-3">No password or app needed. We email your pass and keep it in a free Jump account for you.</p>}
      </div>
    </form>
  </Modal>;
}

/** The pass on screen straight after registering, with where it was sent and a calendar entry. */
function PassIssued({ event, result, onClose }: { event: ClubEvent; result: Registration; onClose: () => void }) {
  const calendar = useMemo(() => calendarFile(event), [event]);
  if (result.status === 'existing') {
    return <Modal title="You already have a pass" onClose={onClose}>
      <p className="text-[15px] leading-relaxed">You’re already on the list for <b>{event.title}</b>. We’ve sent the pass again to <b>{result.sentTo}</b>.</p>
      <p className="mt-2 text-[13px] text-ink-2">Not there? Check spam or promotions.</p>
      <button type="button" className="btn-dark mt-5 w-full" onClick={onClose}>Done</button>
    </Modal>;
  }
  return <Modal title="You’re in" onClose={onClose}>
    <p className="-mt-2 mb-4 text-[14px] leading-snug text-ink-2">Your pass is on its way to <b className="text-ink">{result.sentTo}</b>. Show it at the start and the host checks you in.</p>
    <EventPass event={{ ...event, pass: result.pass }} holder={result.holder ?? 'You'} behind="bg-card" />
    <div className="mt-4 flex gap-2">
      {calendar && <a href={calendar} download={`${event.slug ?? 'event'}.ics`} className="btn-secondary flex-1"><CalendarIcon size={16} />Add to calendar</a>}
      <button type="button" className="btn-dark flex-1" onClick={onClose}>Done</button>
    </div>
    <p className="mt-4 text-center text-[12.5px] text-ink-3">We’ll email a reminder the day before.</p>
  </Modal>;
}

/** Lost the email? Send the pass again to the address it was booked with. */
export function FindPassSheet({ event, onClose }: { event: ClubEvent; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const resend = useMutation({ mutationFn: () => post<{ sent: boolean }>(`/events/${event.id}/pass/resend`, { email: email.trim() }) });
  return <Modal title="Find my pass" onClose={onClose}>
    {resend.isSuccess
      ? <><p className="text-[15px] leading-relaxed">If <b>{email.trim()}</b> has a pass for this event, it’s on its way. Check spam or promotions too.</p>
        <button type="button" className="btn-dark mt-5 w-full" onClick={onClose}>Done</button></>
      : <form className="space-y-3" onSubmit={(formEvent) => { formEvent.preventDefault(); resend.mutate(); }}>
        <p className="text-[14px] text-ink-2">Enter the email you registered with and we’ll send your pass again.</p>
        <input className="field" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required value={email} onChange={(changeEvent) => setEmail(changeEvent.target.value)} placeholder="Email" />
        {resend.error && <p className="text-[13px] font-semibold text-bad">{isApiError(resend.error, 429) ? 'Too many tries. Wait a minute and try again.' : resend.error.message}</p>}
        <button type="submit" className="btn-primary w-full" disabled={resend.isPending || !/^\S+@\S+\.\S+$/.test(email.trim())}>{resend.isPending ? 'Sending…' : 'Send my pass'}</button>
      </form>}
  </Modal>;
}
