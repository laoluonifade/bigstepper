import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { FormEvent, ReactNode, useState } from 'react';
import { CountriesField, EMPTY_PRIZES, PRIZE_KIND, PrizeEditor, prizeProblem, prizesPayload, type PrizeDraft } from '../components/ClubPrizes';
import { DateTimePicker } from '../components/DateTimePicker';
import { ArrowLeftIcon, PlusIcon } from '../components/icons';
import { Modal } from '../components/Modal';
import { cx, EmptyState, ErrorNotice, Field, Loading, Notice, Skeleton } from '../components/ui';
import { api, isApiError, patch, post } from '../lib/api';
import { countryName } from '../lib/countries';
import { formatDate, formatDateTime, fromLocalInput, toLocalInput } from '../lib/format';
import { toast } from '../lib/toast';
import type { ClubClaim, ClubDashboard, ClubSeries, CompetitionTable } from '../lib/types';

type Tab = 'competitions' | 'series' | 'prizes' | 'results' | 'performance';
type Competition = ClubDashboard['challenges'][number];

const PHASE: Record<Competition['phase'], { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-ink/10 text-ink-2' },
  scheduled: { label: 'Scheduled', tone: 'bg-volt text-ink' },
  upcoming: { label: 'Upcoming', tone: 'bg-ink text-paper' },
  live: { label: 'Live', tone: 'bg-track text-white' },
  finished: { label: 'Finished', tone: 'bg-ok-wash text-ok' },
};

const CLAIM_STATUS: Record<ClubClaim['status'], string> = {
  AWAITING_DETAILS: 'Waiting for the winner', DETAILS_SUBMITTED: 'Claimed · ready for you', READY_FOR_DISPATCH: 'Being prepared',
  SHIPPED: 'Sent', DELIVERED: 'Delivered', FORFEITED: 'Passed on', ISSUE: 'Problem',
};

const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '–');

/**
 * Everything a club (a run club or a brand) needs to run competitions on its own: what's live, drafts to
 * finish, series, prize claims, past winners and how it's going over time.
 */
