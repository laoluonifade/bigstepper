import { formatDate, formatMoney } from '@jump/shared/format';
import type { ChallengeType, Profile } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useContext, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ExploreEventCard } from '@/components/ClubEvents';
import { ClubLogo } from '@/components/ClubLogo';
import { isManager, type ClubSummary } from '@/components/clubs';
import { CompetitionPreviewCard, openCompetition } from '@/components/competition';
import { CalendarIcon, ChevronRightIcon, CloseIcon, CrownIcon, UsersIcon, PinIcon, PlusIcon, SearchIcon, SlidersIcon, TrashIcon } from '@/components/icons';
import { TabScreen } from '@/components/Shell';
import { Sheet } from '@/components/Sheet';
import { BottomBarInset, Button, EmptyState, ErrorNotice, haptic, HardShadow, Skeleton, Txt, useNow } from '@/components/ui';
import { api, patch, post } from '@/lib/api';
import type { ClubEvent } from '@/lib/club-events';
import { keys, useDiscover, useProfile, useUnit, type DiscoverView } from '@/lib/queries';
import { brand, colors, fontFamily, radius } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { confirm } from '@/lib/dialog';

type TypeFilter = 'all' | 'free' | 'sponsored' | 'paid';
type Lens = 'all' | 'events' | 'competitions';
const LENSES: Array<{ value: Lens; label: string }> = [{ value: 'all', label: 'All' }, { value: 'events', label: 'Events' }, { value: 'competitions', label: 'Competitions' }];
/** How to browse events: the same control as competitions' tabs, with event-shaped choices. */
type EventTab = 'upcoming' | 'week' | 'near' | 'passes' | 'clubs';
const EVENT_TABS: Array<{ value: EventTab; label: string }> = [
  { value: 'upcoming', label: 'Upcoming' }, { value: 'week', label: 'This week' }, { value: 'near', label: 'Near me' },
  { value: 'passes', label: 'My passes' }, { value: 'clubs', label: 'My clubs' },
];
const EVENT_ACTIVITY: Array<{ value: 'all' | ClubEvent['activity']; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'run', label: 'Run' }, { value: 'walk', label: 'Walk' }, { value: 'cycle', label: 'Ride' },
];

/** Which event activities fit the activity filter: events marked "any" fit them all. */
const EVENT_FITS: Partial<Record<ChallengeType, Array<ClubEvent['activity']>>> = { RUN: ['run', 'any'], WALK: ['walk', 'any'], CYCLING: ['cycle', 'any'], DISTANCE: ['run', 'walk', 'any'], STEP: ['run', 'walk', 'any'], TIMED: ['run', 'walk', 'cycle', 'any'] };

/** Where you are, only if location is already allowed: Explore never asks, it just shows what's near when it can. */
function useQuietSpot() {
  const [spot, setSpot] = useState<{ latitude: number; longitude: number } | null>(null);
  const [denied, setDenied] = useState(false);
  const locate = async (ask: boolean) => {
    const permission = await (ask ? Location.requestForegroundPermissionsAsync() : Location.getForegroundPermissionsAsync()).catch(() => null);
    if (!permission?.granted) { if (ask) setDenied(true); return; }
    const position = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 }).catch(() => null)
      ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
    if (position) setSpot({ latitude: position.coords.latitude, longitude: position.coords.longitude });
  };
  useEffect(() => { void locate(false); }, []);
  return { spot, denied, ask: () => void locate(true) };
}

/** Weekly club events for Explore: near you, from your clubs, and the ones you're going to, soonest first. */
function useExploreEvents() {
  const { spot, denied, ask } = useQuietSpot();
  const events = useQuery({
    queryKey: ['club-events', 'explore', spot?.latitude.toFixed(2) ?? 'none', spot?.longitude.toFixed(2) ?? 'none'],
    queryFn: () => api<{ nearby: ClubEvent[]; going: ClubEvent[]; clubs: ClubEvent[] }>(spot ? `/events?lat=${spot.latitude.toFixed(4)}&lon=${spot.longitude.toFixed(4)}&km=50` : '/events'),
  });
  const seen = new Set<string>();
  const all = [...(events.data?.nearby ?? []), ...(events.data?.clubs ?? []), ...(events.data?.going ?? [])].filter((event) => !seen.has(event.id) && seen.add(event.id));
  const upcoming = (rows: ClubEvent[] | undefined) => (rows ?? []).filter((event) => event.nextAt).sort((a, b) => new Date(a.nextAt!).getTime() - new Date(b.nextAt!).getTime());
  return { ...events, list: upcoming(all), nearby: upcoming(events.data?.nearby), going: upcoming(events.data?.going), clubs: upcoming(events.data?.clubs), located: Boolean(spot), denied, ask };
}

