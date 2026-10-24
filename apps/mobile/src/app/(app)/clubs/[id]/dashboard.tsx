import { countryName } from '@jump/shared/countries';
import { formatDate, formatDateTime, fromLocalInput, toLocalInput } from '@jump/shared/format';
import { EMPTY_PRIZES, PRIZE_KIND, prizeProblem, prizesPayload, type PrizeDraft } from '@jump/shared/prizes';
import type { ClubClaim, ClubDashboard, ClubSeries, CompetitionTable } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { CountriesField, PrizeEditor } from '@/components/ClubPrizes';
import { DateTimePicker } from '@/components/DateTimePicker';
import { PlusIcon } from '@/components/icons';
import { Sheet } from '@/components/Sheet';
import { Button, EmptyState, ErrorNotice, Eyebrow, haptic, HardShadow, Loading, Notice, Screen, Skeleton, TextField, Txt } from '@/components/ui';
import { api, isApiError, patch, post } from '@/lib/api';
import { colors, GUTTER, radius } from '@/lib/theme';
import { toast } from '@/lib/toast';

type Tab = 'competitions' | 'series' | 'prizes' | 'results' | 'performance';
type Competition = ClubDashboard['challenges'][number];

const PHASE: Record<Competition['phase'], { label: string; bg: string; fg: string }> = {
  draft: { label: 'Draft', bg: colors.inkFaint, fg: colors.ink2 },
  scheduled: { label: 'Scheduled', bg: colors.volt, fg: colors.ink },
  upcoming: { label: 'Upcoming', bg: colors.ink, fg: colors.paper },
  live: { label: 'Live', bg: colors.track, fg: colors.white },
  finished: { label: 'Finished', bg: colors.okWash, fg: colors.ok },
};

const CLAIM_STATUS: Record<ClubClaim['status'], string> = {
  AWAITING_DETAILS: 'Waiting for the winner', DETAILS_SUBMITTED: 'Claimed · ready for you', READY_FOR_DISPATCH: 'Being prepared',
  SHIPPED: 'Sent', DELIVERED: 'Delivered', FORFEITED: 'Passed on', ISSUE: 'Problem',
};

const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '–');

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return <View style={{ borderRadius: radius.full, backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 2 }}><Txt size={10.5} weight="extrabold" upper tracking={0.06} style={{ color: fg }}>{label}</Txt></View>;
}

/**
 * Everything a club (a run club or a brand) needs to run competitions on its own: what's live, drafts to
 * finish, series, prize claims, past winners and how it's going over time.
 */