export function ClubDashboardPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const dashboard = useQuery({ queryKey: ['club', id, 'dashboard'], queryFn: () => api<ClubDashboard>(`/clubs/${encodeURIComponent(id)}/dashboard`) });
  const [tab, setTab] = useState<Tab>('competitions');
  if (dashboard.isLoading) return <Loading />;
  if (dashboard.error || !dashboard.data) {
    return <div className="animate-rise">
      <Link to="/clubs/$id" params={{ id }} search={{}} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink"><ArrowLeftIcon size={16} /> Club</Link>
      {isApiError(dashboard.error, 403) ? <EmptyState title="For the club’s managers">Only the club’s owner and managers can see its dashboard.</EmptyState> : <ErrorNotice error={dashboard.error} onRetry={() => void dashboard.refetch()} />}
    </div>;
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

  return <div className="animate-rise">
    <Link to="/clubs/$id" params={{ id: d.club.slug }} search={{}} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink"><ArrowLeftIcon size={16} /> {d.club.name}</Link>
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="eyebrow">Club dashboard · {d.club.label} plan</p>
        <h1 className="mt-0.5 truncate text-[24px] font-extrabold tracking-tight sm:text-[30px]">{d.club.name}</h1>
      </div>
      {!d.club.suspendedAt && <Link to="/competitions/new" search={{ club: d.club.slug }} className="btn-primary btn-sm"><PlusIcon size={15} /> New competition</Link>}
    </header>

    {d.club.suspendedAt && <Notice tone="bad" className="mb-5" title="Suspended by Jump">{d.club.suspendedReason ?? 'This club can’t run competitions right now.'} Contact Jump support to resolve it.</Notice>}

    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      <Stat label="Followers" value={t.followers} hint={`+${t.newFollowers30d} in 30 days`} />
      <Stat label="Members" value={t.members} hint="in the club" />
      <Stat label="Participants" value={t.participants} hint={`${t.entries} entries`} />
      <Stat label="Repeat" value={t.repeatParticipants} hint={`${percent(t.repeatParticipants, t.participants)} came back`} />
      <Stat label="Completion" value={percent(t.completions, t.entries)} hint={`${t.completions} finished`} />
      <Stat label="Competitions" value={t.challenges} hint={`up to ${d.club.liveChallenges} live`} />
    </div>

    <div className="no-scrollbar -mx-4 mt-7 flex gap-5 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Dashboard sections">
      {tabs.map((option) => <button key={option.value} type="button" role="tab" aria-selected={tab === option.value} onClick={() => setTab(option.value)}
        className={cx('relative inline-flex shrink-0 items-center gap-1.5 pb-2.5 text-[15px] font-semibold transition-colors', tab === option.value ? 'text-ink' : 'text-ink-3 hover:text-ink-2')}>
        {option.label}
        {option.count ? <span className="num rounded-full bg-track px-1.5 text-[11px] font-bold text-white">{option.count}</span> : null}
        {tab === option.value && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-ink" aria-hidden="true" />}
      </button>)}
    </div>

    <div className="mt-5">
      {tab === 'competitions' && <Competitions data={d} clubRef={id} />}
      {tab === 'series' && <SeriesList data={d} clubRef={id} />}
      {tab === 'prizes' && <Claims claims={d.claims} clubRef={id} />}
      {tab === 'results' && <Winners winners={d.winners} />}
      {tab === 'performance' && <Performance monthly={d.monthly} competitions={d.challenges} />}
    </div>
  </div>;
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return <div className="rounded-xl border border-line bg-card px-3.5 py-3">
    <p className="text-[12px] font-semibold text-ink-2">{label}</p>
    <p className="num text-[26px] font-extrabold leading-tight">{value}</p>
    <p className="truncate text-[11px] text-ink-3">{hint}</p>
  </div>;
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
    return <EmptyState title="No competitions yet" action={<Link to="/competitions/new" search={{ club: data.club.slug }} className="btn-primary btn-sm"><PlusIcon size={15} /> Create the first one</Link>}>
      Create a competition with prizes, publish it now or later, and share the link with your community.
    </EmptyState>;
  }
  return <div className="space-y-7">
    {groups.filter(([, rows]) => rows.length).map(([title, rows]) => <section key={title}>
      <h2 className="mb-2.5 text-[13px] font-extrabold uppercase tracking-[0.08em] text-ink-2">{title}</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card">
        {rows.map((row) => <li key={row.id}><ChallengeRow row={row} clubRef={clubRef} /></li>)}
      </ul>
    </section>)}
  </div>;
}

