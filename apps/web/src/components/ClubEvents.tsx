import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, patch, post } from '../lib/api';
import { formatDistance } from '../lib/format';
import { ACTIVITY_OPTIONS, ACTIVITY_WORD, clockLabel, clubEventsKey, dateLabel, deviceTimeZone, distanceAway, durationLabel, EVENT_NOUN, eventKey, MAX_DURATION, MIN_DURATION, nextLabel, posterTime, repeatRule, todayIso, WEEKDAYS, type ClubEvent, type EventActivity, type EventInput, type Place, type Schedule } from '../lib/club-events';
import { getCurrentPosition } from '../lib/geo';
import { toast } from '../lib/toast';
import type { Unit } from '../lib/types';
import { CalendarIcon, CameraIcon, CheckIcon, CloseIcon, PinIcon, PlusIcon, RepeatIcon, SearchIcon, TicketIcon, UsersIcon } from './icons';
import { DateTimePicker } from './DateTimePicker';
import { prepare } from './Profile';
import { Dropdown } from './Dropdown';
import { RepeatEditor, scheduleFor } from './RepeatEditor';
import { ClubLogo } from './ClubLogo';
import { Modal } from './Modal';
import { Avatar, cx, ErrorNotice, Field, Notice, SectionTitle, Skeleton, useNow } from './ui';

/** Dark text on light colours, light text on dark ones. */
export function onAccent(hex = '#FF5A1F') {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#121212' : '#F2EFE8';
}

/** The day-and-time block in the club's colour: "SAT / 7:00am", like a sticker on a noticeboard. */
export function EventStamp({ event, size = 'md' }: { event: Pick<ClubEvent, 'weekday' | 'startTime' | 'club' | 'repeat' | 'startsOn'>; size?: 'md' | 'lg' }) {
  const accent = event.club.accentColor || '#FF5A1F';
  const big = size === 'lg';
  return <span className={cx('flex shrink-0 -rotate-3 flex-col items-center justify-center rounded-lg border-2 border-ink px-1.5 shadow-hard-sm', big ? 'w-[92px] py-3' : 'w-16 py-2')} style={{ backgroundColor: accent, color: onAccent(accent) }}>
    <span className={cx('wide font-extrabold uppercase tracking-[0.08em]', big ? 'text-[15px]' : 'text-[11px]')}>{event.repeat === 'once' ? dateLabel(event.startsOn).slice(4) : WEEKDAYS[event.weekday].slice(0, 3)}</span>
    <span className={cx('wide mt-0.5 whitespace-nowrap font-black', big ? 'text-[20px]' : 'text-[14px]')}>{clockLabel(event.startTime).replace(' ', '')}</span>
  </span>;
}

/** One club event in a list: when, what, where, who's coming. */
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
        {event.going && <span className="wide inline-flex items-center gap-1 rounded-full bg-volt px-2 py-1 text-[10px] font-extrabold uppercase text-ink"><TicketIcon size={11} />Pass</span>}
      </span>
    </span>
  </Link>;
}

/** The event's photo, or the club's colour with running lanes and the day when there isn't one. */
export function EventCover({ event, className }: { event: Pick<ClubEvent, 'coverUrl' | 'club' | 'startTime' | 'startsOn'> & Schedule; className?: string }) {
  const accent = event.club.accentColor || '#FF5A1F';
  const ink = onAccent(accent);
  if (event.coverUrl) return <img src={event.coverUrl} alt="" loading="lazy" className={cx('block aspect-video w-full bg-ink/5 object-cover', className)} />;
  return <div className={cx('relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden', className)} style={{ backgroundColor: accent, color: ink }}>
    <svg className="absolute inset-0 h-full w-full opacity-[0.18]" viewBox="0 0 400 220" preserveAspectRatio="none" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((lane) => <path key={lane} d={`M-20 ${240 - lane * 26}C120 ${210 - lane * 30} 260 ${140 - lane * 22} 420 ${90 - lane * 18}`} fill="none" stroke={ink} strokeWidth="3" />)}
    </svg>
    <span className="wide relative text-[13px] font-extrabold uppercase tracking-[0.08em] opacity-80">{repeatRule(event)}</span>
    <span className="wide relative mt-0.5 text-[40px] font-black leading-none">{clockLabel(event.startTime).replace(' ', '').toUpperCase()}</span>
  </div>;
}