export default function ClubDashboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const dashboard = useQuery({ queryKey: ['club', id, 'dashboard'], queryFn: () => api<ClubDashboard>(`/clubs/${encodeURIComponent(id)}/dashboard`) });
  const [tab, setTab] = useState<Tab>('competitions');
  if (dashboard.isLoading) return <Screen><Stack.Screen options={{ title: 'Dashboard' }} /><Loading /></Screen>;
  if (dashboard.error || !dashboard.data) {
    return <Screen>
      <Stack.Screen options={{ title: 'Dashboard' }} />
      {isApiError(dashboard.error, 403) ? <EmptyState title="For the club’s managers">Only the club’s owner and managers can see its dashboard.</EmptyState> : <ErrorNotice error={dashboard.error} onRetry={() => void dashboard.refetch()} />}
    </Screen>;
  }
  const d = dashboard.data;
  const t = d.totals;
  const waiting = d.claims.filter((claim) => claim.status === 'DETAILS_SUBMITTED' || claim.status === 'ISSUE').length;
  const tabs: Array<{ value: Tab; label: string; count?: number }> = [
    { value: 'competitions', label: 'Competitions', count: d.challenges.filter((row) => row.phase === 'draft').length || undefined },
    { value: 'series', label: 'Series' },
    { value: 'prizes', label: 'Prizes', count: waiting || undefined },
    { value: 'results', label: 'Winners' },
    { value: 'performance', label: 'Performance' },
  ];

  return <Screen refreshing={dashboard.isRefetching} onRefresh={() => void dashboard.refetch()}>
    <Stack.Screen options={{ title: 'Dashboard' }} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Eyebrow>{`Club dashboard · ${d.club.label} plan`}</Eyebrow>
        <Txt size={24} weight="extrabold" numberOfLines={1} style={{ marginTop: 2 }}>{d.club.name}</Txt>
      </View>
      {!d.club.suspendedAt && <Button size="sm" title="New competition" icon={<PlusIcon size={15} />} onPress={() => router.push({ pathname: '/competitions/new', params: { club: d.club.slug } })} />}
    </View>
    {d.club.suspendedAt && <Notice tone="bad" title="Suspended by Jump" style={{ marginBottom: 20 }}>{`${d.club.suspendedReason ?? 'This club can’t run competitions right now.'} Contact Jump support to resolve it.`}</Notice>}

    <View style={styles.stats}>
      <Stat label="Followers" value={t.followers} hint={`+${t.newFollowers30d} in 30 days`} />
      <Stat label="Members" value={t.members} hint="in the club" />
      <Stat label="Participants" value={t.participants} hint={`${t.entries} entries`} />
      <Stat label="Repeat" value={t.repeatParticipants} hint={`${percent(t.repeatParticipants, t.participants)} came back`} />
      <Stat label="Completion" value={percent(t.completions, t.entries)} hint={`${t.completions} finished`} />
      <Stat label="Competitions" value={t.challenges} hint={`up to ${d.club.liveChallenges} live`} />
    </View>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={{ gap: 20 }} accessibilityRole="tablist">
      {tabs.map((option) => <Pressable key={option.value} onPress={() => { haptic(); setTab(option.value); }} accessibilityRole="tab" accessibilityState={{ selected: tab === option.value }} style={[styles.tab, tab === option.value && { borderBottomColor: colors.ink }]}>
        <Txt size={15} weight="semibold" color={tab === option.value ? 'ink' : 'ink3'}>{option.label}</Txt>
        {option.count ? <View style={styles.count}><Txt size={11} weight="bold" color="white" num>{option.count}</Txt></View> : null}
      </Pressable>)}
    </ScrollView>

    <View style={{ marginTop: 20 }}>
      {tab === 'competitions' && <Competitions data={d} clubRef={id} />}
      {tab === 'series' && <SeriesList data={d} clubRef={id} />}
      {tab === 'prizes' && <Claims claims={d.claims} clubRef={id} />}
      {tab === 'results' && <Winners winners={d.winners} />}
      {tab === 'performance' && <Performance monthly={d.monthly} competitions={d.challenges} />}
    </View>
  </Screen>;
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return <View style={styles.stat}>
    <Txt size={12} weight="semibold" color="ink2">{label}</Txt>
    <Txt size={26} weight="extrabold" num leading={1.2}>{value}</Txt>
    <Txt size={11} color="ink3" numberOfLines={1}>{hint}</Txt>
  </View>;
}

function useRefresh(clubRef: string) {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['club', clubRef, 'dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['club'] }),
    queryClient.invalidateQueries({ queryKey: ['tables'] }),
  ]);
}

/* ───────── Competitions ───────── */

function Competitions({ data, clubRef }: { data: ClubDashboard; clubRef: string }) {
  const groups: Array<[string, Competition[]]> = [
    ['Not public yet', data.challenges.filter((row) => row.phase === 'draft' || row.phase === 'scheduled')],
    ['Live and upcoming', data.challenges.filter((row) => row.phase === 'live' || row.phase === 'upcoming')],
    ['Finished', data.challenges.filter((row) => row.phase === 'finished')],
  ];
  if (!data.challenges.length) {
    return <EmptyState title="No competitions yet" action={<Button size="sm" title="Create the first one" icon={<PlusIcon size={15} />} onPress={() => router.push({ pathname: '/competitions/new', params: { club: data.club.slug } })} />}>
      Create a competition with prizes, publish it now or later, and share the link with your community.
    </EmptyState>;
  }
  return <View style={{ gap: 28 }}>
    {groups.filter(([, rows]) => rows.length).map(([title, rows]) => <View key={title}>
      <Txt size={13} weight="extrabold" upper tracking={0.08} color="ink2" style={{ marginBottom: 10 }}>{title}</Txt>
      <View style={styles.list}>{rows.map((row, index) => <View key={row.id} style={index > 0 ? styles.line : undefined}><ChallengeRow row={row} clubRef={clubRef} /></View>)}</View>
    </View>)}
  </View>;
}

