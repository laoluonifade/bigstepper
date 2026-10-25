import { formatDate, formatMoney } from '@jump/shared/format';
import type { ChallengeType } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CompetitionPreviewCard, openCompetition } from '@/components/competition';
import { ArrowRightIcon, CloseIcon, PlayIcon, PlusIcon, SearchIcon, SlidersIcon, TrashIcon } from '@/components/icons';
import { TabScreen } from '@/components/Shell';
import { Sheet } from '@/components/Sheet';
import { Button, EmptyState, ErrorNotice, haptic, Skeleton, Txt, useNow } from '@/components/ui';
import { api, post } from '@/lib/api';
import { useDiscover, useUnit, type DiscoverView } from '@/lib/queries';
import { colors, fontFamily, radius } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { confirm } from '@/lib/dialog';

type TypeFilter = 'all' | 'free' | 'sponsored' | 'paid';

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
  const params = useLocalSearchParams<{ q?: string; activity?: string }>();
  const [filter, setFilter] = useState<TypeFilter>('all');
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
  const activeFilters = (activity !== 'all' ? 1 : 0) + (filter !== 'all' ? 1 : 0);
  const tab: BrowseTab = view === 'created' || view === 'archived' ? 'mine' : (view as BrowseTab);

  return <TabScreen refreshing={tables.isRefetching} onRefresh={() => { void tables.refetch(); void mine.refetch(); }}>
    <View style={styles.header}>
      <Txt size={26} weight="extrabold" style={{ letterSpacing: -0.4 }} accessibilityRole="header">Competitions</Txt>
      <Pressable onPress={() => { haptic(); router.push('/competitions/new'); }} style={({ pressed }) => [styles.create, pressed && { transform: [{ scale: 0.95 }] }]} accessibilityRole="button">
        <PlusIcon size={15} color={colors.paper} /><Txt size={14} weight="bold" color="paper">Create</Txt>
      </Pressable>
    </View>
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
      {([['Leaderboard', '/leaderboard'], ['Clubs', '/clubs'], ['Prizes', '/prizes']] as const).map(([label, href]) => <Pressable key={href} onPress={() => router.push(href)} style={({ pressed }) => [styles.subNav, pressed && { borderColor: colors.edge }]} accessibilityRole="link">
        <Txt size={13} weight="semibold">{label}</Txt><ArrowRightIcon size={13} />
      </Pressable>)}
    </View>

    {/* Shown while Strava connections are limited: recording in Jump always counts. */}
    <Pressable onPress={() => router.navigate('/run')} style={({ pressed }) => [styles.record, pressed && { backgroundColor: colors.volt }]} accessibilityRole="link">
      <View style={styles.recordIcon}><PlayIcon size={12} /></View>
      <Txt size={13} leading={1.35} style={{ flex: 1 }}><Txt size={13} weight="bold">Record your runs in Jump</Txt> while Strava connections are limited.</Txt>
      <ArrowRightIcon size={14} />
    </Pressable>

    <ErrorNotice error={mine.error} onRetry={() => void mine.refetch()} />
    {drafts.length > 0 && <Pressable onPress={() => setDraftsOpen(true)} style={({ pressed }) => [styles.drafts, pressed && { borderColor: colors.edge }]} accessibilityRole="button">
      <View style={styles.draftCount}><Txt size={12} weight="bold" color="paper" num>{drafts.length}</Txt></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={14} weight="semibold">{drafts.length === 1 ? 'Draft' : 'Drafts'} not live yet</Txt>
        <Txt size={12} color="ink3" numberOfLines={1}>{drafts.map((draft) => draft.title).join(' · ')}</Txt>
      </View>
      <Txt size={13} weight="bold">Manage</Txt><ArrowRightIcon size={14} />
    </Pressable>}
    <DraftsSheet open={draftsOpen} onOpenChange={setDraftsOpen} drafts={drafts} />

    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={styles.search}>
        <SearchIcon size={17} color={colors.ink3} />
        <TextInput value={term} onChangeText={setTerm} placeholder="Search or enter a code" placeholderTextColor={colors.ink3} style={styles.searchInput} autoCapitalize="none" autoCorrect={false}
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
    <View style={styles.tabs} accessibilityRole="tablist">
      {BROWSE.map((option) => {
        const active = tab === option.value;
        return <Pressable key={option.value} onPress={() => { haptic(); setView(option.value === 'mine' ? 'created' : option.value); }} accessibilityRole="tab" accessibilityState={{ selected: active }}
          style={[styles.tab, active && styles.tabActive]}>
          <Text numberOfLines={1} style={[styles.tabText, active && { color: colors.ink }]}>{option.label}</Text>
        </Pressable>;
      })}
    </View>
    {tab === 'mine' && <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
      {([['created', 'Hosting'], ['archived', 'Archived']] as const).map(([value, label]) => <Pressable key={value} onPress={() => setView(value)} style={[styles.pill, view === value && { backgroundColor: colors.ink }]} accessibilityRole="tab" accessibilityState={{ selected: view === value }}>
        <Txt size={13} weight="semibold" color={view === value ? 'paper' : 'ink2'}>{label}</Txt>
      </Pressable>)}
    </View>}

    {activeFilters > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      {activity !== 'all' && <Pressable onPress={() => setActivity('all')} style={styles.activeFilter}><Txt size={12} weight="semibold">{ACTIVITY_CHIPS.find((chip) => chip.value === activity)?.label}</Txt><CloseIcon size={12} /></Pressable>}
      {filter !== 'all' && <Pressable onPress={() => setFilter('all')} style={styles.activeFilter}><Txt size={12} weight="semibold">{TYPE_CHIPS.find((chip) => chip.value === filter)?.label}</Txt><CloseIcon size={12} /></Pressable>}
    </View>}

    <Sheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters" footer={<View style={{ flexDirection: 'row', gap: 8 }}>
      <Button variant="secondary" title="Reset" style={{ flex: 1 }} full onPress={() => { setActivity('all'); setFilter('all'); }} />
      <Button variant="dark" title="Done" style={{ flex: 1 }} full onPress={() => setFiltersOpen(false)} />
    </View>}>
      <Txt size={13} weight="semibold" color="ink3" style={{ marginBottom: 8 }}>Activity</Txt>
      <View style={styles.grid}>{ACTIVITY_CHIPS.map((option) => <FilterOption key={option.value} label={option.label} active={activity === option.value} onPress={() => setActivity(option.value)} width="31%" />)}</View>
      <Txt size={13} weight="semibold" color="ink3" style={{ marginBottom: 8, marginTop: 20 }}>Entry</Txt>
      <View style={styles.grid}>{TYPE_CHIPS.map((option) => <FilterOption key={option.value} label={option.label} active={filter === option.value} onPress={() => setFilter(option.value)} width="48%" />)}</View>
    </Sheet>

    <Txt size={12} weight="medium" color="ink3" num style={{ marginTop: 16, marginBottom: 10 }}>
      {tables.data ? `${list.length}${tables.hasNextPage ? '+' : ''} ${view === 'starting' ? 'starting soon' : view === 'created' ? 'you’re hosting' : view === 'archived' ? 'archived' : 'open'}${query ? ` matching “${term.trim()}”` : ''}` : ' '}
    </Txt>
    <ErrorNotice error={tables.error} onRetry={() => void tables.refetch()} />
    {tables.isLoading
      ? <View style={{ gap: 12 }}>{[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 176, borderRadius: radius['2xl'] }} />)}</View>
      : list.length === 0
        ? <EmptyState mark="00"
          title={query ? 'Nothing matches that' : view === 'archived' ? 'Nothing archived' : view === 'created' ? 'You haven’t created one yet' : view === 'friends' ? 'Nothing from your people yet' : view === 'for-you' ? 'You’re in everything that fits' : 'No open competitions'}
          action={<Button title={query ? 'Create it yourself' : 'Start the first one'} icon={<PlusIcon size={16} />} onPress={() => router.push('/competitions/new')} />}>
          {query ? 'Try another name, or start a competition and send the code to your crew.' : view === 'archived' ? 'When one of yours is over, archive it from its page to tidy it off your lists.' : 'Create a competition and send the invite code to your crew.'}
        </EmptyState>
        : <>
          <View style={{ gap: 12 }}>{list.map((table) => <CompetitionPreviewCard key={table.id} table={table} unit={unit} now={now} />)}</View>
          {tables.hasNextPage && <Button full variant="secondary" style={{ marginTop: 20 }} loading={tables.isFetchingNextPage} title={tables.isFetchingNextPage ? 'Loading…' : 'Load more'} onPress={() => void tables.fetchNextPage()} />}
        </>}
  </TabScreen>;
}

