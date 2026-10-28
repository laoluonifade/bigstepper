import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { FormEvent, useState } from 'react';
import { api, patch, post } from '../lib/api';
import { ACTIVITY_OPTIONS, clockLabel, clubEventsKey, DAY_OPTIONS, deviceTimeZone, distanceAway, durationLabel, EVENT_NOUN, eventKey, MAX_DURATION, MIN_DURATION, nextLabel, WEEKDAYS, type ClubEvent, type EventActivity, type EventInput, type Place } from '../lib/club-events';
import { getCurrentPosition } from '../lib/geo';
import { toast } from '../lib/toast';
import type { Unit } from '../lib/types';
import { PinIcon, PlusIcon, RepeatIcon, SearchIcon } from './icons';
import { Dropdown } from './Dropdown';
import { Modal } from './Modal';
import { Avatar, cx, ErrorNotice, Field, SectionTitle, useNow } from './ui';

/** Dark text on light colours, light text on dark ones. */
export function onAccent(hex = '#FF5A1F') {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#121212' : '#F2EFE8';
}

/** The day-and-time block in the club's colour: "SAT / 7:00am", like a sticker on a noticeboard. */
export function EventStamp({ event, size = 'md' }: { event: Pick<ClubEvent, 'weekday' | 'startTime' | 'club'>; size?: 'md' | 'lg' }) {
  const accent = event.club.accentColor || '#FF5A1F';
  const big = size === 'lg';
  return <span className={cx('flex shrink-0 -rotate-3 flex-col items-center justify-center rounded-lg border-2 border-ink px-1.5 shadow-hard-sm', big ? 'w-[92px] py-3' : 'w-16 py-2')} style={{ backgroundColor: accent, color: onAccent(accent) }}>
    <span className={cx('wide font-extrabold uppercase tracking-[0.08em]', big ? 'text-[15px]' : 'text-[11px]')}>{WEEKDAYS[event.weekday].slice(0, 3)}</span>
    <span className={cx('wide mt-0.5 whitespace-nowrap font-black', big ? 'text-[20px]' : 'text-[14px]')}>{clockLabel(event.startTime).replace(' ', '')}</span>
  </span>;
}

/** One weekly club event in a list: when, what, where, who's coming. */
export function EventCard({ event, showClub = true }: { event: ClubEvent; showClub?: boolean }) {
  const now = useNow(60_000);
  const next = nextLabel(event, now);
  const away = distanceAway(event.distanceKm);
  return <Link to="/events/$id" params={{ id: event.id }} className="flex items-start gap-3.5 rounded-2xl border-2 border-ink bg-card p-3.5 shadow-hard transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none">
    <EventStamp event={event} />
    <span className="min-w-0 flex-1">
      <span className={cx('wide flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em]', next.live ? 'text-track' : 'text-ink-2')}>
        {next.live && <span className="h-2 w-2 rounded-full bg-track" />}{next.label} · {EVENT_NOUN[event.activity]}
      </span>
      <span className="mt-0.5 block truncate text-[16px] font-extrabold">{event.title}</span>
      {showClub && <span className="block truncate text-[13px] font-semibold text-ink-2">{event.club.name}</span>}
      <span className="mt-0.5 flex items-center gap-1 text-[12.5px] text-ink-3"><PinIcon size={13} /><span className="truncate">{away ? `${event.venue} · ${away}` : event.venue}</span></span>
      <span className="mt-1.5 flex items-center gap-2">
        {event.faces.length > 0 && <span className="flex">
          {event.faces.slice(0, 4).map((face, index) => <span key={index} className={cx('rounded-full border-2 border-card', index > 0 && '-ml-2')}><Avatar name={face.displayName} src={face.avatarUrl} avatarStyle={face.avatarStyle} size={22} className="rounded-full" /></span>)}
        </span>}
        <span className="num flex-1 text-[12px] text-ink-2">{event.attendeeCount ? `${event.attendeeCount} going` : 'Be the first to join'}</span>
        {event.going && <span className="wide inline-flex items-center gap-1 rounded-full bg-volt px-2 py-1 text-[10px] font-extrabold uppercase text-ink"><RepeatIcon size={11} />Going</span>}
      </span>
    </span>
  </Link>;
}

