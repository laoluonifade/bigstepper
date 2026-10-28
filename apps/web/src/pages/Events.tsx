import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ClubLogo } from '../components/ClubLogo';
import { EventCard, EventForm, EventStamp, onAccent } from '../components/ClubEvents';
import { useConfirm } from '../components/ConfirmDialog';
import { ArrowRightIcon, CheckIcon, ClockIcon, PinIcon, RepeatIcon, SearchIcon, ShareIcon } from '../components/icons';
import { Avatar, cx, EmptyState, ErrorNotice, Loading, PageHeader, SectionTitle, Skeleton, useNow, VerifiedTick } from '../components/ui';
import { api, isApiError, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { clockLabel, directionsUrl, distanceAway, durationLabel, EVENT_NOUN, eventKey, everyLabel, nextLabel, WEEKDAYS, type ClubEvent, type Place } from '../lib/club-events';
import { formatDistance } from '../lib/format';
import { getCurrentPosition } from '../lib/geo';
import { usePlaceName } from '../lib/place';
import { useUnit } from '../lib/queries';
import { toast } from '../lib/toast';
import { CompeteSubNav } from './Competitions';

type Area = { latitude: number; longitude: number; name?: string };
const RADII = [5, 10, 25, 50];

/** Weekly club runs near you (or anywhere you search), and the ones you've joined. */
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
    <CompeteSubNav />
    <PageHeader eyebrow="Run together" title="Club runs" description="Weekly runs that clubs host in person. Join one and Jump reminds you the day before and an hour before, every week." />

    {going.length > 0 && <section className="mb-8">
      <SectionTitle aside={`${going.length}`}>Your weekly runs</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">{going.map((event) => <EventCard key={event.id} event={event} />)}</div>
    </section>}

    <SectionTitle aside={where ? <span className="inline-flex max-w-[220px] items-center gap-1 text-[13px] text-ink-2"><PinIcon size={13} /><span className="truncate">{where}</span></span> : undefined}>Near you</SectionTitle>
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
      : !area ? <EmptyState title="Where are you running?" action={<button type="button" className="btn-primary btn-sm" onClick={() => void locate()}>Use my location</button>}>
        {denied ? 'Allow location to see club runs around you, or search a town above.' : 'Search a town above to see its club runs.'}
      </EmptyState>
        : !nearby.length ? <EmptyState title="No club runs here yet">
          Nothing within {km} km yet. Try a wider area, or if you run a club, add your weekly run from your club’s page so people nearby can find it.
        </EmptyState>
          : <div className="grid gap-3 sm:grid-cols-2">{nearby.map((event) => <EventCard key={event.id} event={event} />)}</div>}
  </div>;
}