function ChallengeRow({ row, clubRef }: { row: Competition; clubRef: string }) {
  const refresh = useRefresh(clubRef);
  const [sheet, setSheet] = useState<'edit' | 'schedule' | 'repeat' | null>(null);
  const publish = useMutation({
    mutationFn: (at?: string) => post(`/tables/${row.id}/publish`, at ? { at } : {}),
    async onSuccess(_, at) { await refresh(); setSheet(null); haptic('success'); toast({ tone: 'ok', message: at ? `Scheduled for ${formatDateTime(at)}.` : 'Published. Your followers have been told.' }); },
  });
  const duplicate = useMutation({
    mutationFn: () => post<CompetitionTable>(`/tables/${row.id}/duplicate`, {}),
    async onSuccess() { await refresh(); toast({ tone: 'ok', message: 'Copied as a draft. Change its dates and prizes, then publish it.' }); },
  });
  const unpublished = row.phase === 'draft' || row.phase === 'scheduled';
  const repeatable = row.type === 'free' && Boolean(row.scoringClosesAt);
  return <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      <Pill {...PHASE[row.phase]} />
      {row.edition ? <Pill label={`Edition ${row.edition}`} bg={colors.inkWash} fg={colors.ink} /> : null}
      {row.hasPrizes ? <Pill label="Prizes" bg={colors.volt} fg={colors.ink} /> : null}
    </View>
    <Pressable onPress={() => router.push(`/competitions/${row.code}`)} style={{ marginTop: 4 }}><Txt size={15} weight="bold" numberOfLines={1}>{row.title}</Txt></Pressable>
    <Txt size={12} color="ink2" num style={{ marginTop: 2 }}>
      {`${row.phase === 'scheduled' && row.publishAt ? `Opens ${formatDateTime(row.publishAt)} · ` : ''}${row.startsAt ? formatDate(row.startsAt) : ''}${row.scoringClosesAt ? ` – ${formatDate(row.scoringClosesAt)}` : ' · no end date'}${!unpublished ? ` · ${row.entrants}${row.capacity ? `/${row.capacity}` : ''} in · ${percent(row.completed, row.entrants)} completed` : ''}`}
    </Txt>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
      {unpublished && <>
        <Button size="sm" title="Publish now" disabled={publish.isPending} onPress={() => publish.mutate(undefined)} />
        <Button size="sm" variant="secondary" title={row.phase === 'scheduled' ? 'Reschedule' : 'Schedule'} onPress={() => setSheet('schedule')} />
        <Button size="sm" variant="secondary" title="Edit" onPress={() => setSheet('edit')} />
      </>}
      {!unpublished && <Button size="sm" variant="secondary" title="View" onPress={() => router.push(`/competitions/${row.code}`)} />}
      {repeatable && <Button size="sm" variant="secondary" title={duplicate.isPending ? 'Copying…' : 'Duplicate'} disabled={duplicate.isPending} onPress={() => duplicate.mutate()} />}
      {repeatable && !row.seriesId && <Button size="sm" variant="quiet" title="Repeat it" onPress={() => setSheet('repeat')} />}
    </View>
    <ErrorNotice error={publish.error ?? duplicate.error} />
    {sheet === 'edit' && <EditDraftSheet row={row} clubRef={clubRef} onClose={() => setSheet(null)} />}
    {sheet === 'schedule' && <ScheduleSheet title={row.title} onClose={() => setSheet(null)} pending={publish.isPending} error={publish.error} onSchedule={(at) => publish.mutate(at)} />}
    {sheet === 'repeat' && <RepeatSheet code={row.code} title={row.title} clubRef={clubRef} onClose={() => setSheet(null)} />}
  </View>;
}

function ScheduleSheet({ title, onClose, onSchedule, pending, error }: { title: string; onClose: () => void; onSchedule: (at: string) => void; pending: boolean; error: unknown }) {
  const [at, setAt] = useState(() => toLocalInput(new Date(Date.now() + 86_400_000)));
  const iso = fromLocalInput(at);
  return <Sheet open onOpenChange={(open) => !open && onClose()} title="Schedule it" footer={<Button full title={pending ? 'Saving…' : 'Schedule'} loading={pending} disabled={!iso} onPress={() => iso && onSchedule(iso)} />}>
    <View style={{ gap: 16 }}>
      <Txt size={14} color="ink2"><Txt size={14} weight="bold">{title}</Txt> opens on its own at this time, and your followers are told.</Txt>
      <DateTimePicker label="Opens" value={at} min={toLocalInput(new Date())} onChange={setAt} />
      <ErrorNotice error={error} />
    </View>
  </Sheet>;
}

