import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ClubLogo } from '../components/ClubLogo';
import { EventCard, EventForm, EventStamp, onAccent } from '../components/ClubEvents';
import { useConfirm } from '../components/ConfirmDialog';
import { EventPass, PassModal } from '../components/EventPass';
import { ArrowRightIcon, CalendarIcon, CheckIcon, ClockIcon, PinIcon, RepeatIcon, SearchIcon, ShareIcon, TicketIcon, UsersIcon } from '../components/icons';
import { Avatar, cx, EmptyState, ErrorNotice, Loading, PageHeader, SectionTitle, Skeleton, useNow, VerifiedTick } from '../components/ui';
import { api, isApiError, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { clockLabel, directionsUrl, distanceAway, durationLabel, EVENT_NOUN, eventKey, nextLabel, posterTime, scheduleLabel, type ClubEvent, type Guest, type Place } from '../lib/club-events';
import { formatDistance } from '../lib/format';
import { getCurrentPosition } from '../lib/geo';
import { usePlaceName } from '../lib/place';
import { useProfile, useUnit } from '../lib/queries';
import { toast } from '../lib/toast';
import { CompeteSubNav, ExploreBack } from './Competitions';

type Area = { latitude: number; longitude: number; name?: string };
const RADII = [5, 10, 25, 50];

/** Club events near you (or anywhere you search), and the ones you've got passes for. */
export function EventsPage() {
  const [area, setArea] = useState<Area | null>(null);
  const [locating, setLocating] = useState(true);
  const [denied, setDenied] = useState(false);
  const [km, setKm] = useState(25);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const placeName = usePlaceName(area && !area.name ? area : null);

  async function locate() {
    setLocating(true);
    try {
      const position = await getCurrentPosition(10_000, { enableHighAccuracy: false, maximumAge: 10 * 60_000 });
      setDenied(false);
      setArea({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch {
      setDenied(true);
    } finally {
      setLocating(false);
    }
  }
  useEffect(() => { void locate(); }, []);

  async function findArea() {
    const query = search.trim();
    if (query.length < 2) return;
    setSearching(true); setSearchError(null);
    try {
      const [first] = await api<Place[]>(`/geo/search?q=${encodeURIComponent(query)}`);
      if (!first) setSearchError('Couldn’t find that place. Try a town or neighbourhood.');
      else { setArea({ latitude: first.latitude, longitude: first.longitude, name: first.name }); setSearch(''); }
    } catch {
      setSearchError('Couldn’t search right now. Try again.');
    } finally { setSearching(false); }
  }

  const events = useQuery({
    queryKey: ['club-events', area?.latitude.toFixed(3) ?? 'none', area?.longitude.toFixed(3) ?? 'none', km],
    queryFn: () => api<{ nearby: ClubEvent[]; going: ClubEvent[] }>(area ? `/events?lat=${area.latitude.toFixed(5)}&lon=${area.longitude.toFixed(5)}&km=${km}` : '/events'),
    enabled: !locating,
  });
  const going = events.data?.going ?? [];
  const goingIds = new Set(going.map((event) => event.id));
  const nearby = (events.data?.nearby ?? []).filter((event) => !goingIds.has(event.id));
  const where = area?.name ?? placeName;

  return <div>
    <ExploreBack />
    <div className="hidden md:block"><CompeteSubNav /></div>
    <PageHeader eyebrow="Run together" title="Events near you" description="Runs, rides and race days that clubs host in person. Get a pass and Jump reminds you the day before and an hour before." />

    {going.length > 0 && <section className="mb-8">
      <SectionTitle aside={`${going.length}`}>Your passes</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">{going.map((event) => <EventCard key={event.id} event={event} />)}</div>
    </section>}

    <SectionTitle aside={where ? <span className="inline-flex max-w-[220px] items-center gap-1 text-[13px] text-ink-2"><PinIcon size={13} /><span className="truncate">{where}</span></span> : undefined}>{area ? 'Near you' : 'Upcoming'}</SectionTitle>
    <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void findArea(); }}>
      <div className="relative flex-1">
        <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input className="field pl-9" aria-label="Search another town or area" value={search} onChange={(event) => { setSearch(event.target.value); setSearchError(null); }} placeholder="Search another town or area" />
      </div>
      {search.trim().length >= 2
        ? <button type="submit" className="btn-dark" disabled={searching}>{searching ? 'Finding…' : 'Go'}</button>
        : area?.name ? <button type="button" className="btn-quiet" onClick={() => void locate()}>Near me</button> : null}
    </form>
    {searchError && <p className="hint font-semibold text-bad">{searchError}</p>}
    <div className="no-scrollbar mb-4 mt-3 flex gap-2 overflow-x-auto" role="radiogroup" aria-label="How far">
      {RADII.map((value) => <button key={value} type="button" role="radio" aria-checked={value === km} onClick={() => setKm(value)}
        className={cx('shrink-0 rounded-full border-[1.5px] px-3.5 py-1.5 text-[13px] font-bold transition-colors', value === km ? 'border-ink bg-ink text-paper' : 'border-line bg-card hover:border-ink')}>Within {value} km</button>)}
    </div>

    <ErrorNotice error={events.error} onRetry={() => void events.refetch()} />
    {locating || events.isLoading ? <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div>
      : !area && !nearby.length ? <EmptyState title="Where are you running?" action={<button type="button" className="btn-primary btn-sm" onClick={() => void locate()}>Use my location</button>}>
        {denied ? 'Allow location to see events around you, or search a town above.' : 'Search a town above to see its events.'}
      </EmptyState>
        : !nearby.length ? <EmptyState title="No events here yet">
          Nothing within {km} km yet. Try a wider area, or if you run a club, add an event from your club’s page so people nearby can find it.
        </EmptyState>
          : <div className="grid gap-3 sm:grid-cols-2">{nearby.map((event) => <EventCard key={event.id} event={event} />)}</div>}
  </div>;
}

/** One club event: when and where, who's coming, and your pass once you've got one. */
export function EventPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const unit = useUnit();
  const now = useNow(60_000);
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const profile = useProfile().data;
  const event = useQuery({ queryKey: [...eventKey(id), user?.id ?? 'guest'], queryFn: () => api<ClubEvent>(`/events/${id}`) });

  const settle = async (next: ClubEvent) => {
    queryClient.setQueryData([...eventKey(id), user?.id ?? 'guest'], next);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['club-events'] }),
      queryClient.invalidateQueries({ queryKey: ['club', next.club.slug, 'events'] }),
    ]);
  };
  const join = useMutation({
    mutationFn: () => post<ClubEvent>(`/events/${event.data!.id}/join`),
    async onSuccess(next) { await settle(next); setPassOpen(true); },
  });
  const leave = useMutation({
    mutationFn: () => api<ClubEvent>(`/events/${event.data!.id}/join`, { method: 'DELETE' }),
    async onSuccess(next) { await settle(next); toast({ tone: 'ok', message: 'Pass given up. You won’t get reminders for this one.' }); },
  });
  const remove = useMutation({
    mutationFn: () => api(`/events/${id}`, { method: 'DELETE' }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: ['club-events'] });
      if (event.data) await queryClient.invalidateQueries({ queryKey: ['club', event.data.club.slug, 'events'] });
      toast({ tone: 'ok', message: 'Event removed.' });
      void navigate({ to: event.data ? '/clubs/$id' : '/events', params: { id: event.data?.club.slug ?? '' } });
    },
  });

  if (event.isLoading) return <Loading />;
  if (!event.data) {
    return isApiError(event.error, 404)
      ? <EmptyState title="This event isn’t on any more">The club may have changed its schedule.</EmptyState>
      : <ErrorNotice error={event.error} onRetry={() => void event.refetch()} />;
  }

  const e = event.data;
  const accent = e.club.accentColor || '#FF5A1F';
  const ink = onAccent(accent);
  const next = nextLabel(e, now);
  // The date is already on the poster; the pill only speaks up when it adds something ("Tomorrow", "Happening now").
  const soon = next.live || ['Today', 'Tomorrow', 'Finished'].includes(next.label);
  const away = distanceAway(e.distanceKm);
  const link = `${window.location.origin}/events/${e.slug ?? e.id}`;
  const share = async () => {
    const text = `${e.title} with ${e.club.name}: ${scheduleLabel(e)} at ${e.venue}.`;
    if (navigator.share) { await navigator.share({ title: e.title, text, url: link }).catch(() => undefined); return; }
    await navigator.clipboard.writeText(`${text} ${link}`).catch(() => undefined);
    toast({ tone: 'ok', message: 'Link copied.' });
  };
  const holder = profile?.displayName ?? user?.displayName ?? 'You';
  const joinButton = !e.nextAt
    ? <button type="button" className="btn-secondary flex-1" disabled>This event has finished</button>
    : !user
      ? <Link to="/login" search={{ redirect: `/events/${e.id}` }} className="btn-primary flex-1"><TicketIcon size={16} />Get your pass</Link>
      : e.isHost
        ? <Link to="/events/$id/guests" params={{ id: e.id }} className="btn flex-1 border-2 border-ink bg-volt text-ink shadow-hard"><UsersIcon size={16} />Check in guests</Link>
        : e.pass
        ? <button type="button" className="btn-dark flex-1" onClick={() => setPassOpen(true)}><TicketIcon size={16} />Show my pass</button>
        : <button type="button" className="btn-primary flex-1" disabled={join.isPending} onClick={() => join.mutate()}><TicketIcon size={16} />{join.isPending ? 'Getting your pass…' : 'Get your pass'}</button>;

  return <div className="mx-auto max-w-2xl">
    {e.coverUrl
      // With a photo, the photo is the poster: a soft shade at its foot, and the name and time on it.
      ? <div className="relative -mx-4 -mt-8 overflow-hidden bg-ink/10 sm:mx-0 sm:mt-0 sm:rounded-[28px]">
        <img src={e.coverUrl} alt="" className="aspect-[4/4.4] w-full animate-settle object-cover sm:aspect-[16/10]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/90 via-black/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 animate-rise-lg px-5 pb-6 text-white [animation-delay:200ms] sm:px-8 sm:pb-8">
          <div className="flex flex-wrap items-center gap-2">
            {soon && <WhenPill label={next.label} live={next.live} color="#fff" />}
            <span className="wide text-[11px] font-extrabold uppercase tracking-[0.08em] text-white/85">{posterTime(e)}</span>
          </div>
          <h1 className="wide mt-2.5 text-[32px] font-black leading-[1.04] sm:text-[44px]">{e.title}</h1>
        </div>
      </div>
      // Without one, the club-coloured poster: the date stamp on top, the name with the full width under it.
      : <div className="relative animate-rise-lg overflow-hidden rounded-2xl border-2 border-ink px-5 pb-7 pt-6 shadow-hard sm:px-7" style={{ backgroundColor: accent, color: ink }}>
        <svg className="absolute inset-0 h-full w-full opacity-[0.18]" viewBox="0 0 400 220" preserveAspectRatio="none" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((lane) => <path key={lane} d={`M-20 ${240 - lane * 26}C120 ${210 - lane * 30} 260 ${140 - lane * 22} 420 ${90 - lane * 18}`} fill="none" stroke={ink} strokeWidth="3" />)}
        </svg>
        <div className="relative flex items-center justify-between gap-3">
          <EventStamp event={e} size="lg" />
          {soon && <WhenPill label={next.label} live={next.live} color={ink} />}
        </div>
        <h1 className="wide relative mt-5 text-[32px] font-black leading-[1.04] sm:text-[40px]">{e.title}</h1>
      </div>}

    <div className="mt-5 animate-rise space-y-5 [animation-delay:380ms]">
      <ErrorNotice error={join.error ?? leave.error ?? remove.error} />
      {e.pass && !e.isHost && <button type="button" className="block w-full text-left" onClick={() => setPassOpen(true)} aria-label="Open your pass"><EventPass event={e} holder={holder} /></button>}
      <div className="flex gap-2">
        {joinButton}
        <button type="button" className="btn-secondary" onClick={() => void share()}><ShareIcon size={16} />Share</button>
      </div>

      <Link to="/clubs/$id" params={{ id: e.club.slug }} className="flex items-center gap-3 rounded-2xl border-[1.5px] border-line bg-card p-3 hover:border-ink">
        <ClubLogo club={e.club} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] text-ink-3">Hosted by</span>
          <span className="flex items-center gap-1"><span className="truncate text-[15px] font-bold">{e.club.name}</span>{e.club.verified && <VerifiedTick size={16} />}</span>
        </span>
        <ArrowRightIcon size={16} />
      </Link>

      <div className="space-y-3.5 rounded-2xl border-2 border-ink bg-card p-4 shadow-hard">
        <div className="flex items-start gap-3 border-b border-line pb-3.5">
          {e.repeat === 'once' ? <CalendarIcon size={18} className="mt-0.5 shrink-0" /> : <RepeatIcon size={18} className="mt-0.5 shrink-0" />}
          <div>
            <p className="text-[15px] font-bold">{scheduleLabel(e)}</p>
            <p className="text-[13px] text-ink-2">{EVENT_NOUN[e.activity]} · about {durationLabel(e.durationMinutes)}{e.distanceMetres ? ` · ${formatDistance(e.distanceMetres, unit)}` : ''}</p>
          </div>
        </div>
        {e.repeat !== 'once' && <div className="flex items-start gap-3 border-b border-line pb-3.5">
          <ClockIcon size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-[15px] font-bold">{next.live ? 'On right now' : e.nextAt ? `Next: ${next.label}, ${clockLabel(e.startTime)}` : 'This event has finished'}</p>
            <p className="text-[13px] text-ink-2">Times are local to the meeting point.</p>
          </div>
        </div>}
        <div className="flex items-start gap-3">
          <PinIcon size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-[15px] font-bold">{e.venue}</p>
            {(e.address || away) && <p className="text-[13px] text-ink-2">{[e.address, away].filter(Boolean).join(' · ')}</p>}
          </div>
        </div>
        <a href={directionsUrl(e)} target="_blank" rel="noreferrer" className="btn-dark w-full"><PinIcon size={16} />Get directions</a>
      </div>

      {e.notes && <section>
        <p className="wide mb-1.5 text-[12px] font-extrabold uppercase tracking-[0.08em]">From the club</p>
        <p className="whitespace-pre-line text-[15px] leading-relaxed">{e.notes}</p>
      </section>}

      {/* Only the count shows: who's going stays private (the host has the guest list). */}
      {e.attendeeCount > 0 && <p className="flex items-center gap-2 text-[14px] text-ink-2">
        <UsersIcon size={16} className="shrink-0" />
        <span><b className="text-ink">{e.attendeeCount}</b> {e.attendeeCount === 1 ? 'person is' : 'people are'} going</span>
      </p>}

      {e.pass && !e.canManage && <p className="text-center">
        <button type="button" className="text-[13px] font-semibold text-ink-3 hover:text-ink" disabled={leave.isPending}
          onClick={() => confirm.ask({ title: 'Give up your pass?', body: 'You’ll stop getting reminders for this event. You can get a new pass any time.', confirmLabel: 'Give it up', onConfirm: () => leave.mutate() })}>Can’t make it? Give up your pass</button>
      </p>}

      {e.canManage && <Link to="/events/$id/guests" params={{ id: e.id }} className="btn w-full border-2 border-ink bg-volt text-ink shadow-hard active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"><UsersIcon size={16} />Guest list · {e.attendeeCount}</Link>}

      {e.canManage && <div className="flex gap-2 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={() => setEditing(true)}>Edit</button>
        <button type="button" className="btn-danger flex-1" disabled={remove.isPending} onClick={() => confirm.ask({ title: 'Remove this event?', body: 'It comes off the map and everyone going stops getting reminders.', confirmLabel: 'Remove', danger: true, onConfirm: () => remove.mutate() })}>Remove</button>
      </div>}
    </div>
    {editing && <EventForm event={e} unit={unit} onClose={() => setEditing(false)} />}
    {passOpen && e.pass && <PassModal event={e} holder={holder} onClose={() => setPassOpen(false)} />}
    {confirm.dialog}
  </div>;
}