function ChallengeRow({ row, clubRef }: { row: Competition; clubRef: string }) {
  const navigate = useNavigate();
  const refresh = useRefresh(clubRef);
  const [editing, setEditing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [repeating, setRepeating] = useState(false);
  const publish = useMutation({
    mutationFn: (at?: string) => post(`/tables/${row.id}/publish`, at ? { at } : {}),
    async onSuccess(_, at) { await refresh(); setScheduling(false); toast({ tone: 'ok', message: at ? `Scheduled for ${formatDateTime(at)}.` : 'Published. Your followers have been told.' }); },
  });
  const duplicate = useMutation({
    mutationFn: () => post<CompetitionTable>(`/tables/${row.id}/duplicate`, {}),
    async onSuccess() { await refresh(); toast({ tone: 'ok', message: 'Copied as a draft. Change its dates and prizes, then publish it.' }); },
  });
  const unpublished = row.phase === 'draft' || row.phase === 'scheduled';
  const repeatable = row.type === 'free' && Boolean(row.scoringClosesAt);
  return <div className="px-4 py-3.5">
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className={cx('rounded-full px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em]', PHASE[row.phase].tone)}>{PHASE[row.phase].label}</span>
          {row.edition && <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-[10.5px] font-bold">Edition {row.edition}</span>}
          {row.hasPrizes && <span className="rounded-full bg-volt px-2 py-0.5 text-[10.5px] font-bold">Prizes</span>}
        </p>
        <Link to="/competitions/$code" params={{ code: row.code }} className="mt-1 block truncate text-[15px] font-bold hover:underline">{row.title}</Link>
        <p className="num mt-0.5 text-[12px] text-ink-2">
          {row.phase === 'scheduled' && row.publishAt ? `Opens ${formatDateTime(row.publishAt)} · ` : ''}
          {row.startsAt ? formatDate(row.startsAt) : ''}{row.scoringClosesAt ? ` – ${formatDate(row.scoringClosesAt)}` : ' · no end date'}
          {!unpublished && ` · ${row.entrants}${row.capacity ? `/${row.capacity}` : ''} in · ${percent(row.completed, row.entrants)} completed`}
        </p>
      </div>
    </div>
    <div className="mt-2.5 flex flex-wrap gap-2">
      {unpublished && <>
        <button type="button" className="btn-primary btn-sm" disabled={publish.isPending} onClick={() => publish.mutate(undefined)}>Publish now</button>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setScheduling(true)}>{row.phase === 'scheduled' ? 'Reschedule' : 'Schedule'}</button>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit</button>
      </>}
      {!unpublished && <button type="button" className="btn-secondary btn-sm" onClick={() => void navigate({ to: '/competitions/$code', params: { code: row.code } })}>View</button>}
      {repeatable && <button type="button" className="btn-secondary btn-sm" disabled={duplicate.isPending} onClick={() => duplicate.mutate()}>{duplicate.isPending ? 'Copying…' : 'Duplicate'}</button>}
      {repeatable && !row.seriesId && <button type="button" className="btn-quiet btn-sm" onClick={() => setRepeating(true)}>Repeat it</button>}
    </div>
    <ErrorNotice error={publish.error ?? duplicate.error} />
    {editing && <EditDraftSheet row={row} clubRef={clubRef} onClose={() => setEditing(false)} />}
    {scheduling && <ScheduleSheet title={row.title} onClose={() => setScheduling(false)} pending={publish.isPending} error={publish.error} onSchedule={(at) => publish.mutate(at)} />}
    {repeating && <RepeatSheet code={row.code} title={row.title} clubRef={clubRef} onClose={() => setRepeating(false)} />}
  </div>;
}

function ScheduleSheet({ title, onClose, onSchedule, pending, error }: { title: string; onClose: () => void; onSchedule: (at: string) => void; pending: boolean; error: unknown }) {
  const [at, setAt] = useState(() => toLocalInput(new Date(Date.now() + 86_400_000)));
  const iso = fromLocalInput(at);
  return <Modal title="Schedule it" onClose={onClose}>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (iso) onSchedule(iso); }}>
      <p className="text-[14px] text-ink-2"><b className="text-ink">{title}</b> opens on its own at this time, and your followers are told.</p>
      <Field label="Opens">{(props) => <DateTimePicker {...props} value={at} min={toLocalInput(new Date())} onChange={setAt} />}</Field>
      <ErrorNotice error={error} />
      <button className="btn-primary w-full" disabled={pending || !iso}>{pending ? 'Saving…' : 'Schedule'}</button>
    </form>
  </Modal>;
}