function RepeatSheet({ code, title, clubRef, onClose }: { code: string; title: string; clubRef: string; onClose: () => void }) {
  const refresh = useRefresh(clubRef);
  const [cadence, setCadence] = useState<'weekly' | 'monthly'>('weekly');
  const [autoPublish, setAutoPublish] = useState(true);
  const create = useMutation({
    mutationFn: () => post<ClubSeries>(`/clubs/${clubRef}/series`, { fromCode: code, cadence, autoPublish }),
    async onSuccess() { await refresh(); haptic('success'); toast({ tone: 'ok', message: 'Series started. The next edition appears a week before it starts.' }); onClose(); },
  });
  return <Sheet open onOpenChange={(open) => !open && onClose()} title="Make it a series" footer={<Button full title={create.isPending ? 'Starting…' : 'Start series'} loading={create.isPending} onPress={() => create.mutate()} />}>
    <View style={{ gap: 16 }}>
      <Txt size={14} color="ink2"><Txt size={14} weight="bold">{title}</Txt> becomes edition 1. Each new edition copies its rules, branding and prizes, with its own dates, leaderboard and winners.</Txt>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['weekly', 'monthly'] as const).map((value) => <Pressable key={value} onPress={() => { haptic(); setCadence(value); }} accessibilityRole="radio" accessibilityState={{ checked: cadence === value }}
          style={[styles.choice, cadence === value && { borderColor: colors.ink, backgroundColor: colors.ink }]}>
          <Txt size={14} weight="bold" color={cadence === value ? 'paper' : 'ink'}>{value === 'weekly' ? 'Every week' : 'Every month'}</Txt>
        </Pressable>)}
      </View>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Txt size={14} weight="bold">Publish each edition automatically</Txt>
          <Txt size={12} color="ink3">Otherwise each one waits as a draft for you to confirm.</Txt>
        </View>
        <Switch value={autoPublish} onValueChange={setAutoPublish} trackColor={{ true: colors.ink, false: colors.line }} thumbColor={colors.white} />
      </View>
      <ErrorNotice error={create.error} />
    </View>
  </Sheet>;
}

/** Everything people see before it opens: name, story, dates, places, countries and prizes. */
function EditDraftSheet({ row, clubRef, onClose }: { row: Competition; clubRef: string; onClose: () => void }) {
  const refresh = useRefresh(clubRef);
  const table = useQuery({ queryKey: ['tables', row.code, 'edit'], queryFn: () => api<CompetitionTable>(`/tables/${row.code}`) });
  return <Sheet open onOpenChange={(open) => !open && onClose()} title="Edit draft">
    {table.isLoading ? <Skeleton style={{ height: 256 }} /> : table.error || !table.data ? <ErrorNotice error={table.error} /> : <DraftForm table={table.data} clubRef={clubRef} onSaved={async () => { await refresh(); onClose(); }} />}
  </Sheet>;
}

function DraftForm({ table, clubRef, onSaved }: { table: CompetitionTable; clubRef: string; onSaved: () => Promise<void> }) {
  const terms = table.productPrizes;
  const [title, setTitle] = useState(table.title);
  const [description, setDescription] = useState(table.description ?? '');
  const [startsAt, setStartsAt] = useState(table.startsAt ? toLocalInput(new Date(table.startsAt)) : '');
  const [endsAt, setEndsAt] = useState(table.scoringClosesAt ? toLocalInput(new Date(table.scoringClosesAt)) : '');
  const [capacity, setCapacity] = useState(String(table.capacity ?? ''));
  const [countries, setCountries] = useState<string[]>(table.eligibleCountries ?? []);
  const [prizesOn, setPrizesOn] = useState(Boolean(terms));
  const [prizes, setPrizes] = useState<PrizeDraft>(() => (terms ? {
    prizes: terms.prizes, selection: terms.selection, deliveryCountries: terms.deliveryCountries, fulfilment: terms.fulfilment, shipping: terms.shipping,
    shippingNote: terms.shippingNote ?? '', eligibilityNote: terms.eligibilityNote ?? '', claimDays: terms.claimDays,
  } : EMPTY_PRIZES));
  const capacityNumber = Number(capacity);
  const problem = title.trim().length < 3 ? 'Give it a name of at least 3 characters.' : !Number.isInteger(capacityNumber) || capacityNumber < 2 ? 'Set at least 2 places.' : prizesOn ? prizeProblem(prizes, capacityNumber) : null;
  const save = useMutation({
    mutationFn: () => patch(`/tables/${table.id}/draft`, {
      title: title.trim(), description: description.trim() || null, capacity: capacityNumber, eligibleCountries: countries,
      ...(startsAt ? { startsAt: fromLocalInput(startsAt) } : {}), ...(endsAt ? { scoringClosesAt: fromLocalInput(endsAt) } : {}),
      clubPrizes: table.type === 'free' ? (prizesOn ? prizesPayload(prizes) : null) : undefined,
    }),
    async onSuccess() { toast({ tone: 'ok', message: 'Draft saved.' }); await onSaved(); },
  });
  return <View style={{ gap: 20 }}>
    <TextField label="Name" maxLength={120} value={title} onChangeText={setTitle} />
    <TextField label="What’s it about?" optional multiline maxLength={280} value={description} onChangeText={setDescription} style={{ minHeight: 72 }} />
    <DateTimePicker label="Starts" value={startsAt} onChange={setStartsAt} />
    <DateTimePicker label="Ends" value={endsAt} min={startsAt || undefined} onChange={setEndsAt} />
    <TextField label="Max entrants" keyboardType="number-pad" containerStyle={{ maxWidth: 160 }} value={capacity} onChangeText={setCapacity} />
    <CountriesField label="Who can enter" value={countries} onChange={setCountries} emptyLabel="Anyone, anywhere" />
    {table.type === 'free' && <View style={{ gap: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 16 }}>
      <View style={styles.switchRow}><Txt size={14} weight="semibold" style={{ flex: 1 }}>Club prizes</Txt><Switch value={prizesOn} onValueChange={setPrizesOn} trackColor={{ true: colors.ink, false: colors.line }} thumbColor={colors.white} /></View>
      {prizesOn && <PrizeEditor clubSlug={clubRef} value={prizes} onChange={setPrizes} />}
    </View>}
    <ErrorNotice error={save.error} />
    <Button full title={save.isPending ? 'Saving…' : 'Save draft'} loading={save.isPending} onPress={() => (problem ? toast({ tone: 'warn', message: problem }) : save.mutate())} />
  </View>;
}