/** On a club's page: its weekly runs, and for managers a way to add one. */
export function ClubEventsSection({ club, manager, unit }: { club: { slug: string }; manager: boolean; unit: Unit }) {
  const events = useQuery({ queryKey: clubEventsKey(club.slug), queryFn: () => api<ClubEvent[]>(`/clubs/${club.slug}/events`) });
  const [adding, setAdding] = useState(false);
  const list = events.data ?? [];
  if (!list.length && !manager) return null;
  return <section className="mt-6">
    {list.length ? <>
      <SectionTitle aside={manager ? <button type="button" className="inline-flex items-center gap-1 text-[13px] font-bold hover:text-track" onClick={() => setAdding(true)}><PlusIcon size={14} />Add</button> : `${list.length}`}>Weekly runs</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">{list.map((event) => <EventCard key={event.id} event={event} showClub={false} />)}</div>
    </> : <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-ink-3 p-3.5 text-left hover:bg-ink/[0.03]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-volt text-ink"><RepeatIcon size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold">Add your weekly run</span>
        <span className="block text-[12.5px] text-ink-2">Put your regular meet-ups on the map. Runners nearby can find them and get a reminder every week.</span>
      </span>
      <PlusIcon size={16} />
    </button>}
    {adding && <EventForm club={club.slug} unit={unit} onClose={() => setAdding(false)} />}
  </section>;
}

const MILE = 1609.344;