const ACTIVITY_CHIPS: Array<{ value: 'all' | ChallengeType; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'RUN', label: 'Run' }, { value: 'WALK', label: 'Walk' }, { value: 'CYCLING', label: 'Ride' },
  { value: 'DISTANCE', label: 'Run + walk' }, { value: 'STEP', label: 'Steps' }, { value: 'TIMED', label: 'Timed' },
];
/** How to browse. "Mine" covers what you host and what you archived, picked underneath. */
type BrowseTab = 'for-you' | 'trending' | 'starting' | 'friends' | 'mine';
const BROWSE: Array<{ value: BrowseTab; label: string }> = [
  { value: 'for-you', label: 'For you' }, { value: 'trending', label: 'Trending' }, { value: 'starting', label: 'Upcoming' },
  { value: 'friends', label: 'Friends' }, { value: 'mine', label: 'Mine' },
];
const TYPE_CHIPS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'Any entry' }, { value: 'free', label: 'Free' }, { value: 'sponsored', label: 'Cash prize' }, { value: 'paid', label: 'Paid' },
];

const DRAFT_STATUSES = ['PENDING_FUNDING', 'PENDING_APPROVAL', 'DRAFT', 'SCHEDULED'];
type DraftTable = { id: string; code: string; title: string; status: string; hosting: boolean; guaranteedPrizeKobo: number | null; createdAt: string };