/** Getting a pass to an event from wherever it's listed: one click in, with reminders before each session. */
export function useEventRsvp(event: ClubEvent) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => post<ClubEvent>(`/events/${event.id}/join`),
    async onSuccess(next) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['club-events'] }),
        queryClient.invalidateQueries({ queryKey: eventKey(next.id) }),
        queryClient.invalidateQueries({ queryKey: clubEventsKey(next.club.slug) }),
      ]);
      toast({ tone: 'ok', title: 'You’ve got a pass', message: 'It’s on the event page. Jump reminds you the day before and an hour before.' });
    },
    onError: (error) => toast({ tone: 'bad', message: error.message }),
  });
}

/** An event in Explore, like a poster: photo, what and when, where, who's coming, and RSVP. */
export function ExploreEventCard({ event, unit }: { event: ClubEvent; unit: Unit }) {
  const now = useNow(60_000);
  const next = nextLabel(event, now);
  const rsvp = useEventRsvp(event);
  const away = distanceAway(event.distanceKm);
  const where = [event.venue, event.distanceMetres ? `${formatDistance(event.distanceMetres, unit)} ${EVENT_NOUN[event.activity].toLowerCase()}` : away].filter(Boolean).join(' · ');
  const going = event.going || rsvp.isSuccess;
  return <article className="relative overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card transition-shadow hover:shadow-hard-sm">
    <Link to="/events/$id" params={{ id: event.id }} className="absolute inset-0 z-[1] rounded-2xl" aria-label={`Open event: ${event.title}`} />
    <div className="relative">
      <EventCover event={event} />
      <span className="absolute bottom-3 left-3 max-w-[70%] truncate rounded-full bg-ink/70 px-3 py-1.5 text-[13px] font-semibold text-paper">{event.club.name}</span>
    </div>
    <div className="space-y-2 p-4">
      <p className="flex items-center gap-2 text-[13px] text-ink-3">
        <span className="wide rounded bg-[#4DA3FF]/15 px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[#1F6FD1]">Event</span>
        <span className="truncate">{ACTIVITY_WORD[event.activity]} · In person</span>
      </p>
      <h3 className="line-clamp-2 text-[20px] font-bold leading-tight">{event.title}</h3>
      <p className={cx('flex items-center gap-2 text-[14px]', next.live ? 'font-semibold text-track' : 'text-ink-2')}><CalendarIcon size={15} className="shrink-0" />{next.live ? `Happening now · ${posterTime(event)}` : posterTime(event)}</p>
      <p className="flex items-center gap-2 text-[14px] text-ink-2"><PinIcon size={15} className="shrink-0 text-ink-3" /><span className="truncate">{where}</span></p>
      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="num flex items-center gap-2 text-[14px] text-ink-2"><UsersIcon size={15} className="text-ink-3" />{event.attendeeCount + (rsvp.isSuccess && !event.going ? 1 : 0)} attending</span>
        {going
          ? <span className="inline-flex items-center gap-1.5 rounded-full bg-volt px-4 py-2 text-[14px] font-bold text-ink"><CheckIcon size={14} />Going</span>
          : <button type="button" className="relative z-[2] rounded-full bg-ink px-5 py-2 text-[14px] font-bold text-paper transition-transform active:scale-95 disabled:opacity-60" disabled={rsvp.isPending} onClick={() => rsvp.mutate()}>{rsvp.isPending ? 'Joining…' : 'RSVP'}</button>}
      </div>
    </div>
  </article>;
}