function RepeatSheet({ code, title, clubRef, onClose }: { code: string; title: string; clubRef: string; onClose: () => void }) {
  const refresh = useRefresh(clubRef);
  const [cadence, setCadence] = useState<'weekly' | 'monthly'>('weekly');
  const [autoPublish, setAutoPublish] = useState(true);
  const create = useMutation({
    mutationFn: () => post<ClubSeries>(`/clubs/${clubRef}/series`, { fromCode: code, cadence, autoPublish }),
    async onSuccess() { await refresh(); toast({ tone: 'ok', message: 'Series started. The next edition appears a week before it starts.' }); onClose(); },
  });
  return <Modal title="Make it a series" onClose={onClose}>
    <div className="space-y-4">
      <p className="text-[14px] text-ink-2"><b className="text-ink">{title}</b> becomes edition 1. Each new edition copies its rules, branding and prizes, with its own dates, leaderboard and winners.</p>
      <div className="grid grid-cols-2 gap-2">
        {(['weekly', 'monthly'] as const).map((value) => <button key={value} type="button" aria-pressed={cadence === value} onClick={() => setCadence(value)}
          className={cx('h-11 rounded-lg border-[1.5px] text-[14px] font-bold', cadence === value ? 'border-ink bg-ink text-paper' : 'border-line bg-card')}>{value === 'weekly' ? 'Every week' : 'Every month'}</button>)}
      </div>
      <label className="flex items-start gap-2 text-[14px]">
        <input type="checkbox" className="mt-1" checked={autoPublish} onChange={(event) => setAutoPublish(event.target.checked)} />
        <span><b>Publish each edition automatically</b><span className="block text-[12px] text-ink-3">Otherwise each one waits as a draft for you to confirm.</span></span>
      </label>
      <ErrorNotice error={create.error} />
      <button type="button" className="btn-primary w-full" disabled={create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Starting…' : 'Start series'}</button>
    </div>
  </Modal>;
}

/** Everything people see before it opens: name, story, dates, places, countries and prizes. */
function EditDraftSheet({ row, clubRef, onClose }: { row: Competition; clubRef: string; onClose: () => void }) {
  const refresh = useRefresh(clubRef);
  const table = useQuery({ queryKey: ['tables', row.code, 'edit'], queryFn: () => api<CompetitionTable>(`/tables/${row.code}`) });
  return <Modal title="Edit draft" onClose={onClose}>
    {table.isLoading ? <Skeleton className="h-64" /> : table.error || !table.data ? <ErrorNotice error={table.error} /> : <DraftForm table={table.data} clubRef={clubRef} onSaved={async () => { await refresh(); onClose(); }} />}
  </Modal>;
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
  const [prizes, setPrizes] = useState<PrizeDraft>(() => terms ? {
    prizes: terms.prizes, selection: terms.selection, deliveryCountries: terms.deliveryCountries, fulfilment: terms.fulfilment, shipping: terms.shipping,
    shippingNote: terms.shippingNote ?? '', eligibilityNote: terms.eligibilityNote ?? '', claimDays: terms.claimDays,
  } : EMPTY_PRIZES);
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
  function submit(event: FormEvent) {
    event.preventDefault();
    if (problem) toast({ tone: 'warn', message: problem });
    else save.mutate();
  }
  return <form className="space-y-5" onSubmit={submit}>
    <Field label="Name">{(props) => <input {...props} className="field" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />}</Field>
    <Field label="What’s it about?" optional>{(props) => <textarea {...props} className="field min-h-[72px] py-3" maxLength={280} value={description} onChange={(event) => setDescription(event.target.value)} />}</Field>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Starts">{(props) => <DateTimePicker {...props} value={startsAt} onChange={setStartsAt} />}</Field>
      <Field label="Ends">{(props) => <DateTimePicker {...props} value={endsAt} min={startsAt || undefined} onChange={setEndsAt} />}</Field>
    </div>
    <Field label="Max entrants">{(props) => <input {...props} className="field num max-w-40" type="number" min={2} max={10000} value={capacity} onChange={(event) => setCapacity(event.target.value)} />}</Field>
    <CountriesField label="Who can enter" value={countries} onChange={setCountries} emptyLabel="Anyone, anywhere" />
    {table.type === 'free' && <div className="space-y-4 border-t border-line pt-4">
      <label className="flex items-center gap-2 text-[14px] font-semibold"><input type="checkbox" checked={prizesOn} onChange={(event) => setPrizesOn(event.target.checked)} /> Club prizes</label>
      {prizesOn && <PrizeEditor clubSlug={clubRef} value={prizes} onChange={setPrizes} />}
    </div>}
    <ErrorNotice error={save.error} />
    <button className="btn-primary w-full" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save draft'}</button>
  </form>;
}

/* ───────── Series ───────── */

function SeriesList({ data, clubRef }: { data: ClubDashboard; clubRef: string }) {
  if (!data.series.length) {
    return <EmptyState title="No series yet">
      Run the same competition every week or month. Pick a finished or live competition under Competitions and tap <b>Repeat it</b>, or choose Repeat when you create one.
    </EmptyState>;
  }
  return <ul className="space-y-3">{data.series.map((series) => <li key={series.id}><SeriesCard series={series} clubRef={clubRef} limit={data.club.activeSeries} /></li>)}</ul>;
}

function SeriesCard({ series, clubRef, limit }: { series: ClubSeries; clubRef: string; limit: number }) {
  const refresh = useRefresh(clubRef);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const editions = useQuery({ queryKey: ['series', series.id, 'editions'], queryFn: () => api<Array<{ id: string; code: string; title: string; edition: number | null; status: string; startsAt: string | null; scoringClosesAt: string | null; entrants: number; reachedTarget: number; winner: string | null }>>(`/series/${series.id}/editions`), enabled: open });
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => patch(`/series/${series.id}`, body),
    async onSuccess() { await refresh(); await queryClient.invalidateQueries({ queryKey: ['series', series.id] }); },
  });
  const next = useMutation({
    mutationFn: () => post(`/series/${series.id}/next`),
    async onSuccess() { await refresh(); await queryClient.invalidateQueries({ queryKey: ['series', series.id] }); toast({ tone: 'ok', message: 'Next edition made.' }); },
  });
  return <article className={cx('rounded-2xl border-[1.5px] bg-card', series.active ? 'border-ink' : 'border-line')}>
    <div className="p-4">
      <p className="flex flex-wrap items-center gap-1.5">
        <span className={cx('rounded-full px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em]', series.active ? 'bg-track text-white' : 'bg-ink/10 text-ink-2')}>{series.active ? (series.cadence === 'weekly' ? 'Weekly' : 'Monthly') : 'Paused'}</span>
        <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-[10.5px] font-bold">{series.lastEdition} {series.lastEdition === 1 ? 'edition' : 'editions'}</span>
      </p>
      <h3 className="mt-1.5 text-[16px] font-bold">{series.title}</h3>
      <p className="mt-0.5 text-[13px] text-ink-2">{series.active ? `Next edition starts ${formatDateTime(series.nextStartsAt)}, created ${series.leadDays} days before.` : 'Paused. No new editions are made.'}</p>
      <label className="mt-3 flex items-start gap-2 text-[13px]">
        <input type="checkbox" className="mt-0.5" checked={series.autoPublish} disabled={update.isPending} onChange={(event) => update.mutate({ autoPublish: event.target.checked })} />
        <span>Publish new editions automatically <span className="block text-[12px] text-ink-3">Off: each edition waits as a draft so you can change its theme and prizes.</span></span>
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {series.active && <button type="button" className="btn-secondary btn-sm" disabled={next.isPending} onClick={() => next.mutate()}>{next.isPending ? 'Making…' : 'Make next edition now'}</button>}
        <button type="button" className="btn-secondary btn-sm" disabled={update.isPending} onClick={() => update.mutate({ active: !series.active })}>{series.active ? 'Pause' : 'Resume'}</button>
        <button type="button" className="btn-quiet btn-sm" onClick={() => setOpen((value) => !value)}>{open ? 'Hide editions' : 'Editions and results'}</button>
      </div>
      <ErrorNotice error={update.error ?? next.error} />
      {!series.active && <p className="mt-2 text-[12px] text-ink-3">Your plan runs up to {limit} series at a time.</p>}
    </div>
    {open && <div className="border-t border-line">
      {editions.isLoading ? <Skeleton className="m-4 h-20" /> : <ul className="divide-y divide-line">
        {(editions.data ?? []).map((edition) => <li key={edition.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
          <span className="num w-8 shrink-0 font-extrabold">#{edition.edition ?? '–'}</span>
          <div className="min-w-0 flex-1">
            <Link to="/competitions/$code" params={{ code: edition.code }} className="block truncate font-semibold hover:underline">{edition.title}</Link>
            <p className="text-[12px] text-ink-3">{edition.startsAt ? formatDate(edition.startsAt) : ''} · {edition.status === 'DRAFT' ? 'draft' : edition.status === 'SCHEDULED' ? 'scheduled' : `${edition.entrants} in`}{edition.winner ? ` · won by ${edition.winner}` : ''}</p>
          </div>
          {series.active && edition.status !== 'DRAFT' && <button type="button" className="shrink-0 text-[12px] font-semibold text-ink-2 hover:text-ink" disabled={update.isPending} onClick={() => update.mutate({ templateFromCode: edition.code })}>Use as template</button>}
        </li>)}
      </ul>}
    </div>}
  </article>;
}