/* ───────── Series ───────── */

function SeriesList({ data, clubRef }: { data: ClubDashboard; clubRef: string }) {
  if (!data.series.length) {
    return <EmptyState title="No series yet">Run the same competition every week or month. Pick a finished or live competition under Competitions and tap Repeat it, or choose Repeat when you create one.</EmptyState>;
  }
  return <View style={{ gap: 12 }}>{data.series.map((series) => <SeriesCard key={series.id} series={series} clubRef={clubRef} limit={data.club.activeSeries} />)}</View>;
}

type Edition = { id: string; code: string; title: string; edition: number | null; status: string; startsAt: string | null; scoringClosesAt: string | null; entrants: number; reachedTarget: number; winner: string | null };

function SeriesCard({ series, clubRef, limit }: { series: ClubSeries; clubRef: string; limit: number }) {
  const refresh = useRefresh(clubRef);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const editions = useQuery({ queryKey: ['series', series.id, 'editions'], queryFn: () => api<Edition[]>(`/series/${series.id}/editions`), enabled: open });
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => patch(`/series/${series.id}`, body),
    async onSuccess() { await refresh(); await queryClient.invalidateQueries({ queryKey: ['series', series.id] }); },
  });
  const next = useMutation({
    mutationFn: () => post(`/series/${series.id}/next`),
    async onSuccess() { await refresh(); await queryClient.invalidateQueries({ queryKey: ['series', series.id] }); toast({ tone: 'ok', message: 'Next edition made.' }); },
  });
  return <View style={[styles.card, { borderColor: series.active ? colors.ink : colors.line }]}>
    <View style={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Pill label={series.active ? (series.cadence === 'weekly' ? 'Weekly' : 'Monthly') : 'Paused'} bg={series.active ? colors.track : colors.inkFaint} fg={series.active ? colors.white : colors.ink2} />
        <Pill label={`${series.lastEdition} ${series.lastEdition === 1 ? 'edition' : 'editions'}`} bg={colors.inkWash} fg={colors.ink} />
      </View>
      <Txt size={16} weight="bold" style={{ marginTop: 6 }}>{series.title}</Txt>
      <Txt size={13} color="ink2" style={{ marginTop: 2 }}>{series.active ? `Next edition starts ${formatDateTime(series.nextStartsAt)}, created ${series.leadDays} days before.` : 'Paused. No new editions are made.'}</Txt>
      <View style={[styles.switchRow, { marginTop: 12 }]}>
        <View style={{ flex: 1 }}>
          <Txt size={13}>Publish new editions automatically</Txt>
          <Txt size={12} color="ink3">Off: each edition waits as a draft so you can change its theme and prizes.</Txt>
        </View>
        <Switch value={series.autoPublish} disabled={update.isPending} onValueChange={(value) => update.mutate({ autoPublish: value })} trackColor={{ true: colors.ink, false: colors.line }} thumbColor={colors.white} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {series.active && <Button size="sm" variant="secondary" title={next.isPending ? 'Making…' : 'Make next edition now'} disabled={next.isPending} onPress={() => next.mutate()} />}
        <Button size="sm" variant="secondary" title={series.active ? 'Pause' : 'Resume'} disabled={update.isPending} onPress={() => update.mutate({ active: !series.active })} />
        <Button size="sm" variant="quiet" title={open ? 'Hide editions' : 'Editions and results'} onPress={() => setOpen((value) => !value)} />
      </View>
      <ErrorNotice error={update.error ?? next.error} />
      {!series.active && <Txt size={12} color="ink3" style={{ marginTop: 8 }}>{`Your plan runs up to ${limit} series at a time.`}</Txt>}
    </View>
    {open && <View style={styles.line}>
      {editions.isLoading ? <Skeleton style={{ height: 80, margin: 16 }} /> : (editions.data ?? []).map((edition, index) => <View key={edition.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }, index > 0 && styles.line]}>
        <Txt size={13} weight="extrabold" num style={{ width: 32 }}>#{edition.edition ?? '–'}</Txt>
        <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => router.push(`/competitions/${edition.code}`)}>
          <Txt size={13} weight="semibold" numberOfLines={1}>{edition.title}</Txt>
          <Txt size={12} color="ink3">{`${edition.startsAt ? formatDate(edition.startsAt) : ''} · ${edition.status === 'DRAFT' ? 'draft' : edition.status === 'SCHEDULED' ? 'scheduled' : `${edition.entrants} in`}${edition.winner ? ` · won by ${edition.winner}` : ''}`}</Txt>
        </Pressable>
        {series.active && edition.status !== 'DRAFT' && <Pressable disabled={update.isPending} onPress={() => update.mutate({ templateFromCode: edition.code })}><Txt size={12} weight="semibold" color="ink2">Use as template</Txt></Pressable>}
      </View>)}
    </View>}
  </View>;
}