/** Add a weekly run to a club (`club`), or edit one (`event`). */
export function EventForm({ club, event, unit, onClose }: { club?: string; event?: ClubEvent; unit: Unit; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState(event?.title ?? '');
  const [activity, setActivity] = useState<EventActivity>(event?.activity ?? 'run');
  const [weekday, setWeekday] = useState(event?.weekday ?? 6);
  const [time, setTime] = useState(event?.startTime ?? '07:00');
  const [hours, setHours] = useState(String(Math.floor((event?.durationMinutes ?? 60) / 60)));
  const [minutes, setMinutes] = useState(String((event?.durationMinutes ?? 60) % 60));
  const [distance, setDistance] = useState(event?.distanceMetres ? String(+(event.distanceMetres / (unit === 'mi' ? MILE : 1000)).toFixed(1)) : '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [place, setPlace] = useState<Place | null>(event ? { name: event.venue, address: event.address ?? '', latitude: event.latitude, longitude: event.longitude } : null);
  const [venue, setVenue] = useState(event?.venue ?? '');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [finding, setFinding] = useState<'search' | 'here' | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const timeZone = event?.timeZone ?? deviceTimeZone();

  async function findPlaces() {
    const query = search.trim();
    if (query.length < 2) return;
    setFinding('search'); setPlaceError(null);
    try {
      const found = await api<Place[]>(`/geo/search?q=${encodeURIComponent(query)}${place ? `&lat=${place.latitude}&lon=${place.longitude}` : ''}`);
      setResults(found);
      if (!found.length) setPlaceError('Nothing found. Try the park, street or landmark name with the town.');
    } catch { setPlaceError('Couldn’t search right now. Try again.'); }
    finally { setFinding(null); }
  }

  async function pinHere() {
    setFinding('here'); setPlaceError(null);
    try {
      const position = await getCurrentPosition();
      const { latitude, longitude } = position.coords;
      const named = await api<{ name: string | null }>(`/geo/place?lat=${latitude.toFixed(5)}&lon=${longitude.toFixed(5)}`).catch(() => ({ name: null }));
      choose({ name: venue, address: named.name ?? '', latitude, longitude });
    } catch { setPlaceError('Couldn’t get your location. Allow location in the browser, or search instead.'); }
    finally { setFinding(null); }
  }

  function choose(next: Place) {
    setPlace(next);
    if (next.name) setVenue(next.name);
    setResults(null);
    setSearch('');
  }

  const duration = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  const km = Number(distance.replace(',', '.'));
  const distanceMetres = distance.trim() && Number.isFinite(km) && km > 0 ? Math.round(km * (unit === 'mi' ? MILE : 1000)) : null;
  const problem = title.trim().length < 2 ? 'Add a name'
    : !place ? 'Set the meeting point'
      : venue.trim().length < 2 ? 'Name the meeting point'
        : duration < MIN_DURATION || duration > MAX_DURATION ? 'Set how long it lasts'
          : distance.trim() && (!distanceMetres || distanceMetres < 500 || distanceMetres > 200_000) ? 'Fix the distance'
          : null;

  const save = useMutation({
    mutationFn: () => {
      const input: EventInput = {
        title: title.trim(), activity, weekday, startTime: time, timeZone, durationMinutes: duration, distanceMetres,
        venue: venue.trim(), address: place?.address.trim() || null, latitude: place!.latitude, longitude: place!.longitude, notes: notes.trim() || null,
      };
      return event ? patch<ClubEvent>(`/events/${event.id}`, input) : post<ClubEvent>(`/clubs/${club}/events`, input);
    },
    async onSuccess(saved) {
      queryClient.setQueryData(eventKey(saved.id), saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clubEventsKey(saved.club.slug) }),
        queryClient.invalidateQueries({ queryKey: eventKey(saved.id) }),
        queryClient.invalidateQueries({ queryKey: ['club-events'] }),
      ]);
      toast({ tone: 'ok', title: event ? 'Saved' : 'Your weekly run is live', message: event ? 'Everyone going sees the update.' : 'Members and followers just heard about it. Share it to bring more people.' });
      onClose();
      if (!event) void navigate({ to: '/events/$id', params: { id: saved.id } });
    },
  });

  function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    setTried(true);
    if (!problem) save.mutate();
  }

  return <Modal title={event ? 'Edit weekly run' : 'New weekly run'} onClose={onClose}>
    <form className="space-y-5" onSubmit={submit}>
      <Field label="Name" error={tried && title.trim().length < 2 ? 'Add a name for the run' : undefined}>
        {(props) => <input {...props} autoFocus className="field" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Saturday Social 5K" />}
      </Field>
      <Field label="What kind of session is it?">
        {(props) => <Dropdown id={props.id} value={activity} onChange={setActivity} options={ACTIVITY_OPTIONS.map((option) => ({ value: option.value, label: option.label, hint: option.detail }))} />}
      </Field>
      <Field label="Which day does it happen each week?">
        {(props) => <Dropdown id={props.id} value={String(weekday)} onChange={(day) => setWeekday(Number(day))} options={DAY_OPTIONS} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="What time does it start?" hint={timeZone === deviceTimeZone() ? undefined : `Meeting point’s time (${timeZone})`}>
          {(props) => <input {...props} type="time" step={300} className="field" value={time} onChange={(e) => e.target.value && setTime(e.target.value.slice(0, 5))} />}
        </Field>
        <Field label={`Distance (${unit})`} optional>
          {(props) => <input {...props} inputMode="decimal" className="field" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="5" />}
        </Field>
      </div>
      <div>
        <p className="label">How long does it usually last?</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="relative block">
            <input className="field pr-10" aria-label="Hours" inputMode="numeric" maxLength={2} value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ''))} />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] text-ink-2">h</span>
          </label>
          <label className="relative block">
            <input className="field pr-12" aria-label="Minutes" inputMode="numeric" maxLength={2} value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] text-ink-2">min</span>
          </label>
        </div>
        <p className={cx('hint', tried && (duration < MIN_DURATION || duration > MAX_DURATION) && 'font-semibold text-bad')}>{duration >= MIN_DURATION && duration <= MAX_DURATION ? `About ${durationLabel(duration)}, including any warm-up or social time after.` : 'Anything from 15 minutes to 24 hours.'}</p>
      </div>
      <div>
        <p className="label">Meeting point</p>
        {place && <div className="mb-3 flex items-start gap-3 rounded-2xl border-2 border-ink bg-card p-3">
          <span className="mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-volt text-ink"><PinIcon size={18} /></span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <input className="field" aria-label="Meeting point name" maxLength={120} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Main gate, Muri Okunola Park" />
            {place.address && <p className="text-[12.5px] text-ink-2">{place.address}</p>}
            <p className="num text-[12px] text-ink-3">{place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}</p>
          </div>
        </div>}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input className="field pl-9" aria-label="Search for the meeting point" value={search} onChange={(e) => { setSearch(e.target.value); setPlaceError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void findPlaces(); } }} placeholder={place ? 'Search to move the pin' : 'Search a park, street or landmark'} />
          </div>
          <button type="button" className="btn-dark" disabled={search.trim().length < 2 || finding === 'search'} onClick={() => void findPlaces()}>{finding === 'search' ? 'Finding…' : 'Find'}</button>
        </div>
        {placeError && <p className="hint font-semibold text-bad">{placeError}</p>}
        {results && results.length > 0 && <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border-[1.5px] border-line bg-card">
          {results.map((result) => <li key={`${result.latitude},${result.longitude}`}>
            <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-ink/[0.04]" onClick={() => choose(result)}>
              <PinIcon size={16} className="shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold">{result.name}</span><span className="block truncate text-[12px] text-ink-3">{result.address}</span></span>
            </button>
          </li>)}
        </ul>}
        <button type="button" className="btn-secondary btn-sm mt-3" disabled={finding === 'here'} onClick={() => void pinHere()}><PinIcon size={14} />{finding === 'here' ? 'Locating…' : 'I’m there now: use my location'}</button>
        <p className="hint">Runners nearby find your run by this pin, and Directions takes them straight to it.</p>
      </div>
      <Field label="Notes" optional>
        {(props) => <textarea {...props} className="field" maxLength={600} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Pace groups, where to leave bags, what happens after…" />}
      </Field>
      <ErrorNotice error={save.error} />
      <div className="sticky bottom-0 -mx-5 border-t border-line bg-card px-5 pb-1 pt-3">
        {tried && problem && <p className="mb-2 text-center text-[12.5px] font-semibold text-bad">{problem} to post it.</p>}
        <button type="submit" className="btn-primary w-full" disabled={save.isPending}>{save.isPending ? 'Saving…' : event ? 'Save changes' : 'Post weekly run'}</button>
      </div>
    </form>
  </Modal>;
}