/* ───────── Prizes ───────── */

function Claims({ claims, clubRef }: { claims: ClubClaim[]; clubRef: string }) {
  if (!claims.length) return <EmptyState title="No prizes awarded yet">When a prize competition ends, its winners appear here with their claims.</EmptyState>;
  const counts = claims.reduce<Record<string, number>>((all, claim) => ({ ...all, [claim.status]: (all[claim.status] ?? 0) + 1 }), {});
  return <>
    <p className="mb-3 text-[13px] text-ink-2">
      {[['DETAILS_SUBMITTED', 'to send'], ['AWAITING_DETAILS', 'waiting for winners'], ['SHIPPED', 'sent'], ['DELIVERED', 'delivered'], ['ISSUE', 'with a problem']]
        .filter(([status]) => counts[status]).map(([status, label]) => `${counts[status]} ${label}`).join(' · ')}
    </p>
    <ul className="space-y-3">{claims.map((claim) => <li key={claim.id}><ClaimCard claim={claim} clubRef={clubRef} /></li>)}</ul>
    <p className="mt-4 text-[12px] leading-relaxed text-ink-3">You see only what each prize needs to reach its winner, and only until it’s delivered. Use it for this prize alone.</p>
  </>;
}

function ClaimCard({ claim, clubRef }: { claim: ClubClaim; clubRef: string }) {
  const refresh = useRefresh(clubRef);
  const [note, setNote] = useState('');
  const [issue, setIssue] = useState(false);
  const move = useMutation({
    mutationFn: (status: 'READY_FOR_DISPATCH' | 'SHIPPED' | 'DELIVERED' | 'ISSUE') => patch(`/club-awards/${claim.id}`, { status, ...(status === 'ISSUE' ? { issueNote: note.trim() } : note.trim() ? { trackingNote: note.trim() } : {}) }),
    async onSuccess() { setNote(''); setIssue(false); await refresh(); },
  });
  const ours = claim.fulfilment === 'club';
  const actionable = ours && ['DETAILS_SUBMITTED', 'READY_FOR_DISPATCH', 'SHIPPED', 'ISSUE'].includes(claim.status);
  const nextStep = claim.status === 'DETAILS_SUBMITTED' || claim.status === 'ISSUE' ? (claim.kind === 'product' ? 'READY_FOR_DISPATCH' : 'DELIVERED') : claim.status === 'READY_FOR_DISPATCH' ? 'SHIPPED' : claim.status === 'SHIPPED' ? 'DELIVERED' : null;
  const label = { READY_FOR_DISPATCH: 'Mark preparing', SHIPPED: 'Mark sent', DELIVERED: claim.kind === 'product' ? 'Mark delivered' : 'Mark given' } as const;
  return <article className={cx('rounded-2xl border-[1.5px] bg-card p-4', claim.status === 'DETAILS_SUBMITTED' || claim.status === 'ISSUE' ? 'border-ink shadow-hard-sm' : 'border-line')}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-3">{PRIZE_KIND[claim.kind].label} · {claim.title}</p>
        <p className="text-[15px] font-bold">{claim.productName}</p>
        <p className="text-[13px] text-ink-2">Won by <b className="text-ink">{claim.winnerName}</b>{claim.winnerUsername ? ` (@${claim.winnerUsername})` : ''}</p>
      </div>
      <span className={cx('rounded-full px-2.5 py-0.5 text-[11px] font-bold', claim.status === 'ISSUE' ? 'bg-bad text-white' : claim.status === 'DELIVERED' ? 'bg-ok-wash text-ok' : claim.status === 'DETAILS_SUBMITTED' ? 'bg-track text-white' : 'bg-ink/[0.06]')}>{CLAIM_STATUS[claim.status]}</span>
    </div>
    {claim.status === 'AWAITING_DETAILS' && <p className="mt-2 text-[12px] text-ink-3">They have until {formatDate(claim.detailsDueAt, { year: 'numeric' })} to claim it.</p>}
    {claim.claim && <dl className="mt-3 grid gap-x-4 gap-y-1 rounded-xl bg-ink/[0.04] p-3 text-[13px] sm:grid-cols-2">
      <div><dt className="text-[11px] text-ink-3">Name</dt><dd className="font-semibold">{claim.claim.fullName}</dd></div>
      {claim.claim.phone && <div><dt className="text-[11px] text-ink-3">Phone</dt><dd className="font-semibold"><a href={`tel:${claim.claim.phone}`}>{claim.claim.phone}</a></dd></div>}
      {claim.claim.address && <div className="sm:col-span-2"><dt className="text-[11px] text-ink-3">Deliver to</dt><dd className="font-semibold">{claim.claim.address}, {claim.claim.city}, {claim.claim.region}, {claim.claim.country ? countryName(claim.claim.country) : ''}</dd></div>}
      {claim.claim.deliveryNotes && <div className="sm:col-span-2"><dt className="text-[11px] text-ink-3">Notes</dt><dd>{claim.claim.deliveryNotes}</dd></div>}
    </dl>}
    {!ours && <p className="mt-2 text-[12px] text-ink-3">Jump is delivering this one.</p>}
    {claim.trackingNote && <p className="mt-2 text-[12px] text-ink-2">Last update: {claim.trackingNote}</p>}
    {actionable && <div className="mt-3 space-y-2">
      <input className="field" value={note} onChange={(event) => setNote(event.target.value)} maxLength={issue ? 500 : 300} placeholder={issue ? 'What went wrong? Jump sees this too.' : 'Tracking number or a note for the winner (optional)'} />
      <div className="flex flex-wrap gap-2">
        {!issue && nextStep && nextStep !== claim.status && <button type="button" className="btn-primary btn-sm" disabled={move.isPending} onClick={() => move.mutate(nextStep as 'READY_FOR_DISPATCH' | 'SHIPPED' | 'DELIVERED')}>{label[nextStep as keyof typeof label]}</button>}
        {!issue && claim.status !== 'ISSUE' && <button type="button" className="btn-quiet btn-sm" onClick={() => setIssue(true)}>Report a problem</button>}
        {issue && <>
          <button type="button" className="btn-danger btn-sm" disabled={move.isPending || note.trim().length < 5} onClick={() => move.mutate('ISSUE')}>Report problem</button>
          <button type="button" className="btn-quiet btn-sm" onClick={() => setIssue(false)}>Cancel</button>
        </>}
      </div>
      <ErrorNotice error={move.error} />
    </div>}
  </article>;
}