/* ───────── Prizes ───────── */

function Claims({ claims, clubRef }: { claims: ClubClaim[]; clubRef: string }) {
  if (!claims.length) return <EmptyState title="No prizes awarded yet">When a prize competition ends, its winners appear here with their claims.</EmptyState>;
  const counts = claims.reduce<Record<string, number>>((all, claim) => ({ ...all, [claim.status]: (all[claim.status] ?? 0) + 1 }), {});
  return <View>
    <Txt size={13} color="ink2" style={{ marginBottom: 12 }}>
      {[['DETAILS_SUBMITTED', 'to send'], ['AWAITING_DETAILS', 'waiting for winners'], ['SHIPPED', 'sent'], ['DELIVERED', 'delivered'], ['ISSUE', 'with a problem']]
        .filter(([status]) => counts[status]).map(([status, label]) => `${counts[status]} ${label}`).join(' · ')}
    </Txt>
    <View style={{ gap: 12 }}>{claims.map((claim) => <ClaimCard key={claim.id} claim={claim} clubRef={clubRef} />)}</View>
    <Txt size={12} color="ink3" leading={1.5} style={{ marginTop: 16 }}>You see only what each prize needs to reach its winner, and only until it’s delivered. Use it for this prize alone.</Txt>
  </View>;
}