/** On a club's page: its upcoming events, and for managers a way to add one. */
export function ClubEventsSection({ club, manager, unit }: { club: { slug: string }; manager: boolean; unit: Unit }) {
  const events = useQuery({ queryKey: clubEventsKey(club.slug), queryFn: () => api<ClubEvent[]>(`/clubs/${club.slug}/events`) });
  const [adding, setAdding] = useState(false);
  const list = events.data ?? [];
  if (!list.length && !manager) return null;
  return <section className="mt-6">
    {list.length ? <>
      <SectionTitle aside={manager ? <button type="button" className="inline-flex items-center gap-1 text-[13px] font-bold hover:text-track" onClick={() => setAdding(true)}><PlusIcon size={14} />Add</button> : `${list.length}`}>Events</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">{list.map((event) => <EventCard key={event.id} event={event} showClub={false} />)}</div>
    </> : <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-ink-3 p-3.5 text-left hover:bg-ink/[0.03]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-volt text-ink"><RepeatIcon size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold">Add an event</span>
        <span className="block text-[12.5px] text-ink-2">Your weekly run, a monthly long run or a one-off race day. Runners nearby find it, get a pass and a reminder.</span>
      </span>
      <PlusIcon size={16} />
    </button>}
    {adding && <EventForm club={club.slug} unit={unit} onClose={() => setAdding(false)} />}
  </section>;
}

const MILE = 1609.344;