/* ───────── Winners and performance ───────── */

function Winners({ winners }: { winners: ClubDashboard['winners'] }) {
  if (!winners.length) return <EmptyState title="No finished competitions yet">Past winners show up here once a competition ends.</EmptyState>;
  return <ul className="grid gap-3 sm:grid-cols-2">
    {winners.map((row) => <li key={row.id} className="rounded-2xl border border-line bg-card p-4">
      <Link to="/competitions/$code" params={{ code: row.code }} className="block truncate text-[15px] font-bold hover:underline">{row.title}</Link>
      <p className="text-[12px] text-ink-3">Ended {formatDate(row.scoringClosesAt, { year: 'numeric' })}</p>
      <ol className="mt-2 space-y-1 text-[14px]">
        {(row.podium ?? []).map((person) => <li key={person.rank} className="flex items-center gap-2">
          <span className={cx('num flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-extrabold', person.rank === 1 ? 'bg-volt' : 'bg-ink/[0.06]')}>{person.rank}</span>
          {person.username ? <Link to="/runners/$username" params={{ username: person.username }} search={{}} className="truncate font-semibold hover:underline">{person.displayName}</Link> : <span className="truncate font-semibold">{person.displayName}</span>}
        </li>)}
        {!row.podium?.length && <li className="text-ink-3">Nobody scored.</li>}
      </ol>
    </li>)}
  </ul>;
}