/**
 * The host's door list for the next session: everyone holding a pass, checked in by clicking their name
 * or typing the code off their pass. Check-ins count for that session only, so a weekly run starts fresh.
 */
function WhenPill({ label, live, color }: { label: string; live: boolean; color: string }) {
  return <span className="wide inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em]" style={{ borderColor: color, color }}>
    {live && <span className="h-[7px] w-[7px] animate-blink rounded-full" style={{ backgroundColor: color }} />}{label}
  </span>;
}

export function EventGuestsPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const queryClient = useQueryClient();
  const event = useQuery({ queryKey: [...eventKey(id), 'host'], queryFn: () => api<ClubEvent>(`/events/${id}`) });
  const listKey = ['club-event', id, 'guests'];
  const list = useQuery({ queryKey: listKey, queryFn: () => api<{ nextAt: string | null; guests: Guest[] }>(`/events/${id}/guests`), refetchInterval: 15_000 });
  const [code, setCode] = useState('');
  const [search, setSearch] = useState('');

  const set = (userId: string, checkedIn: boolean) => queryClient.setQueryData<{ nextAt: string | null; guests: Guest[] }>(listKey,
    (data) => data && { ...data, guests: data.guests.map((guest) => (guest.userId === userId ? { ...guest, checkedIn } : guest)) });
  const checkIn = useMutation({
    mutationFn: (match: { code?: string; userId?: string }) => post<{ userId: string; checkedIn: boolean }>(`/events/${id}/check-in`, match),
    onSuccess(result) {
      set(result.userId, true);
      const guest = list.data?.guests.find((row) => row.userId === result.userId);
      toast({ tone: 'ok', message: `${guest?.displayName ?? 'Runner'} is checked in.` });
      setCode('');
    },
    onError: (error) => toast({ tone: 'bad', message: error.message }),
  });
  const undo = useMutation({
    mutationFn: (userId: string) => api<{ userId: string }>(`/events/${id}/check-in/${userId}`, { method: 'DELETE' }),
    onSuccess(result) { set(result.userId, false); },
    onError: (error) => toast({ tone: 'bad', message: error.message }),
  });

  const back = <Link to="/events/$id" params={{ id }} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink">Back to the event</Link>;
  if (list.isLoading || event.isLoading) return <div className="mx-auto max-w-2xl">{back}<Loading /></div>;
  if (!list.data || !event.data) return <div className="mx-auto max-w-2xl">{back}<ErrorNotice error={list.error ?? event.error} onRetry={() => void list.refetch()} /></div>;

  const guests = list.data.guests;
  const inCount = guests.filter((guest) => guest.checkedIn).length;
  const query = search.trim().toLowerCase();
  const shown = guests.filter((guest) => !query || `${guest.displayName ?? ''} ${guest.username ?? ''} ${guest.passCode}`.toLowerCase().includes(query));
  const typed = code.trim().toUpperCase();
  const submitCode = () => { if (typed.length >= 4) checkIn.mutate({ code: typed.startsWith('JMP-') ? typed : `JMP-${typed}` }); };

  return <div className="mx-auto max-w-2xl">
    {back}
    <PageHeader eyebrow="Guest list" title={event.data.title} />
    <div className="flex items-end gap-3">
      <p className="wide min-w-0 flex-1 truncate text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-2">{list.data.nextAt ? posterTime(event.data) : 'Finished'}</p>
      <div className="text-right">
        <p className="score num text-[36px] leading-none">{inCount}/{guests.length}</p>
        <p className="wide text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-2">Checked in</p>
      </div>
    </div>
    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink/[0.07]"><div className="h-full rounded-full bg-volt transition-[width] duration-500" style={{ width: `${guests.length ? (inCount / guests.length) * 100 : 0}%` }} /></div>

    <form className="mt-5 flex gap-2" onSubmit={(formEvent) => { formEvent.preventDefault(); submitCode(); }}>
      <div className="relative flex-1">
        <TicketIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input className="field pl-9 font-mono uppercase" aria-label="Pass code" autoCapitalize="characters" autoCorrect="off" value={code} onChange={(changeEvent) => setCode(changeEvent.target.value)} placeholder="Pass code, e.g. JMP-7K2Q9X" />
      </div>
      <button type="submit" className="btn-dark" disabled={typed.length < 4 || checkIn.isPending}>Check in</button>
    </form>
    <p className="hint">Opens 12 hours before it starts at {clockLabel(event.data.startTime)}. Each session starts a fresh list.</p>

    {guests.length > 6 && <div className="relative mt-4">
      <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
      <input className="field pl-9" aria-label="Find a name" value={search} onChange={(changeEvent) => setSearch(changeEvent.target.value)} placeholder="Find a name" />
    </div>}

    <div className="mt-4">
      {!guests.length ? <EmptyState title="No passes yet">Share the event so people can get a pass. They’ll show up here.</EmptyState>
        : <ul className="divide-y divide-line overflow-hidden rounded-2xl border-[1.5px] border-line bg-card">{shown.map((guest) => <li key={guest.userId} className="flex items-center gap-3 px-3.5 py-3">
          <Avatar name={guest.displayName} src={guest.avatarUrl} avatarStyle={guest.avatarStyle} size={40} className="rounded-full" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold">{guest.displayName ?? 'Runner'}</p>
            <p className="font-mono text-[12.5px] text-ink-3">{guest.passCode}</p>
          </div>
          {guest.checkedIn
            ? <button type="button" className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-volt bg-volt px-3.5 py-2 text-[13px] font-bold text-ink" onClick={() => undo.mutate(guest.userId)} aria-label={`Undo check-in for ${guest.displayName ?? 'runner'}`}><CheckIcon size={14} />In</button>
            : <button type="button" className="rounded-full border-[1.5px] border-ink px-3.5 py-2 text-[13px] font-bold hover:bg-ink/[0.04]" onClick={() => checkIn.mutate({ userId: guest.userId })} aria-label={`Check in ${guest.displayName ?? 'runner'}`}>Check in</button>}
        </li>)}</ul>}
    </div>
  </div>;
}