function FilterOption({ label, active, onPress, width }: { label: string; active: boolean; onPress: () => void; width: `${number}%` }) {
  return <Pressable onPress={() => { haptic(); onPress(); }} accessibilityRole="radio" accessibilityState={{ checked: active }}
    style={[styles.filterOption, { width }, active && { borderColor: colors.edge, backgroundColor: colors.ink }]}>
    <Txt size={14} weight="semibold" color={active ? 'paper' : 'ink'} numberOfLines={1}>{label}</Txt>
  </Pressable>;
}

/** Everything the host started but hasn't opened: finish it (fund it, or wait on review) or throw it away. */
function DraftsSheet({ open, onOpenChange, drafts }: { open: boolean; onOpenChange: (open: boolean) => void; drafts: DraftTable[] }) {
  const queryClient = useQueryClient();
  const discard = useMutation({
    mutationFn: (id: string) => post(`/tables/${id}/discard`),
    onSuccess(_, id) {
      toast({ tone: 'ok', message: 'Draft discarded.' });
      queryClient.setQueryData<DraftTable[]>(['tables', 'mine'], (rows) => rows?.filter((row) => row.id !== id));
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
      if (drafts.length <= 1) onOpenChange(false);
    },
  });
  const confirmDiscard = (draft: DraftTable) => void confirm({ title: `Discard ${draft.title}?`, message: 'This can’t be undone.', cancelLabel: 'Keep', confirmLabel: 'Discard', destructive: true })
    .then((ok) => { if (ok) discard.mutate(draft.id); });

  return <Sheet open={open} onOpenChange={onOpenChange} title="Drafts" description="Nobody can join these until they’re live.">
    <ErrorNotice error={discard.error} />
    {drafts.map((draft, index) => {
      const review = draft.status === 'PENDING_APPROVAL';
      const club = draft.status === 'DRAFT' || draft.status === 'SCHEDULED';
      return <View key={draft.id} style={[styles.draftRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={15} weight="semibold" numberOfLines={1}>{draft.title}</Txt>
          <Txt size={12} color="ink3" numberOfLines={2} style={{ marginTop: 2 }}>
            {`${club ? (draft.status === 'DRAFT' ? 'Club draft · publish it when it’s ready' : 'Scheduled to open') : review ? 'Waiting for Jump to review' : draft.guaranteedPrizeKobo ? `Fund the ${formatMoney(draft.guaranteedPrizeKobo).replace(/\.00$/, '')} prize to open entry` : 'Fund the prize to open entry'} · started ${formatDate(draft.createdAt)}`}
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
  create: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderRadius: radius.full, backgroundColor: colors.ink, paddingHorizontal: 16 },
  subNav: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 12 },
  record: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: 'rgba(228,255,58,0.6)', paddingVertical: 8, paddingLeft: 8, paddingRight: 12, marginBottom: 16 },
  recordIcon: { width: 28, height: 28, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.track, alignItems: 'center', justifyContent: 'center' },
  drafts: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.xl, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(18,18,18,0.4)', paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  draftCount: { minWidth: 28, height: 28, borderRadius: 14, backgroundColor: colors.ink, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
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