/** One weekly club event: when and where it meets, who's coming, and a button to join in every week. */
export function EventPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const unit = useUnit();
  const now = useNow(60_000);
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const event = useQuery({ queryKey: [...eventKey(id), user?.id ?? 'guest'], queryFn: () => api<ClubEvent>(`/events/${id}`) });

  const settle = async (next: ClubEvent) => {
    queryClient.setQueryData([...eventKey(id), user?.id ?? 'guest'], next);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['club-events'] }),
      queryClient.invalidateQueries({ queryKey: ['club', next.club.slug, 'events'] }),
    ]);
  };
  const join = useMutation({
    mutationFn: () => post<ClubEvent>(`/events/${id}/join`),
    async onSuccess(next) { await settle(next); toast({ tone: 'ok', title: 'You’re in', message: `Jump will remind you the day before and an hour before, every ${WEEKDAYS[next.weekday]}.` }); },
  });
  const leave = useMutation({
    mutationFn: () => api<ClubEvent>(`/events/${id}/join`, { method: 'DELETE' }),
    async onSuccess(next) { await settle(next); toast({ tone: 'ok', message: 'You won’t get reminders for this one any more.' }); },
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
      ? <EmptyState title="This run isn’t on any more">The club may have changed its schedule.</EmptyState>
      : <ErrorNotice error={event.error} onRetry={() => void event.refetch()} />;
  }

  const e = event.data;
  const accent = e.club.accentColor || '#FF5A1F';
  const ink = onAccent(accent);
  const next = nextLabel(e, now);
  const away = distanceAway(e.distanceKm);
  const link = `${window.location.origin}/events/${e.id}`;
  const share = async () => {
    const text = `${e.title} with ${e.club.name}: ${everyLabel(e)} at ${e.venue}.`;
    if (navigator.share) { await navigator.share({ title: e.title, text, url: link }).catch(() => undefined); return; }
    await navigator.clipboard.writeText(`${text} ${link}`).catch(() => undefined);
    toast({ tone: 'ok', message: 'Link copied.' });
  };
  const joinButton = !user
    ? <Link to="/login" search={{ redirect: `/events/${e.id}` }} className="btn-primary flex-1"><RepeatIcon size={16} />Join weekly</Link>
    : e.going
      ? <button type="button" className="btn-secondary flex-1" disabled={leave.isPending} onClick={() => confirm.ask({ title: 'Stop going?', body: 'You’ll stop getting reminders for this run. You can join again any time.', confirmLabel: 'Stop going', onConfirm: () => leave.mutate() })}><CheckIcon size={16} />Going every week</button>
      : <button type="button" className="btn-primary flex-1" disabled={join.isPending} onClick={() => join.mutate()}><RepeatIcon size={16} />{join.isPending ? 'Joining…' : 'Join weekly'}</button>;

  return <div className="mx-auto max-w-2xl">
    <div className="relative overflow-hidden rounded-2xl border-2 border-ink px-5 pb-6 pt-7 shadow-hard" style={{ backgroundColor: accent, color: ink }}>
      <svg className="absolute inset-0 h-full w-full opacity-[0.18]" viewBox="0 0 400 220" preserveAspectRatio="none" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((lane) => <path key={lane} d={`M-20 ${240 - lane * 26}C120 ${210 - lane * 30} 260 ${140 - lane * 22} 420 ${90 - lane * 18}`} fill="none" stroke={ink} strokeWidth="3" />)}
      </svg>
      <div className="relative flex items-end gap-4">
        <EventStamp event={e} size="lg" />
        <div className="min-w-0 flex-1">
          <span className="wide inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em]" style={{ borderColor: ink }}>
            {next.live && <span className="h-[7px] w-[7px] rounded-full" style={{ backgroundColor: ink }} />}{next.label}
          </span>
          <h1 className="wide mt-2 text-[28px] font-black leading-[1.05] sm:text-[34px]">{e.title}</h1>
        </div>
      </div>
    </div>

    <div className="mt-5 space-y-5">
      <ErrorNotice error={join.error ?? leave.error ?? remove.error} />
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
          <RepeatIcon size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-[15px] font-bold">{everyLabel(e)}</p>
            <p className="text-[13px] text-ink-2">{EVENT_NOUN[e.activity]} · about {durationLabel(e.durationMinutes)}{e.distanceMetres ? ` · ${formatDistance(e.distanceMetres, unit)}` : ''}</p>
          </div>
        </div>
        <div className="flex items-start gap-3 border-b border-line pb-3.5">
          <ClockIcon size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-[15px] font-bold">{next.live ? 'On right now' : `Next: ${next.label}, ${clockLabel(e.startTime)}`}</p>
            <p className="text-[13px] text-ink-2">Times are local to the meeting point.</p>
          </div>
        </div>
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

      <section>
        <p className="wide mb-2 text-[12px] font-extrabold uppercase tracking-[0.08em]">{e.attendeeCount ? `${e.attendeeCount} going` : 'Who’s going'}</p>
        {e.faces.length ? <div className="flex items-center gap-2.5">
          <div className="flex">{e.faces.map((face, index) => <span key={index} className={cx('rounded-full border-2 border-paper', index > 0 && '-ml-2.5')}><Avatar name={face.displayName} src={face.avatarUrl} avatarStyle={face.avatarStyle} size={36} className="rounded-full" /></span>)}</div>
          {e.attendeeCount > e.faces.length && <span className="text-[13px] text-ink-2">+{e.attendeeCount - e.faces.length} more</span>}
        </div> : <p className="text-[14px] text-ink-2">Nobody yet. Join and be the first.</p>}
      </section>

      {e.canManage && <div className="flex gap-2 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={() => setEditing(true)}>Edit</button>
        <button type="button" className="btn-danger flex-1" disabled={remove.isPending} onClick={() => confirm.ask({ title: 'Remove this weekly run?', body: 'It comes off the map and everyone going stops getting reminders.', confirmLabel: 'Remove', danger: true, onConfirm: () => remove.mutate() })}>Remove</button>
      </div>}
    </div>
    {editing && <EventForm event={e} unit={unit} onClose={() => setEditing(false)} />}
    {confirm.dialog}
  </div>;
}