function Performance({ monthly, competitions }: { monthly: ClubDashboard['monthly']; competitions: Competition[] }) {
  const finished = competitions.filter((row) => row.phase !== 'draft' && row.phase !== 'scheduled').slice(0, 20);
  const month = (value: string) => new Date(`${value}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  return <div className="space-y-8">
    <section>
      <h2 className="mb-2.5 text-[13px] font-extrabold uppercase tracking-[0.08em] text-ink-2">Last six months</h2>
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[520px] text-left text-[13px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-ink-3">{['Month', 'Competitions', 'Entries', 'People', 'Completed', 'New followers'].map((cell) => <th key={cell} className="px-3 py-2 font-bold">{cell}</th>)}</tr></thead>
          <tbody className="num">{monthly.map((row) => <tr key={row.month} className="border-t border-line first:border-t-0">
            <td className="px-3 py-2 font-semibold">{month(row.month)}</td><td className="px-3 py-2">{row.challenges}</td><td className="px-3 py-2">{row.entries}</td>
            <td className="px-3 py-2">{row.participants}</td><td className="px-3 py-2">{percent(row.completions, row.entries)}</td><td className="px-3 py-2">{row.newFollowers}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
    <section>
      <h2 className="mb-2.5 text-[13px] font-extrabold uppercase tracking-[0.08em] text-ink-2">By competition</h2>
      {!finished.length ? <p className="text-[13px] text-ink-3">Nothing published yet.</p> : <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[520px] text-left text-[13px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-ink-3">{['Competition', 'Dates', 'Entrants', 'Completed'].map((cell) => <th key={cell} className="px-3 py-2 font-bold">{cell}</th>)}</tr></thead>
          <tbody>{finished.map((row) => <tr key={row.id} className="border-t border-line first:border-t-0">
            <td className="max-w-[220px] truncate px-3 py-2 font-semibold"><Link to="/competitions/$code" params={{ code: row.code }} className="hover:underline">{row.title}</Link></td>
            <td className="whitespace-nowrap px-3 py-2 text-ink-2">{row.startsAt ? formatDate(row.startsAt) : '–'}</td>
            <td className="num px-3 py-2">{row.entrants}{row.capacity ? ` / ${row.capacity}` : ''}</td>
            <td className="num px-3 py-2">{percent(row.completed, row.entrants)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </div>;
}