export default function CompetitionsScreen() {
  const unit = useUnit();
  const now = useNow(60_000);
  const params = useLocalSearchParams<{ q?: string; activity?: string; lens?: string }>();
  const [filter, setFilter] = useState<TypeFilter>('all');
  const queryClient = useQueryClient();
  const profile = useProfile();
  const [lensChoice, setLensChoice] = useState<Lens | null>(null);
  // A link can open Explore on a lens (the tour, the events push): it shows that view without changing your saved choice.
  useEffect(() => {
    if (params.lens === 'events' || params.lens === 'competitions' || params.lens === 'all') setLensChoice(params.lens);
  }, [params.lens]);
  const kind: Lens = lensChoice ?? profile.data?.exploreLens ?? 'all';
  // Your lens is kept on your account, so Explore opens the way you left it on every device.
  const saveLens = useMutation({
    mutationFn: (exploreLens: Lens) => patch<Profile>('/me', { exploreLens }),
    onSuccess(saved) { queryClient.setQueryData(keys.profile, saved); },
  });
  const setLens = (next: Lens) => { haptic('select'); setLensChoice(next); saveLens.mutate(next); };
  const [eventTab, setEventTab] = useState<EventTab>('upcoming');
  const [eventActivity, setEventActivity] = useState<'all' | ClubEvent['activity']>('all');
  const [creating, setCreating] = useState(false);
  const [activity, setActivity] = useState<'all' | ChallengeType>('all');
  const [view, setView] = useState<DiscoverView>('for-you');
  const [term, setTerm] = useState('');
  // Home's search and chips land here with their choice.
  useEffect(() => {
    if (params.q !== undefined) setTerm(params.q);
    if (params.activity && ACTIVITY_CHIPS.some((chip) => chip.value === params.activity)) setActivity(params.activity as ChallengeType);
  }, [params.q, params.activity]);
  const tables = useDiscover(view, filter, activity);
  const loaded = tables.data?.pages.flatMap((page) => page.items) ?? [];
  const mine = useQuery({ queryKey: ['tables', 'mine'], queryFn: () => api<DraftTable[]>('/tables/mine') });
  const query = term.trim().toLowerCase();
  const list = loaded.filter((table) => !query || table.title.toLowerCase().includes(query) || table.code.toLowerCase() === query || (table.creator?.displayName ?? '').toLowerCase().includes(query));
  const drafts = mine.data?.filter((table) => table.hosting && DRAFT_STATUSES.includes(table.status)) ?? [];
  const [draftsOpen, setDraftsOpen] = useState(false);
  const looksLikeCode = /^[0-9A-F]{8}$/i.test(term.trim());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = kind === 'events' ? (eventActivity !== 'all' ? 1 : 0) : (activity !== 'all' ? 1 : 0) + (filter !== 'all' ? 1 : 0);
  const explore = useExploreEvents();
  const showEvents = kind === 'events' || (kind === 'all' && (view === 'for-you' || view === 'starting') && (filter === 'all' || filter === 'free'));
  const weekAway = Date.now() + 7 * 86_400_000;
  const eventSource = kind !== 'events' ? explore.list
    : eventTab === 'near' ? explore.nearby : eventTab === 'passes' ? explore.going : eventTab === 'clubs' ? explore.clubs
      : eventTab === 'week' ? explore.list.filter((event) => new Date(event.nextAt!).getTime() < weekAway) : explore.list;
  const fits = (event: ClubEvent) => kind === 'events'
    ? eventActivity === 'all' || event.activity === eventActivity || event.activity === 'any'
    : activity === 'all' || (EVENT_FITS[activity] ?? []).includes(event.activity);
  const events = showEvents ? eventSource.filter((event) => fits(event) && (!query || `${event.title} ${event.club.name} ${event.venue}`.toLowerCase().includes(query))) : [];
  const competitions = kind === 'events' ? [] : list;
  // Competitions with an event after every two, then any events left over.
  const feed: Array<{ kind: 'competition'; table: (typeof list)[number] } | { kind: 'event'; event: ClubEvent }> = [];
  let nextEvent = 0;
  competitions.forEach((table, index) => {
    feed.push({ kind: 'competition', table });
    if (index % 2 === 1 && nextEvent < events.length) feed.push({ kind: 'event', event: events[nextEvent++] });
  });
  if (!tables.hasNextPage || kind === 'events') events.slice(nextEvent).forEach((event) => feed.push({ kind: 'event', event }));
  const tab: BrowseTab = view === 'created' || view === 'archived' ? 'mine' : (view as BrowseTab);

  const eventDrafts = useQuery({ queryKey: ['club-events', 'drafts'], queryFn: () => api<ClubEvent[]>('/events/drafts') });
  const draftCount = drafts.length + (eventDrafts.data?.length ?? 0);
  const fab = <CreateButton drafts={draftCount} onCreate={() => setCreating(true)} onDrafts={() => setDraftsOpen(true)} />;
  return <TabScreen refreshing={tables.isRefetching} onRefresh={() => { void tables.refetch(); void mine.refetch(); void explore.refetch(); }} overlay={fab}>
    <View style={styles.header}>
      <Txt size={26} weight="extrabold" style={{ letterSpacing: -0.4 }} accessibilityRole="header">Explore</Txt>
    </View>
    <PlaceCards />
    <LensSwitch value={kind} onChange={setLens} />
    <CreateSheet open={creating} onOpenChange={setCreating} />

    <ErrorNotice error={mine.error} onRetry={() => void mine.refetch()} />
    <DraftsSheet open={draftsOpen} onOpenChange={setDraftsOpen} drafts={drafts} events={eventDrafts.data ?? []} />

    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={styles.search}>
        <SearchIcon size={17} color={colors.ink3} />
        <TextInput value={term} onChangeText={setTerm} placeholder={kind === 'events' ? 'Search events, clubs or places' : 'Search or enter a code'} placeholderTextColor={colors.ink3} style={styles.searchInput} autoCapitalize="none" autoCorrect={false}
          returnKeyType={looksLikeCode ? 'go' : 'search'} onSubmitEditing={() => looksLikeCode && openCompetition(term.trim().toUpperCase())} accessibilityLabel="Search competitions or enter an invite code" />
        {looksLikeCode ? <Pressable onPress={() => openCompetition(term.trim().toUpperCase())} hitSlop={8}><Txt size={13} weight="bold">Open</Txt></Pressable>
          : term ? <Pressable onPress={() => setTerm('')} hitSlop={8} accessibilityLabel="Clear search"><CloseIcon size={16} color={colors.ink3} /></Pressable> : null}
      </View>
      <Pressable onPress={() => setFiltersOpen(true)} style={[styles.filterButton, activeFilters > 0 && { backgroundColor: colors.ink }]} accessibilityRole="button" accessibilityLabel={`Filters${activeFilters ? `, ${activeFilters} on` : ''}`}>
        <SlidersIcon size={19} color={activeFilters ? colors.paper : colors.ink} />
        {activeFilters > 0 && <View style={styles.filterBadge}><Txt size={10} weight="bold" color="paper">{activeFilters}</Txt></View>}
      </Pressable>
    </View>

    {/* How to browse: one control that fits a phone; filters live in the sheet. */}
    {kind !== 'events' && <View style={styles.tabs} accessibilityRole="tablist">
      {BROWSE.map((option) => {
        const active = tab === option.value;
        return <Pressable key={option.value} onPress={() => { haptic(); setView(option.value === 'mine' ? 'created' : option.value); }} accessibilityRole="tab" accessibilityState={{ selected: active }}
          style={[styles.tab, active && styles.tabActive]}>
          <Text numberOfLines={1} style={[styles.tabText, active && { color: colors.ink }]}>{option.label}</Text>
        </Pressable>;
      })}
    </View>}
    {kind === 'events' && <View style={styles.tabs} accessibilityRole="tablist">
      {EVENT_TABS.map((option) => {
        const active = eventTab === option.value;
        return <Pressable key={option.value} onPress={() => { haptic(); setEventTab(option.value); if (option.value === 'near' && !explore.located) explore.ask(); }} accessibilityRole="tab" accessibilityState={{ selected: active }}
          style={[styles.tab, active && styles.tabActive]}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tabText, active && { color: colors.ink }]}>{option.label}</Text>
        </Pressable>;
      })}
    </View>}
    {kind !== 'events' && tab === 'mine' && <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
      {([['created', 'Hosting'], ['archived', 'Archived']] as const).map(([value, label]) => <Pressable key={value} onPress={() => setView(value)} style={[styles.pill, view === value && { backgroundColor: colors.ink }]} accessibilityRole="tab" accessibilityState={{ selected: view === value }}>
        <Txt size={13} weight="semibold" color={view === value ? 'paper' : 'ink2'}>{label}</Txt>
      </Pressable>)}
    </View>}

    {kind === 'events' && eventActivity !== 'all' && <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
      <Pressable onPress={() => setEventActivity('all')} style={styles.activeFilter}><Txt size={12} weight="semibold">{EVENT_ACTIVITY.find((chip) => chip.value === eventActivity)?.label}</Txt><CloseIcon size={12} /></Pressable>
    </View>}
    {kind !== 'events' && activeFilters > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      {activity !== 'all' && <Pressable onPress={() => setActivity('all')} style={styles.activeFilter}><Txt size={12} weight="semibold">{ACTIVITY_CHIPS.find((chip) => chip.value === activity)?.label}</Txt><CloseIcon size={12} /></Pressable>}
      {filter !== 'all' && <Pressable onPress={() => setFilter('all')} style={styles.activeFilter}><Txt size={12} weight="semibold">{TYPE_CHIPS.find((chip) => chip.value === filter)?.label}</Txt><CloseIcon size={12} /></Pressable>}
    </View>}

    <Sheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters" footer={<View style={{ flexDirection: 'row', gap: 8 }}>
      <Button variant="secondary" title="Reset" style={{ flex: 1 }} full onPress={() => { setActivity('all'); setFilter('all'); setEventActivity('all'); }} />
      <Button variant="dark" title="Done" style={{ flex: 1 }} full onPress={() => setFiltersOpen(false)} />
    </View>}>
      {kind === 'events' ? <>
        <Txt size={13} weight="semibold" color="ink3" style={{ marginBottom: 8 }}>Activity</Txt>
        <View style={styles.grid}>{EVENT_ACTIVITY.map((option) => <FilterOption key={option.value} label={option.label} active={eventActivity === option.value} onPress={() => setEventActivity(option.value)} width="48%" />)}</View>
        <Txt size={12.5} color="ink3" style={{ marginTop: 12 }}>Events open to everyone show under every activity.</Txt>
      </> : <>
      <Txt size={13} weight="semibold" color="ink3" style={{ marginBottom: 8 }}>Activity</Txt>
      <View style={styles.grid}>{ACTIVITY_CHIPS.map((option) => <FilterOption key={option.value} label={option.label} active={activity === option.value} onPress={() => setActivity(option.value)} width="31%" />)}</View>
      <Txt size={13} weight="semibold" color="ink3" style={{ marginBottom: 8, marginTop: 20 }}>Entry</Txt>
      <View style={styles.grid}>{TYPE_CHIPS.map((option) => <FilterOption key={option.value} label={option.label} active={filter === option.value} onPress={() => setFilter(option.value)} width="48%" />)}</View>
      </>}
    </Sheet>

    <Txt size={12} weight="medium" color="ink3" num style={{ marginTop: 16, marginBottom: 10 }}>
      {tables.data ? `${kind === 'events' ? `${events.length} ${events.length === 1 ? 'event' : 'events'}` : `${competitions.length}${tables.hasNextPage ? '+' : ''} ${view === 'starting' ? 'starting soon' : view === 'created' ? 'you’re hosting' : view === 'archived' ? 'archived' : 'open'}${events.length ? ` · ${events.length} ${events.length === 1 ? 'event' : 'events'}` : ''}`}${query ? ` matching “${term.trim()}”` : ''}` : ' '}
    </Txt>
    <ErrorNotice error={tables.error} onRetry={() => void tables.refetch()} />
    {kind === 'events' && eventTab === 'near' && !explore.located
      ? <EmptyState mark={<PinIcon size={30} color={colors.ink3} />} title="Where are you running?" action={<Button title="Use my location" onPress={explore.ask} />}>
        {explore.denied ? 'Location is off for Jump. Turn it on in Settings, or open Events near me to search a town.' : 'Allow location to see events within 50 km of you.'}
      </EmptyState>
      : tables.isLoading
      ? <View style={{ gap: 12 }}>{[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 176, borderRadius: radius['2xl'] }} />)}</View>
      : feed.length === 0
        ? <EmptyState mark="00"
          title={kind === 'events' ? (query ? 'No events match that' : 'No events yet') : query ? 'Nothing matches that' : view === 'archived' ? 'Nothing archived' : view === 'created' ? 'You haven’t created one yet' : view === 'friends' ? 'Nothing from your people yet' : view === 'for-you' ? 'You’re in everything that fits' : 'No open competitions'}
          action={<Button title={query ? 'Create it yourself' : 'Start the first one'} icon={<PlusIcon size={16} />} onPress={() => setCreating(true)} />}>
          {kind === 'events' ? (eventTab === 'passes' ? 'Get a pass to an event and it shows up here.' : eventTab === 'clubs' ? 'Nothing coming up from clubs you’re in or follow.' : 'Nothing here yet. Follow a few clubs, or host an event yourself.') : query ? 'Try another name, or start a competition and send the code to your crew.' : view === 'archived' ? 'When one of yours is over, archive it from its page to tidy it off your lists.' : 'Create a competition and send the invite code to your crew.'}
        </EmptyState>
        : <>
          <View style={{ gap: 12 }}>{feed.map((item) => item.kind === 'event'
            ? <ExploreEventCard key={`event-${item.event.id}`} event={item.event} unit={unit} />
            : <CompetitionPreviewCard key={item.table.id} table={item.table} unit={unit} now={now} tagged={events.length > 0} />)}</View>
          {tables.hasNextPage && kind !== 'events' && <Button full variant="secondary" style={{ marginTop: 20 }} loading={tables.isFetchingNextPage} title={tables.isFetchingNextPage ? 'Loading…' : 'Load more'} onPress={() => void tables.fetchNextPage()} />}
        </>}
    {/* Room under the last card so the create button never covers it. */}
    <View style={{ height: 72 }} />
  </TabScreen>;
}