/** Add an event to a club (`club`), or edit one (`event`): what, when (once or on repeat), and where to meet. */
export function EventForm({ club, event, unit, onClose }: { club?: string; event?: ClubEvent; unit: Unit; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Events live under a club: the host comes first, from the club page you came from, or picked here.
  const clubs = useQuery({ queryKey: ['clubs', 'mine'], queryFn: () => api<Array<{ id: string; slug: string; name: string; logoUrl: string | null; myRole: string | null; memberCount?: number; followerCount?: number }>>('/clubs?view=mine'), enabled: !event });
  const managed = (clubs.data ?? []).filter((row) => row.myRole === 'owner' || row.myRole === 'admin');
  const [hostChoice, setHostChoice] = useState<string | null>(club ?? null);
  const host = hostChoice ?? managed[0]?.slug ?? null;
  const [title, setTitle] = useState(event?.title ?? '');
  const [activity, setActivity] = useState<EventActivity>(event?.activity ?? 'run');
  const [startsOn, setStartsOn] = useState(event?.startsOn ?? todayIso());
  const [schedule, setSchedule] = useState<Schedule>(() => event
    ? { repeat: event.repeat, repeatEvery: event.repeatEvery, weekdays: event.weekdays, monthMode: event.monthMode, monthWeek: event.monthWeek, endsOn: event.endsOn }
    : scheduleFor('once', todayIso()));
  const [time, setTime] = useState(event?.startTime ?? '07:00');
  const [hours, setHours] = useState(String(Math.floor((event?.durationMinutes ?? 60) / 60)));
  const [minutes, setMinutes] = useState(String((event?.durationMinutes ?? 60) % 60));
  const [distance, setDistance] = useState(event?.distanceMetres ? String(+(event.distanceMetres / (unit === 'mi' ? MILE : 1000)).toFixed(1)) : '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [place, setPlace] = useState<Place | null>(event ? { name: event.venue, address: event.address ?? '', latitude: event.latitude, longitude: event.longitude } : null);
  const [venue, setVenue] = useState(event?.venue ?? '');
  const [search, setSearch] = useState('');
  // Once a place is picked, the search and "I'm there now" step aside until Change is clicked.
  const [changing, setChanging] = useState(false);
  const [results, setResults] = useState<Place[] | null>(null);
  const [finding, setFinding] = useState<'search' | 'here' | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [cover, setCover] = useState<File | null>(null);
  const coverPreview = useMemo(() => (cover ? URL.createObjectURL(cover) : null), [cover]);
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);
  const timeZone = event?.timeZone ?? deviceTimeZone();

  // Places load as you type: a short pause after the last key, and only the newest search counts.
  useEffect(() => {
    const query = search.trim();
    if (query.length < 3) { setResults(null); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setFinding('search'); setPlaceError(null);
      api<Place[]>(`/geo/search?q=${encodeURIComponent(query)}${place ? `&lat=${place.latitude}&lon=${place.longitude}` : ''}`, { signal: controller.signal })
        .then((found) => {
          setResults(found);
          if (!found.length) setPlaceError('Nothing found yet. Try the park, street or landmark name with the town.');
        })
        .catch(() => { if (!controller.signal.aborted) setPlaceError('Couldn’t search right now. Keep typing, or use where you are.'); })
        .finally(() => { if (!controller.signal.aborted) setFinding(null); });
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
    // The pin only biases results; moving it shouldn't search again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

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
    setChanging(false);
    setPlace(next);
    if (next.name) setVenue(next.name);
    setResults(null);
    setSearch('');
  }

  const duration = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  const km = Number(distance.replace(',', '.'));
  const distanceMetres = distance.trim() && Number.isFinite(km) && km > 0 ? Math.round(km * (unit === 'mi' ? MILE : 1000)) : null;
  const problem = !event && !host ? 'Pick the club hosting it'
    : title.trim().length < 2 ? 'Add a name'
    : !place ? 'Set the meeting point'
      : venue.trim().length < 2 ? 'Name the meeting point'
        : duration < MIN_DURATION || duration > MAX_DURATION ? 'Set how long it lasts'
          : distance.trim() && (!distanceMetres || distanceMetres < 500 || distanceMetres > 200_000) ? 'Fix the distance'
          : null;

  const save = useMutation({
    mutationFn: async () => {
      const input: EventInput = {
        title: title.trim(), activity, ...schedule, startsOn, startTime: time, timeZone, durationMinutes: duration, distanceMetres,
        venue: venue.trim(), address: place?.address.trim() || null, latitude: place!.latitude, longitude: place!.longitude, notes: notes.trim() || null,
      };
      const saved = await (event ? patch<ClubEvent>(`/events/${event.id}`, input) : post<ClubEvent>(`/clubs/${host}/events`, input));
      if (!cover) return saved;
      // The event is saved either way; a photo that fails to upload can be added again from Edit.
      try {
        const form = new FormData();
        const blob = await prepare(cover, 2000);
        form.append('file', blob, blob === cover ? cover.name : 'cover.jpg');
        return await api<ClubEvent>(`/events/${saved.id}/cover`, { method: 'POST', body: form });
      } catch {
        toast({ tone: 'warn', message: 'Saved, but the cover photo didn’t upload. Try it again from Edit.' });
        return saved;
      }
    },
    async onSuccess(saved) {
      queryClient.setQueryData(eventKey(saved.id), saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clubEventsKey(saved.club.slug) }),
        queryClient.invalidateQueries({ queryKey: eventKey(saved.id) }),
        queryClient.invalidateQueries({ queryKey: ['club-events'] }),
      ]);
      toast({ tone: 'ok', title: event ? 'Saved' : 'Your event is live', message: event ? 'Everyone going sees the update.' : 'Members and followers just heard about it. Share it to bring more people.' });
      onClose();
      if (!event) void navigate({ to: '/events/$id', params: { id: saved.id } });
    },
  });

  function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    setTried(true);
    if (!problem) save.mutate();
  }

  return <Modal title={event ? 'Edit event' : 'New event'} onClose={onClose}>
    <form className="space-y-5" onSubmit={submit}>
      {event ? <p className="flex items-center gap-2.5 rounded-lg border-[1.5px] border-line bg-card p-3 text-[14px]"><ClubLogo club={event.club} size={32} /><span>Hosted by <b>{event.club.name}</b></span></p>
        : clubs.isLoading ? <Skeleton className="h-16 rounded-lg" />
          : managed.length ? <Field label="Which club is hosting?" hint={`${managed.find((row) => row.slug === host)?.name ?? 'The club'}’s members and followers get a push when you post it.`}>
            {(props) => <Dropdown id={props.id} value={host ?? managed[0].slug} onChange={setHostChoice}
              options={managed.map((row) => ({ value: row.slug, label: row.name, hint: `${row.memberCount ?? 0} members · ${row.followerCount ?? 0} followers`, icon: <ClubLogo club={row} size={22} /> }))} />}
          </Field>
            : <Notice tone="neutral" title="Events are hosted by clubs">Start a club for your crew first, then add its events. <Link to="/clubs" className="link" onClick={onClose}>Start a club</Link></Notice>}
      <label className="relative block cursor-pointer overflow-hidden rounded-2xl border-[1.5px] border-line hover:border-ink">
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) setCover(file); }} />
        {coverPreview ? <img src={coverPreview} alt="Cover preview" className="block aspect-video w-full object-cover" />
          : event ? <EventCover event={event} />
            : <span className="flex aspect-video flex-col items-center justify-center gap-1.5 bg-ink/[0.04] text-center"><CameraIcon size={26} className="text-ink-2" /><span className="text-[14px] font-bold">Add a cover photo</span><span className="text-[12.5px] text-ink-3">A crowd shot from your last run works best.</span></span>}
        {(coverPreview || event) && <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-full bg-ink/70 px-3 py-1.5 text-[12.5px] font-bold text-paper"><CameraIcon size={14} />{coverPreview || event?.coverUrl ? 'Change photo' : 'Add a photo'}</span>}
      </label>
      <Field label="Name" error={tried && title.trim().length < 2 ? 'Add a name for the event' : undefined}>
        {(props) => <input {...props} autoFocus className="field" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Saturday Social 5K" />}
      </Field>
      <Field label="What kind of session is it?">
        {(props) => <Dropdown id={props.id} value={activity} onChange={setActivity} options={ACTIVITY_OPTIONS.map((option) => ({ value: option.value, label: option.label, hint: option.detail }))} />}
      </Field>
      <Field label={schedule.repeat === 'once' ? 'When is it?' : 'When is the first one?'} hint={timeZone === deviceTimeZone() ? undefined : `In the meeting point’s time zone (${timeZone}).`}>
        {(props) => <DateTimePicker {...props} value={`${startsOn}T${time}`} min={event ? undefined : `${todayIso()}T00:00`}
          onChange={(value) => {
            if (!value) return;
            const day = value.slice(0, 10);
            setTime(value.slice(11, 16));
            if (day === startsOn) return;
            setStartsOn(day);
            // A new first date carries the schedule with it: its weekday, its week of the month.
            setSchedule((now) => scheduleFor(now.repeat, day, { ...now, weekdays: now.weekdays.length > 1 ? now.weekdays : [] }));
          }} />}
      </Field>
      <RepeatEditor value={schedule} startsOn={startsOn} startTime={time} onChange={setSchedule} />
      <Field label={`Distance (${unit})`} optional>
        {(props) => <input {...props} inputMode="decimal" className="field" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="5" />}
      </Field>
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
            {!changing && <button type="button" className="text-[13px] font-bold underline underline-offset-2" onClick={() => setChanging(true)}>Change</button>}
          </div>
        </div>}
        {(!place || changing) && <>
        <div className="relative">
          <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="field pl-9 pr-10" aria-label="Search for the meeting point" autoComplete="off" value={search} onChange={(e) => { setSearch(e.target.value); setPlaceError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} autoFocus={changing} placeholder={place ? 'Search a different place' : 'Search a park, street or landmark'} />
          {finding === 'search'
            ? <span className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-ink-3 border-t-transparent" aria-label="Searching" />
            : search && <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink" aria-label="Clear search" onClick={() => setSearch('')}><CloseIcon size={14} /></button>}
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
        {changing
          ? <button type="button" className="mt-2 block text-[13px] font-semibold text-ink-3 hover:text-ink" onClick={() => { setChanging(false); setSearch(''); }}>Keep {venue || 'this place'}</button>
          : <p className="hint">Runners nearby find your event by this spot, and Directions takes them straight to it.</p>}
        </>}
      </div>
      <Field label="Notes" optional>
        {(props) => <textarea {...props} className="field" maxLength={600} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Pace groups, where to leave bags, what happens after…" />}
      </Field>
      <ErrorNotice error={save.error} />
      <div className="sticky bottom-0 -mx-5 border-t border-line bg-card px-5 pb-1 pt-3">
        {tried && problem && <p className="mb-2 text-center text-[12.5px] font-semibold text-bad">{problem} to post it.</p>}
        <button type="submit" className="btn-primary w-full" disabled={save.isPending}>{save.isPending ? 'Saving…' : event ? 'Save changes' : 'Post event'}</button>
      </div>
    </form>
  </Modal>;
}