function ClaimCard({ claim, clubRef }: { claim: ClubClaim; clubRef: string }) {
  const refresh = useRefresh(clubRef);
  const [note, setNote] = useState('');
  const [issue, setIssue] = useState(false);
  const move = useMutation({
    mutationFn: (status: 'READY_FOR_DISPATCH' | 'SHIPPED' | 'DELIVERED' | 'ISSUE') => patch(`/club-awards/${claim.id}`, { status, ...(status === 'ISSUE' ? { issueNote: note.trim() } : note.trim() ? { trackingNote: note.trim() } : {}) }),
    async onSuccess() { setNote(''); setIssue(false); haptic('success'); await refresh(); },
  });
  const ours = claim.fulfilment === 'club';
  const actionable = ours && ['DETAILS_SUBMITTED', 'READY_FOR_DISPATCH', 'SHIPPED', 'ISSUE'].includes(claim.status);
  const nextStep = claim.status === 'DETAILS_SUBMITTED' || claim.status === 'ISSUE' ? (claim.kind === 'product' ? 'READY_FOR_DISPATCH' : 'DELIVERED') : claim.status === 'READY_FOR_DISPATCH' ? 'SHIPPED' : claim.status === 'SHIPPED' ? 'DELIVERED' : null;
  const label = { READY_FOR_DISPATCH: 'Mark preparing', SHIPPED: 'Mark sent', DELIVERED: claim.kind === 'product' ? 'Mark delivered' : 'Mark given' } as const;
  const urgent = claim.status === 'DETAILS_SUBMITTED' || claim.status === 'ISSUE';
  const body = <View style={[styles.card, { borderColor: urgent ? colors.ink : colors.line, padding: 16 }]}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={11} weight="extrabold" upper tracking={0.08} color="ink3">{`${PRIZE_KIND[claim.kind].label} · ${claim.title}`}</Txt>
        <Txt size={15} weight="bold">{claim.productName}</Txt>
        <Txt size={13} color="ink2">Won by <Txt size={13} weight="bold">{claim.winnerName}</Txt>{claim.winnerUsername ? ` (@${claim.winnerUsername})` : ''}</Txt>
      </View>
      <Pill label={CLAIM_STATUS[claim.status]} bg={claim.status === 'ISSUE' ? colors.bad : claim.status === 'DELIVERED' ? colors.okWash : claim.status === 'DETAILS_SUBMITTED' ? colors.track : colors.inkWash} fg={claim.status === 'ISSUE' || claim.status === 'DETAILS_SUBMITTED' ? colors.white : claim.status === 'DELIVERED' ? colors.ok : colors.ink} />
    </View>
    {claim.status === 'AWAITING_DETAILS' && <Txt size={12} color="ink3" style={{ marginTop: 8 }}>{`They have until ${formatDate(claim.detailsDueAt, { year: 'numeric' })} to claim it.`}</Txt>}
    {claim.claim && <View style={styles.details}>
      <Detail label="Name" value={claim.claim.fullName} />
      {claim.claim.phone ? <Detail label="Phone" value={claim.claim.phone} onPress={() => void Linking.openURL(`tel:${claim.claim!.phone}`)} /> : null}
      {claim.claim.address ? <Detail label="Deliver to" value={`${claim.claim.address}, ${claim.claim.city}, ${claim.claim.region}, ${claim.claim.country ? countryName(claim.claim.country) : ''}`} /> : null}
      {claim.claim.deliveryNotes ? <Detail label="Notes" value={claim.claim.deliveryNotes} /> : null}
    </View>}
    {!ours && <Txt size={12} color="ink3" style={{ marginTop: 8 }}>Jump is delivering this one.</Txt>}
    {claim.trackingNote ? <Txt size={12} color="ink2" style={{ marginTop: 8 }}>Last update: {claim.trackingNote}</Txt> : null}
    {actionable && <View style={{ marginTop: 12, gap: 8 }}>
      <TextField value={note} onChangeText={setNote} maxLength={issue ? 500 : 300} placeholder={issue ? 'What went wrong? Jump sees this too.' : 'Tracking number or a note for the winner (optional)'} accessibilityLabel="Note" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {!issue && nextStep && nextStep !== claim.status && <Button size="sm" title={label[nextStep as keyof typeof label]} disabled={move.isPending} onPress={() => move.mutate(nextStep as 'READY_FOR_DISPATCH' | 'SHIPPED' | 'DELIVERED')} />}
        {!issue && claim.status !== 'ISSUE' && <Button size="sm" variant="quiet" title="Report a problem" onPress={() => setIssue(true)} />}
        {issue && <>
          <Button size="sm" variant="danger" title="Report problem" disabled={move.isPending || note.trim().length < 5} onPress={() => move.mutate('ISSUE')} />
          <Button size="sm" variant="quiet" title="Cancel" onPress={() => setIssue(false)} />
        </>}
      </View>
      <ErrorNotice error={move.error} />
    </View>}
  </View>;
  return urgent ? <HardShadow offset={2} radius={radius['2xl']}>{body}</HardShadow> : body;
}