function FilterOption({ label, active, onPress, width }: { label: string; active: boolean; onPress: () => void; width: `${number}%` }) {
  return <Pressable onPress={() => { haptic(); onPress(); }} accessibilityRole="radio" accessibilityState={{ checked: active }}
    style={[styles.filterOption, { width }, active && { borderColor: colors.edge, backgroundColor: colors.ink }]}>
    <Txt size={14} weight="semibold" color={active ? 'paper' : 'ink'} numberOfLines={1}>{label}</Txt>
  </Pressable>;
}

/** Everything the host started but hasn't opened: finish it (fund it, or wait on review) or throw it away. */
function DraftsSheet({ open, onOpenChange, drafts, events }: { open: boolean; onOpenChange: (open: boolean) => void; drafts: DraftTable[]; events: ClubEvent[] }) {
  const queryClient = useQueryClient();
  const total = drafts.length + events.length;
  const discardEvent = useMutation({
    mutationFn: (id: string) => api(`/events/${id}`, { method: 'DELETE' }),
    onSuccess(_, id) {
      toast({ tone: 'ok', message: 'Draft discarded.' });
      queryClient.setQueryData<ClubEvent[]>(['club-events', 'drafts'], (rows) => rows?.filter((row) => row.id !== id));
      if (total <= 1) onOpenChange(false);
    },
  });
  const discard = useMutation({
    mutationFn: (id: string) => post(`/tables/${id}/discard`),
    onSuccess(_, id) {
      toast({ tone: 'ok', message: 'Draft discarded.' });
      queryClient.setQueryData<DraftTable[]>(['tables', 'mine'], (rows) => rows?.filter((row) => row.id !== id));
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
      if (total <= 1) onOpenChange(false);
    },
  });
  const confirmDiscard = (draft: DraftTable) => void confirm({ title: `Discard ${draft.title}?`, message: 'This can’t be undone.', cancelLabel: 'Keep', confirmLabel: 'Discard', destructive: true })
    .then((ok) => { if (ok) discard.mutate(draft.id); });

  return <Sheet open={open} onOpenChange={onOpenChange} title="Drafts" description="Nobody can join these until they’re live.">
    <ErrorNotice error={discard.error ?? discardEvent.error} />
    {events.map((event, index) => <View key={event.id} style={[styles.draftRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={15} weight="semibold" numberOfLines={1}>{event.title}</Txt>
        <Txt size={12} color="ink3" numberOfLines={2} style={{ marginTop: 2 }}>{`Event draft · ${event.club.name}`}</Txt>
      </View>
      <Pressable onPress={() => void confirm({ title: `Discard ${event.title}?`, message: 'This can’t be undone.', cancelLabel: 'Keep', confirmLabel: 'Discard', destructive: true }).then((ok) => { if (ok) discardEvent.mutate(event.id); })}
        hitSlop={6} style={({ pressed }) => [styles.trash, pressed && { backgroundColor: colors.badWash }]} accessibilityLabel={`Discard ${event.title}`}><TrashIcon size={16} color={colors.ink3} /></Pressable>
      <Pressable onPress={() => { onOpenChange(false); router.push(`/events/${event.id}`); }} style={styles.fund} accessibilityRole="button"><Txt size={13} weight="bold" color="paper">View</Txt></Pressable>
    </View>)}
    {drafts.map((draft, index) => {
      const review = draft.status === 'PENDING_APPROVAL';
      const club = draft.status === 'DRAFT' || draft.status === 'SCHEDULED';
      return <View key={draft.id} style={[styles.draftRow, (index > 0 || events.length > 0) && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={15} weight="semibold" numberOfLines={1}>{draft.title}</Txt>
          <Txt size={12} color="ink3" numberOfLines={2} style={{ marginTop: 2 }}>
            {`${club ? (draft.status === 'DRAFT' ? 'Competition draft · publish it when it’s ready' : 'Scheduled to open') : review ? 'Waiting for Jump to review' : draft.guaranteedPrizeKobo ? `Fund the ${formatMoney(draft.guaranteedPrizeKobo).replace(/\.00$/, '')} prize to open entry` : 'Fund the prize to open entry'} · started ${formatDate(draft.createdAt)}`}
          </Txt>
        </View>
        <Pressable onPress={() => confirmDiscard(draft)} hitSlop={6} style={({ pressed }) => [styles.trash, pressed && { backgroundColor: colors.badWash }]} accessibilityLabel={`Discard ${draft.title}`}><TrashIcon size={16} color={colors.ink3} /></Pressable>
        <Pressable onPress={() => { onOpenChange(false); openCompetition(draft.code); }} style={styles.fund} accessibilityRole="button"><Txt size={13} weight="bold" color="paper">{review || club ? 'View' : 'Fund'}</Txt></Pressable>
      </View>;
    })}
  </Sheet>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  lenses: { flexDirection: 'row', alignItems: 'flex-end', gap: 22, marginBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  lens: { fontFamily: fontFamily('black', 'wide'), fontSize: 15, letterSpacing: 0.3, textTransform: 'uppercase' },
  fab: { position: 'absolute', right: 16 },
  fabFace: { width: 60, height: 60, borderRadius: 18, borderWidth: 2, borderColor: brand.ink, backgroundColor: brand.track, alignItems: 'center', justifyContent: 'center' },
  fabBadge: { position: 'absolute', top: -7, right: -7, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, borderWidth: 2, borderColor: colors.paper, backgroundColor: brand.ink, alignItems: 'center', justifyContent: 'center' },
  places: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.xl, borderWidth: 2, borderColor: colors.edge, backgroundColor: colors.card, paddingVertical: 10, paddingLeft: 10, paddingRight: 8 },
  placeIcon: { width: 38, height: 38, borderRadius: 12, borderWidth: 2, borderColor: brand.ink, alignItems: 'center', justifyContent: 'center' },
  lensBar: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, borderRadius: 2 },
  createOption: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card },
  createIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.inkWash, alignItems: 'center', justifyContent: 'center' },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontFamily: fontFamily('regular'), fontSize: 16, color: colors.ink },
  filterButton: { width: 46, height: 46, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  filterBadge: { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.paper, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabs: { flexDirection: 'row', marginTop: 16, borderRadius: radius.xl, backgroundColor: colors.inkWash, padding: 4 },
  tab: { flex: 1, height: 36, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  tabActive: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.edge },
  tabText: { fontFamily: fontFamily('semibold'), fontSize: 13, color: colors.ink2 },
  pill: { height: 32, borderRadius: radius.full, backgroundColor: colors.inkWash, paddingHorizontal: 14, justifyContent: 'center' },
  activeFilter: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, borderRadius: radius.full, backgroundColor: 'rgba(18,18,18,0.07)', paddingHorizontal: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterOption: { height: 42, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  draftRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  trash: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  fund: { height: 36, borderRadius: radius.full, backgroundColor: colors.ink, paddingHorizontal: 16, justifyContent: 'center' },
});

/**
 * What Explore shows, as big words: everything, just events, or just competitions. The chosen one is ink
 * with an orange bar under it; the others sit back in grey.
 */
function LensSwitch({ value, onChange }: { value: Lens; onChange: (lens: Lens) => void }) {
  return <View style={styles.lenses}>
      {LENSES.map((lens) => {
        const on = lens.value === value;
        return <Pressable key={lens.value} onPress={() => onChange(lens.value)} accessibilityRole="tab" accessibilityState={{ selected: on }} hitSlop={6} style={{ paddingBottom: 8 }}>
          <Text style={[styles.lens, { color: on ? colors.ink : colors.ink3 }]}>{lens.label}</Text>
          <View style={[styles.lensBar, { backgroundColor: on ? colors.track : 'transparent' }]} />
        </Pressable>;
      })}
  </View>;
}

type MyPrize = { status: string };

/**
 * Clubs and Prizes, as two cards above the switch: places to go rather than ways to filter, each with a
 * live line so there's a reason to tap.
 */
function PlaceCards() {
  const clubs = useQuery({ queryKey: ['clubs', 'mine'], queryFn: () => api<ClubSummary[]>('/clubs?view=mine') });
  const prizes = useQuery({ queryKey: ['prizes', 'mine'], queryFn: () => api<MyPrize[]>('/prizes/mine') });
  const clubCount = clubs.data?.filter((club) => club.myRole).length ?? 0;
  const toClaim = prizes.data?.filter((prize) => prize.status === 'AWAITING_DETAILS').length ?? 0;
  const cards = [
    { label: 'Clubs', line: clubCount ? `Your ${clubCount} ${clubCount === 1 ? 'club' : 'clubs'}` : 'Find your crew', href: '/clubs' as const, icon: <UsersIcon size={20} color={brand.ink} />, tint: '#8B7CF6', alert: false },
    { label: 'Prizes', line: toClaim ? `${toClaim} to claim` : prizes.data?.length ? `${prizes.data.length} won` : 'What you can win', href: '/prizes' as const, icon: <CrownIcon size={20} color={brand.ink} />, tint: '#FFC53D', alert: toClaim > 0 },
  ];
  return <View style={styles.places}>
    {cards.map((card) => <Pressable key={card.href} onPress={() => { haptic(); router.push(card.href); }} accessibilityRole="link" accessibilityLabel={`${card.label}: ${card.line}`} style={{ flex: 1 }}>
      {({ pressed }) => <HardShadow offset={3} radius={radius.xl} pressed={pressed}>
        <View style={styles.place}>
          <View style={[styles.placeIcon, { backgroundColor: card.tint }]}>{card.icon}</View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt size={15} weight="extrabold" numberOfLines={1}>{card.label}</Txt>
            <Txt size={12.5} weight={card.alert ? 'bold' : 'regular'} color={card.alert ? 'track' : 'ink2'} numberOfLines={1}>{card.line}</Txt>
          </View>
          <ChevronRightIcon size={15} color={colors.ink3} />
        </View>
      </HardShadow>}
    </Pressable>)}
  </View>;
}

/**
 * Create, where a thumb reaches it: a square plus over the bottom-right of Explore. Tap to create; hold to
 * open your drafts, with a count on the corner while you have any.
 */
function CreateButton({ drafts, onCreate, onDrafts }: { drafts: number; onCreate: () => void; onDrafts: () => void }) {
  const barInset = useContext(BottomBarInset);
  return <Pressable onPress={() => { haptic('medium'); onCreate(); }}
    onLongPress={() => { haptic('heavy'); if (drafts) onDrafts(); else toast({ tone: 'ok', message: 'No drafts. Anything you save for later shows up here.' }); }} delayLongPress={380}
    accessibilityRole="button" accessibilityLabel="Create" accessibilityHint={drafts ? `Hold to see your ${drafts} ${drafts === 1 ? 'draft' : 'drafts'}` : 'Create a competition or an event'}
    style={[styles.fab, { bottom: barInset + 14 }]}>
    {({ pressed }) => <HardShadow offset={4} radius={18} pressed={pressed}>
      <View style={styles.fabFace}><PlusIcon size={26} color={brand.ink} strokeWidth={2.6} /></View>
      {drafts ? <View style={styles.fabBadge}><Txt size={11} weight="bold" num style={{ color: brand.paper }}>{drafts > 9 ? '9+' : drafts}</Txt></View> : null}
    </HardShadow>}
  </Pressable>;
}

/** Create: a competition anyone can take part in from anywhere, or an in-person event for a club you run. */
function CreateSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [step, setStep] = useState<'choose' | 'club'>('choose');
  const clubs = useQuery({ queryKey: ['clubs', 'mine'], queryFn: () => api<ClubSummary[]>('/clubs?view=mine'), enabled: open });
  const managed = (clubs.data ?? []).filter((club) => isManager(club.myRole));
  useEffect(() => { if (!open) setStep('choose'); }, [open]);
  const go = (href: Parameters<typeof router.push>[0]) => { onOpenChange(false); router.push(href); };
  const newEvent = (slug: string) => go({ pathname: '/events/edit', params: { club: slug } });
  // The event form asks which club is hosting first; only someone with no club to host from stops here.
  const pickEvent = () => {
    haptic();
    if (managed.length) go('/events/edit');
    else setStep('club');
  };

  const option = (icon: React.ReactNode, title: string, body: string, onPress: () => void) => <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
    style={({ pressed }) => [styles.createOption, pressed && { backgroundColor: colors.inkWash }]}>
    <View style={styles.createIcon}>{icon}</View>
    <View style={{ flex: 1, gap: 4 }}>
      <Txt size={18} weight="bold">{title}</Txt>
      <Txt size={14} color="ink2" leading={1.4}>{body}</Txt>
    </View>
    <ChevronRightIcon size={18} color={colors.ink2} />
  </Pressable>;

  if (step === 'club') {
    return <Sheet open={open} onOpenChange={onOpenChange} title={managed.length ? 'Which club is hosting?' : 'Events are hosted by clubs'}
      description={managed.length ? 'Your event goes on the club’s page, and its members and followers hear about it.' : 'Start a club for your crew, then add your first event. It takes a minute.'}>
      {clubs.isLoading ? <Skeleton style={{ height: 120, borderRadius: radius['2xl'] }} />
        : managed.length ? <View style={{ gap: 10 }}>{managed.map((club) => <Pressable key={club.id} onPress={() => newEvent(club.slug)} accessibilityRole="button"
          style={({ pressed }) => [styles.createOption, { paddingVertical: 12 }, pressed && { backgroundColor: colors.inkWash }]}>
          <ClubLogo club={club} size={44} />
          <Txt size={16} weight="bold" numberOfLines={1} style={{ flex: 1 }}>{club.name}</Txt>
          <ChevronRightIcon size={18} color={colors.ink2} />
        </Pressable>)}</View>
          : <View style={{ gap: 10 }}>
            <Button full variant="primary" title="Start a club" icon={<PlusIcon size={16} color={colors.onAccent} />} onPress={() => go('/clubs')} />
            <Button full variant="quiet" title="Back" onPress={() => setStep('choose')} />
          </View>}
    </Sheet>;
  }

  return <Sheet open={open} onOpenChange={onOpenChange} title="What would you like to create?" description="Choose what you want people to do.">
    <View style={{ gap: 12 }}>
      {option(<CrownIcon size={22} />, 'Competition', 'Set a goal, rules and duration. People take part from anywhere and track their results.', () => go('/competitions/new'))}
      {option(<CalendarIcon size={22} />, 'Event', 'Set a day, time, place and activity. People RSVP, get reminded and show up in person.', pickEvent)}
      <Txt size={13} color="ink3" leading={1.45} style={{ marginTop: 4 }}>Events are hosted by a club you run: one-off, weekly, every two weeks or monthly. Everyone who joins gets a pass.</Txt>
    </View>
  </Sheet>;
}