function Detail({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return <View><Txt size={11} color="ink3">{label}</Txt><Txt size={13} weight="semibold" onPress={onPress} style={onPress ? { textDecorationLine: 'underline' } : undefined}>{value}</Txt></View>;
}

/* ───────── Winners and performance ───────── */

function Winners({ winners }: { winners: ClubDashboard['winners'] }) {
  if (!winners.length) return <EmptyState title="No finished competitions yet">Past winners show up here once a competition ends.</EmptyState>;
  return <View style={{ gap: 12 }}>
    {winners.map((row) => <View key={row.id} style={[styles.card, { borderWidth: 1, borderColor: colors.line, padding: 16 }]}>
      <Pressable onPress={() => router.push(`/competitions/${row.code}`)}><Txt size={15} weight="bold" numberOfLines={1}>{row.title}</Txt></Pressable>
      <Txt size={12} color="ink3">Ended {formatDate(row.scoringClosesAt, { year: 'numeric' })}</Txt>
      <View style={{ marginTop: 8, gap: 4 }}>
        {(row.podium ?? []).map((person) => <View key={person.rank} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.place, { backgroundColor: person.rank === 1 ? colors.volt : colors.inkWash }]}><Txt size={12} weight="extrabold" num>{person.rank}</Txt></View>
          <Txt size={14} weight="semibold" numberOfLines={1} onPress={person.username ? () => router.push(`/runners/${person.username}`) : undefined}>{person.displayName}</Txt>
        </View>)}
        {!row.podium?.length && <Txt size={14} color="ink3">Nobody scored.</Txt>}
      </View>
    </View>)}
  </View>;
}

function Table({ head, rows, widths }: { head: string[]; rows: Array<Array<{ text: string; bold?: boolean; onPress?: () => void }>>; widths: number[] }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.card, { borderWidth: 1, borderColor: colors.line, marginHorizontal: -GUTTER / 2 }]}>
    <View>
      <View style={[styles.tableRow, { borderTopWidth: 0 }]}>{head.map((cell, index) => <Txt key={cell} size={11} weight="bold" upper tracking={0.06} color="ink3" style={{ width: widths[index] }}>{cell}</Txt>)}</View>
      {rows.map((row, index) => <View key={index} style={styles.tableRow}>
        {row.map((cell, cellIndex) => <Txt key={cellIndex} size={13} num numberOfLines={1} weight={cell.bold ? 'semibold' : 'regular'} onPress={cell.onPress} style={{ width: widths[cellIndex] }}>{cell.text}</Txt>)}
      </View>)}
    </View>
  </ScrollView>;
}

function Performance({ monthly, competitions }: { monthly: ClubDashboard['monthly']; competitions: Competition[] }) {
  const finished = competitions.filter((row) => row.phase !== 'draft' && row.phase !== 'scheduled').slice(0, 20);
  const month = (value: string) => new Date(`${value}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  return <View style={{ gap: 32 }}>
    <View>
      <Txt size={13} weight="extrabold" upper tracking={0.08} color="ink2" style={{ marginBottom: 10 }}>Last six months</Txt>
      <Table head={['Month', 'Competitions', 'Entries', 'People', 'Completed', 'New followers']} widths={[96, 104, 72, 72, 88, 112]}
        rows={monthly.map((row) => [{ text: month(row.month), bold: true }, { text: String(row.challenges) }, { text: String(row.entries) }, { text: String(row.participants) }, { text: percent(row.completions, row.entries) }, { text: String(row.newFollowers) }])} />
    </View>
    <View>
      <Txt size={13} weight="extrabold" upper tracking={0.08} color="ink2" style={{ marginBottom: 10 }}>By competition</Txt>
      {!finished.length ? <Txt size={13} color="ink3">Nothing published yet.</Txt>
        : <Table head={['Competition', 'Dates', 'Entrants', 'Completed']} widths={[200, 96, 88, 88]}
          rows={finished.map((row) => [{ text: row.title, bold: true, onPress: () => router.push(`/competitions/${row.code}`) }, { text: row.startsAt ? formatDate(row.startsAt) : '–' }, { text: `${row.entrants}${row.capacity ? ` / ${row.capacity}` : ''}` }, { text: percent(row.completed, row.entrants) }])} />}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { width: '48%', flexGrow: 1, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 12 },
  tabs: { marginTop: 28, flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, marginHorizontal: -GUTTER, paddingHorizontal: GUTTER },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  count: { minWidth: 18, borderRadius: radius.full, backgroundColor: colors.track, paddingHorizontal: 6, alignItems: 'center' },
  list: { borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, overflow: 'hidden' },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  choice: { flex: 1, height: 44, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: { borderRadius: radius['2xl'], borderWidth: 1.5, backgroundColor: colors.card, overflow: 'hidden' },
  details: { marginTop: 12, gap: 6, borderRadius: radius.xl, backgroundColor: 'rgba(18,18,18,0.04)', padding: 12 },
  place: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tableRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
