import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import { ShareCompetitionSheet } from '../components/ShareCompetition';
import { CountriesField, EMPTY_PRIZES, PRIZE_KIND, PrizeEditor, prizeProblem, prizesPayload, PrizeTerms, type PrizeDraft } from '../components/ClubPrizes';
import { Sheet, SheetRow } from '../components/Sheet';
import { OpponentPicker, opponentLabel, type Opponent } from '../components/OpponentPicker';
import { templateById } from '../lib/templates';
import { StravaButton } from './Strava';
import { toast } from '../lib/toast';
import { ChallengeMark, CompetitionCard, CompetitionPreviewCard, PhaseTag, TypeTag, canEnter, cardTheme, challengeHeadline, competitionPhase, prizeSplit } from '../components/competition';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CloseIcon, EditIcon, LockIcon, PlayIcon, PlusIcon, SearchIcon, ShareIcon, SlidersIcon, TrashIcon } from '../components/icons';
import { Leaderboard, LeaderboardRow, RankBadge } from '../components/Leaderboard';
import {
  Avatar,
  cx,
  EmptyState,
  ErrorNotice,
  Field,
  LiveTag,
  Loading,
  Notice,
  PageHeader,
  SectionTitle,
  Skeleton,
  SubNav,
  useNow,
} from '../components/ui';
import { DateTimePicker } from '../components/DateTimePicker';
import { api, isApiError, patch, post } from '../lib/api';
import { prepare } from '../components/Profile';
import { useAuth } from '../lib/auth';
import { joinConflictCopy } from '../lib/copy';
import {
  formatCountdown,
  formatDate,
  formatDateTime,
  formatDistance,
  formatMoney,
  formatNairaInput,
  fromLocalInput,
  nairaInputToKobo,
  ordinal,
  toLocalInput,
  toMetres,
} from '../lib/format';
import { rememberTable } from '../lib/local';
import { countryName } from '../lib/countries';
import { draftFor, ScoringPicker, scoringPayload, type ScoringDraft } from '../components/ScoringPicker';
import { ACTIVITY_RULES, FORMATS, METRICS, type CompetitionFormat } from '@jump/shared/competition-rules';
import { activityLabel, formatScore, hasScored, metricOf, rulesLines, scoreHeader, winsLabel } from '../lib/scoring';
import { OPEN_PAYMENT_STATUSES, savePayment, useSavedPayments } from '../lib/payments';
import { keys, useCreator, useDiscover, useFinalResult, useStandings, useUnit, useWallet, type DiscoverView } from '../lib/queries';
import type { ChallengeType, CheckoutResponse, Club, CompetitionTable, StandingRow, Unit } from '../lib/types';

export const COMPETE_NAV = [
  { to: '/competitions', label: 'Competitions' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/clubs', label: 'Clubs' },
] as const;

export function CompeteSubNav() {
  const { user } = useAuth();
  return <SubNav items={user ? [...COMPETE_NAV] : COMPETE_NAV.filter((item) => item.to === '/competitions')} />;
}

type TypeFilter = 'all' | 'free' | 'sponsored' | 'paid';

/** Whatever the board isn't ranked on: km for a steps race, steps for a distance one, both otherwise. */
function otherMetrics(row: { creditedDistanceMetres: number; creditedSteps: number }, table: Pick<CompetitionTable, 'challengeType' | 'scoringMethod'>, unit: Unit) {
  const display = metricOf(table.scoringMethod).display;
  const km = display !== 'distance' && row.creditedDistanceMetres > 0 ? formatDistance(row.creditedDistanceMetres, unit) : null;
  const steps = display !== 'steps' && table.challengeType !== 'CYCLING' && row.creditedSteps > 0 ? `${row.creditedSteps.toLocaleString('en-GB')} steps` : null;
  return [km, steps].filter(Boolean).join(' · ') || null;
}

function scoreText(row: { score: number | null }, table: CompetitionTable, unit: Unit) {
  if (!hasScored(table.scoringMethod, row.score)) return metricOf(table.scoringMethod).aggregate === 'fastest' ? 'Not finished' : 'No score yet';
  return formatScore(table, row.score, unit) ?? '';
}

/** Settled boards from before scores were stored: the old per-method totals. */
function legacyScore(row: { creditedDistanceMetres: number; creditedSteps: number; completionTimeSeconds: number | null }, table: CompetitionTable) {
  const display = metricOf(table.scoringMethod).display;
  return display === 'steps' ? row.creditedSteps : display === 'duration' ? row.completionTimeSeconds : row.creditedDistanceMetres;
}

const ACTIVITY_CHIPS: Array<{ value: 'all' | ChallengeType; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'RUN', label: 'Run' }, { value: 'WALK', label: 'Walk' }, { value: 'CYCLING', label: 'Ride' },
  { value: 'DISTANCE', label: 'Run + walk' }, { value: 'STEP', label: 'Steps' }, { value: 'TIMED', label: 'Timed' },
];
/** How to browse. "Mine" covers what you host and what you archived, picked underneath. */
type BrowseTab = 'for-you' | 'trending' | 'starting' | 'friends' | 'mine' | 'newest';
const BROWSE: Array<{ value: BrowseTab; label: string; signedIn?: boolean; guestOnly?: boolean }> = [
  { value: 'for-you', label: 'For you', signedIn: true }, { value: 'trending', label: 'Trending' }, { value: 'starting', label: 'Upcoming' },
  { value: 'friends', label: 'Friends', signedIn: true }, { value: 'mine', label: 'Mine', signedIn: true }, { value: 'newest', label: 'Newest', guestOnly: true },
];
const TYPE_CHIPS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'Any entry' }, { value: 'free', label: 'Free' }, { value: 'sponsored', label: 'Cash prize' }, { value: 'paid', label: 'Paid' },
];

export function CompetitionsPage() {
  const { user } = useAuth();
  const unit = useUnit();
  const now = useNow(60_000);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { q?: string; activity?: string };
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [activity, setActivity] = useState<'all' | ChallengeType>((ACTIVITY_CHIPS.some((chip) => chip.value === search.activity) ? search.activity : 'all') as 'all' | ChallengeType);
  const [view, setView] = useState<DiscoverView>(user ? 'for-you' : 'trending');
  const [term, setTerm] = useState(search.q ?? '');
  const tables = useDiscover(view, filter, activity);
  const loaded = tables.data?.pages.flatMap((page) => page.items) ?? [];
  const mine = useQuery({
    queryKey: ['tables', 'mine'],
    queryFn: () => api<DraftTable[]>('/tables/mine'),
    enabled: Boolean(user),
  });
  const query = term.trim().toLowerCase();
  const list = loaded.filter((table) => !query || table.title.toLowerCase().includes(query) || table.code.toLowerCase() === query
    || (table.creator?.displayName ?? '').toLowerCase().includes(query));
  const drafts = mine.data?.filter((table) => table.hosting && DRAFT_STATUSES.includes(table.status)) ?? [];
  const [draftsOpen, setDraftsOpen] = useState(false);
  const looksLikeCode = /^[0-9A-F]{8}$/i.test(term.trim());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = (activity !== 'all' ? 1 : 0) + (filter !== 'all' ? 1 : 0);
  const tabs = BROWSE.filter((option) => (user ? !option.guestOnly : !option.signedIn));
  const tab: BrowseTab = view === 'created' || view === 'archived' ? 'mine' : view;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (looksLikeCode) void navigate({ to: '/competitions/$code', params: { code: term.trim().toUpperCase() } });
  }

  return (
    <div className="animate-rise">
      <CompeteSubNav />
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-[24px] font-extrabold tracking-tight sm:text-[30px]">Competitions</h1>
        {user && <Link to="/competitions/new" className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-[14px] font-bold text-paper transition-transform active:scale-95"><PlusIcon size={15} /> Create</Link>}
      </header>

      {/* Always shown while Strava sync is unreliable for some runners: recording in Jump always counts. */}
      {user && <Link to="/run" className="mb-4 flex items-center gap-2.5 rounded-lg border-[1.5px] border-ink bg-volt/60 py-2 pl-2 pr-3 transition-colors hover:bg-volt">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-[1.5px] border-ink bg-track" aria-hidden="true">
          <PlayIcon size={12} className="translate-x-[1px]" />
        </span>
        <span className="min-w-0 flex-1 text-[13px] leading-snug"><b>Record your runs in Jump</b> while Strava connections are limited.</span>
        <ArrowRightIcon size={14} className="shrink-0" />
      </Link>}

      <ErrorNotice error={mine.error} onRetry={() => void mine.refetch()} />
      {/* Drafts stay out of the way: one quiet row that opens a sheet to finish or discard them. */}
      {drafts.length > 0 && <button type="button" onClick={() => setDraftsOpen(true)} className="mb-4 flex w-full items-center gap-3 rounded-xl border-[1.5px] border-dashed border-ink/40 px-3.5 py-2.5 text-left transition-colors hover:border-ink">
        <span className="num flex h-7 min-w-7 items-center justify-center rounded-full bg-ink px-2 text-[12px] font-bold text-paper">{drafts.length}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">{drafts.length === 1 ? 'Draft' : 'Drafts'} not live yet</span>
          <span className="block truncate text-[12px] text-ink-3">{drafts.map((draft) => draft.title).join(' · ')}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-bold">Manage<ArrowRightIcon size={14} /></span>
      </button>}
      {draftsOpen && <DraftsSheet drafts={drafts} onClose={() => setDraftsOpen(false)} />}

      <form onSubmit={submit} className="flex items-center gap-2">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border-[1.5px] border-ink bg-card px-3.5">
          <SearchIcon size={17} className="shrink-0 text-ink-3" />
          <input className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3" placeholder="Search or enter a code" value={term} onChange={(event) => setTerm(event.target.value)} aria-label="Search competitions or enter an invite code" />
          {looksLikeCode && <button className="shrink-0 text-[13px] font-bold">Open</button>}
        </label>
        <button type="button" onClick={() => setFiltersOpen(true)} className={cx('relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-ink transition-colors', activeFilters ? 'bg-ink text-paper' : 'bg-card')} aria-label={`Filters${activeFilters ? `, ${activeFilters} on` : ''}`}>
          <SlidersIcon size={19} />
          {activeFilters > 0 && <span className="num absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-[1.5px] border-paper bg-ink px-1 text-[10px] font-bold text-paper">{activeFilters}</span>}
        </button>
      </form>

      {/* How to browse: one segmented control that always fits a phone; filters live in the sheet. */}
      <div className="mt-4 grid rounded-xl bg-ink/[0.06] p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Browse">
        {tabs.map((option) => <button key={option.value} type="button" role="tab" aria-selected={tab === option.value}
          onClick={() => setView(option.value === 'mine' ? 'created' : option.value)}
          className={cx('h-9 truncate rounded-lg px-1 text-[13px] font-semibold transition-colors sm:text-[14px]', tab === option.value ? 'bg-card text-ink shadow-[0_0_0_1.5px_#121212]' : 'text-ink-2 hover:text-ink')}>
          {option.label}
        </button>)}
      </div>
      {tab === 'mine' && <div className="mt-2.5 flex gap-1.5" role="tablist" aria-label="Your competitions">
        {([['created', 'Hosting'], ['archived', 'Archived']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)}
          className={cx('h-8 rounded-full px-3.5 text-[13px] font-semibold transition-colors', view === value ? 'bg-ink text-paper' : 'bg-ink/[0.06] text-ink-2 hover:text-ink')}>{label}</button>)}
      </div>}

      {activeFilters > 0 && <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px]">
        {activity !== 'all' && <button type="button" onClick={() => setActivity('all')} className="inline-flex h-7 items-center gap-1 rounded-full bg-ink/[0.07] px-2.5 font-semibold">{ACTIVITY_CHIPS.find((chip) => chip.value === activity)?.label}<CloseIcon size={12} /></button>}
        {filter !== 'all' && <button type="button" onClick={() => setFilter('all')} className="inline-flex h-7 items-center gap-1 rounded-full bg-ink/[0.07] px-2.5 font-semibold">{TYPE_CHIPS.find((chip) => chip.value === filter)?.label}<CloseIcon size={12} /></button>}
      </div>}

      {filtersOpen && <Modal title="Filters" onClose={() => setFiltersOpen(false)}>
        <p className="mb-2 text-[13px] font-semibold text-ink-3">Activity</p>
        <div className="grid grid-cols-3 gap-2">
          {ACTIVITY_CHIPS.map((option) => <button key={option.value} type="button" onClick={() => setActivity(option.value)} className={cx('h-10 rounded-lg border-[1.5px] text-[14px] font-semibold transition-colors', activity === option.value ? 'border-ink bg-ink text-paper' : 'border-line bg-card hover:border-ink')}>{option.label}</button>)}
        </div>
        <p className="mb-2 mt-5 text-[13px] font-semibold text-ink-3">Entry</p>
        <div className="grid grid-cols-2 gap-2">
          {TYPE_CHIPS.map((option) => <button key={option.value} type="button" onClick={() => setFilter(option.value)} className={cx('h-10 rounded-lg border-[1.5px] text-[14px] font-semibold transition-colors', filter === option.value ? 'border-ink bg-ink text-paper' : 'border-line bg-card hover:border-ink')}>{option.label}</button>)}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary" onClick={() => { setActivity('all'); setFilter('all'); }}>Reset</button>
          <button type="button" className="btn-dark" onClick={() => setFiltersOpen(false)}>Done</button>
        </div>
      </Modal>}

      <p className="num mb-2.5 mt-4 text-[12px] font-medium text-ink-3">{tables.data ? `${list.length}${tables.hasNextPage ? '+' : ''} ${view === 'starting' ? 'starting soon' : view === 'created' ? 'you’re hosting' : view === 'archived' ? 'archived' : 'open'}${query ? ` matching “${term.trim()}”` : ''}` : ' '}</p>
      <ErrorNotice error={tables.error} onRetry={() => void tables.refetch()} />
      {tables.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState
          mark="00"
          title={query ? 'Nothing matches that' : view === 'archived' ? 'Nothing archived' : view === 'created' ? 'You haven’t created one yet' : view === 'friends' ? 'Nothing from your people yet' : view === 'for-you' ? 'You’re in everything that fits' : 'No open competitions'}
          action={user ? <Link to="/competitions/new" className="btn-primary"><PlusIcon size={16} /> {query ? 'Create it yourself' : 'Start the first one'}</Link> : undefined}
        >
          {query ? 'Try another name, or start a competition and send the code to your crew.' : view === 'archived' ? 'When one of yours is over, archive it from its page to tidy it off your lists.' : 'Create a competition and send the invite code to your crew.'}
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((table) => <CompetitionPreviewCard key={table.id} table={table} unit={unit} now={now} />)}
          </div>
          {tables.hasNextPage && <button type="button" className="btn-secondary mt-5 w-full" onClick={() => void tables.fetchNextPage()} disabled={tables.isFetchingNextPage}>{tables.isFetchingNextPage ? 'Loading…' : 'Load more'}</button>}
        </>
      )}
    </div>
  );
}

const DRAFT_STATUSES = ['PENDING_FUNDING', 'PENDING_APPROVAL', 'DRAFT', 'SCHEDULED'];

type DraftTable = { id: string; code: string; title: string; status: string; hosting: boolean; guaranteedPrizeKobo: number | null; createdAt: string };

/** Everything the host started but hasn't opened: finish it (fund it, or wait on review) or throw it away. */
function DraftsSheet({ drafts, onClose }: { drafts: DraftTable[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<string | null>(null);
  const discard = useMutation({
    mutationFn: (id: string) => post(`/tables/${id}/discard`),
    onSuccess(_, id) {
      setConfirming(null);
      toast({ tone: 'ok', message: 'Draft discarded.' });
      queryClient.setQueryData<DraftTable[]>(['tables', 'mine'], (rows) => rows?.filter((row) => row.id !== id));
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
      if (drafts.length <= 1) onClose();
    },
  });

  return <Modal title="Drafts" onClose={onClose}>
    <p className="-mt-1 mb-3 text-[13px] text-ink-3">Nobody can join these until they’re live.</p>
    <ErrorNotice error={discard.error} />
    <ul className="divide-y divide-line">
      {drafts.map((draft) => {
        const review = draft.status === 'PENDING_APPROVAL';
        const club = draft.status === 'DRAFT' || draft.status === 'SCHEDULED';
        return <li key={draft.id} className="py-3">
          {confirming === draft.id
            ? <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-[14px]">Discard <span className="font-semibold">{draft.title}</span>? This can’t be undone.</p>
              <button type="button" className="h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold text-ink-2 hover:text-ink" onClick={() => setConfirming(null)}>Keep</button>
              <button type="button" className="h-9 shrink-0 rounded-full bg-bad px-4 text-[13px] font-bold text-paper disabled:opacity-60" disabled={discard.isPending} onClick={() => discard.mutate(draft.id)}>{discard.isPending ? 'Discarding…' : 'Discard'}</button>
            </div>
            : <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{draft.title}</p>
                <p className="mt-0.5 truncate text-[12px] text-ink-3">
                  {club ? (draft.status === 'DRAFT' ? 'Club draft · publish it when it’s ready' : 'Scheduled to open') : review ? 'Waiting for Jump to review' : draft.guaranteedPrizeKobo ? `Fund the ${formatMoney(draft.guaranteedPrizeKobo).replace(/\.00$/, '')} prize to open entry` : 'Fund the prize to open entry'}
                  {' · '}started {formatDate(draft.createdAt)}
                </p>
              </div>
              <button type="button" onClick={() => setConfirming(draft.id)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-bad-wash hover:text-bad" aria-label={`Discard ${draft.title}`}><TrashIcon size={16} /></button>
              <Link to="/competitions/$code" params={{ code: draft.code }} onClick={onClose} className="inline-flex h-9 shrink-0 items-center rounded-full bg-ink px-4 text-[13px] font-bold text-paper">{review || club ? 'View' : 'Fund'}</Link>
            </div>}
        </li>;
      })}
    </ul>
  </Modal>;
}

/** "2 prizes · 4 winners · top finishers" for the prizes row. */
function prizeSummary(draft: PrizeDraft) {
  const named = draft.prizes.filter((prize) => prize.productName.trim());
  if (!named.length) return 'Add what winners get.';
  const winners = draft.prizes.reduce((sum, prize) => sum + (prize.quantity || 0), 0);
  const first = named[0];
  return `${first.productName.trim()} (${PRIZE_KIND[first.kind].label.toLowerCase()})${named.length > 1 ? ` + ${named.length - 1} more` : ''} · ${winners} ${winners === 1 ? 'winner' : 'winners'} · ${draft.selection === 'draw' ? 'random draw' : 'top finishers'}`;
}

function publishSummary(publish: 'now' | 'schedule' | 'draft', at: string | null, repeat: 'none' | 'weekly' | 'monthly', auto: boolean) {
  const when = publish === 'now' ? 'Publish now' : publish === 'draft' ? 'Save as draft' : at ? `Opens ${formatDateTime(at)}` : 'Schedule';
  const series = repeat === 'none' ? 'once' : `${repeat}${auto ? ', auto-publish' : ', confirm each edition'}`;
  return `${when} · ${series}`;
}

const DURATIONS = [
  { label: '24 hours', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '30 days', days: 30 },
];

export function NewCompetitionPage() {
  const navigate = useNavigate();
  const { club: clubId, template: templateId } = useSearch({ strict: false }) as { club?: string; template?: string };
  // "Challenge someone" starters arrive with everything set; the runner just names it and invites.
  const [preset] = useState(() => templateById(templateId));
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const unit = useUnit();
  const creator = useCreator();
  const club = useQuery({ queryKey: keys.club(clubId ?? ''), queryFn: () => api<Club>(`/clubs/${clubId}`), enabled: Boolean(clubId) });
  // A club manager hosting for the club: prizes, who can enter, when it opens, and repeating it.
  const clubHost = Boolean(club.data && (club.data.myRole === 'owner' || club.data.myRole === 'admin'));
  const [eligibleCountries, setEligibleCountries] = useState<string[]>([]);
  const [prizesOn, setPrizesOn] = useState(false);
  const [prizes, setPrizes] = useState<PrizeDraft>(EMPTY_PRIZES);
  const [publish, setPublish] = useState<'now' | 'schedule' | 'draft'>('now');
  const [publishAt, setPublishAt] = useState(() => toLocalInput(new Date(Date.now() + 86_400_000)));
  const [repeat, setRepeat] = useState<'none' | 'weekly' | 'monthly'>('none');
  const [autoPublish, setAutoPublish] = useState(true);
  const [sheet, setSheet] = useState<'entry' | 'prizes' | 'publish' | 'opponent' | null>(null);
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [mode, setMode] = useState<'free' | 'sponsored' | 'paid'>('free');
  const [title, setTitle] = useState(preset?.title ?? '');
  const [description, setDescription] = useState('');
  const [banner, setBanner] = useState<File | null>(null);
  const bannerPreview = useMemo(() => (banner ? URL.createObjectURL(banner) : null), [banner]);
  useEffect(() => () => { if (bannerPreview) URL.revokeObjectURL(bannerPreview); }, [bannerPreview]);
  const [scoring, setScoring] = useState<ScoringDraft>(() => {
    const draft = draftFor(preset?.challengeType ?? 'RUN', preset?.scoringMethod ?? 'FARTHEST_DISTANCE');
    return preset?.targetKm ? { ...draft, target: String(preset.targetKm) } : draft;
  });
  const challengeType = scoring.challengeType;
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [scoringClosesAt, setScoringClosesAt] = useState(() => toLocalInput(new Date(Date.now() + (preset?.days ?? 7) * 86_400_000)));
  const [remindDaily, setRemindDaily] = useState(false);
  const [reminderTime, setReminderTime] = useState('08:00');
  const reminderTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [capacity, setCapacity] = useState(preset ? String(preset.capacity) : '');
  const [cap, setCap] = useState('');
  const [duration, setDuration] = useState<number | null>(preset?.days ?? 7);
  /** No end date: free competitions only; prizes need an end to pay out. */
  const [openEnded, setOpenEnded] = useState(false);
  const [entryFee, setEntryFee] = useState('');
  const [fundingOption, setFundingOption] = useState<'MULTI_WINNERS' | 'FIXED_WINNERS' | 'FIXED_CHARITY'>('MULTI_WINNERS');
  const [fixedPrize, setFixedPrize] = useState('');
  const [charityName, setCharityName] = useState('');
  const [winnerCount, setWinnerCount] = useState('1');
  const [shares, setShares] = useState(['100']);
  const [inviteClubMembers, setInviteClubMembers] = useState(Boolean(clubId));
  const [format, setFormat] = useState<CompetitionFormat>(preset ? (preset.capacity === 2 ? 'head_to_head' : 'invite') : 'open');
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [emailText, setEmailText] = useState('');
  const [phoneText, setPhoneText] = useState('');

  // Room for the whole club, with space for people who join later.
  useEffect(() => {
    if (club.data && !capacity) setCapacity(String(Math.min(10000, Math.max(20, (club.data.memberCount ?? 0) * 2))));
  }, [club.data, capacity]);

  const startIso = fromLocalInput(startsAt);
  const endless = openEnded && mode === 'free';
  const scoringIso = endless ? null : fromLocalInput(scoringClosesAt);
  const capMetres = cap ? toMetres(Number(cap), unit) : undefined;
  const headToHead = format === 'head_to_head' && mode !== 'paid';
  const capacityNumber = headToHead ? 2 : capacity ? Number(capacity) : undefined;
  const entryFeeKobo = nairaInputToKobo(entryFee);
  const fundingStyle = fundingOption === 'MULTI_WINNERS' ? 'OPEN' : 'FIXED';
  const fundingDestination = fundingOption === 'FIXED_CHARITY' ? 'CHARITY' : 'WINNERS';
  // Scheduling and series are for free competitions (cash ones open once funded); club prizes are for
  // funded and paid ones only, on top of their cash.
  const clubExtras = clubHost && mode === 'free';
  const clubPrizesOn = clubHost && mode !== 'free';
  const later = clubExtras && publish !== 'now';
  const publishIso = later && publish === 'schedule' ? fromLocalInput(publishAt) : null;
  const draftOnCreate = mode === 'paid' || (mode === 'sponsored' && fundingStyle === 'FIXED') || later;
  const guaranteedPrizeKobo = mode === 'paid' ? (capacityNumber ?? 0) * entryFeeKobo : mode === 'sponsored' && fundingStyle === 'FIXED' ? nairaInputToKobo(fixedPrize) : 0;
  const scoringFields = scoringPayload(scoring, unit, mode !== 'free');
  // Head-to-head invites its one opponent; other formats take lists.
  const inviteEmails = headToHead ? (opponent?.kind === 'email' ? [opponent.value] : []) : emailText.split(/[\s,;]+/).map((value) => value.trim().toLowerCase()).filter(Boolean);
  const invitePhones = headToHead ? (opponent?.kind === 'phone' ? [opponent.value] : []) : phoneText.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
  const inviteSummary = [
    club.data && inviteClubMembers ? `Everyone in ${club.data.name}` : '',
    inviteEmails.length ? `${inviteEmails.length} ${inviteEmails.length === 1 ? 'email' : 'emails'}` : '',
    invitePhones.length ? `${invitePhones.length} ${invitePhones.length === 1 ? 'phone' : 'phones'}` : '',
  ].filter(Boolean).join(' · ');
  const isCharity = mode === 'sponsored' && fundingDestination === 'CHARITY';
  const prizeSplitBps = isCharity ? [10000] : shares.map((value) => Math.round(Number(value) * 100));
  const hasPrize = mode !== 'free';
  const prizeError = hasPrize && !isCharity && (!Number.isInteger(Number(winnerCount)) || Number(winnerCount) < 1 || Number(winnerCount) > 100 ||
    shares.length !== Number(winnerCount) || prizeSplitBps.some((part) => !Number.isInteger(part) || part < 1) ||
    prizeSplitBps.reduce((sum, part) => sum + part, 0) !== 10000 || (capacityNumber !== undefined && Number(winnerCount) > capacityNumber));

  const errors = {
    title: title.trim().length > 0 && title.trim().length < 3 ? 'At least 3 characters.' : undefined,
    scoring: startIso && scoringIso && new Date(scoringIso) <= new Date(startIso) ? 'Must be after the start.' : undefined,
    capacity: format === 'head_to_head' && mode !== 'paid' ? undefined : capacityNumber === undefined || capacityNumber < 2 || capacityNumber > 10000 || !Number.isInteger(capacityNumber) ? 'Enter a maximum between 2 and 10,000 runners.' : undefined,
    cap: capMetres !== undefined && (capMetres < 1000 || capMetres > 500000) ? `Between ${formatDistance(1000, unit)} and ${formatDistance(500000, unit)}.` : undefined,
    target: scoringFields.problem ? `${scoringFields.problem}.` : undefined,
    paid: mode === 'paid' && (creator.data?.status !== 'ACTIVE' || entryFeeKobo < 100 || guaranteedPrizeKobo < 100 || guaranteedPrizeKobo > 1_000_000_000 || !Number.isSafeInteger(guaranteedPrizeKobo)) ? 'Use an active creator account, an entry fee of at least ₦1, and a full-capacity pot no greater than ₦10,000,000.' : undefined,
    funding: mode === 'sponsored' && fundingStyle === 'FIXED' && (!Number.isSafeInteger(guaranteedPrizeKobo) || guaranteedPrizeKobo < 1_000_000 || guaranteedPrizeKobo > 1_000_000_000) ? 'Enter a fixed contribution from ₦10,000 to ₦10,000,000.' : mode === 'sponsored' && fundingDestination === 'CHARITY' && (fundingStyle !== 'FIXED' || charityName.trim().length < 2) ? 'Charity funding needs a fixed amount and charity name.' : undefined,
    prize: prizeError || (mode === 'paid' && guaranteedPrizeKobo < 100) ? 'Choose prize shares that total 100% and fit the maximum runner count.' : undefined,
    invites: !draftOnCreate && (inviteEmails.length > 50 || invitePhones.length > 50 || inviteEmails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || invitePhones.some((phone) => !/^\+[1-9]\d{7,14}$/.test(phone))) ? 'Use valid emails and international phone numbers, up to 50 of each.' : undefined,
    club: clubId && !club.data ? 'This club could not be loaded.' : club.data?.suspended ? 'Jump has suspended this club, so it can’t host competitions.' : undefined,
    prizes: clubPrizesOn && prizesOn ? prizeProblem(prizes, capacityNumber) ?? undefined : undefined,
    publishAt: later && publish === 'schedule' && (!publishIso || new Date(publishIso) <= new Date() || (scoringIso && new Date(publishIso) >= new Date(scoringIso))) ? 'Schedule it for a time in the future, before it ends.' : undefined,
    series: clubExtras && repeat !== 'none' && endless ? 'A series needs an end date for each edition.' : undefined,
  };
  // The first thing stopping you, shown under the pinned Create button.
  const blocker = title.trim().length < 3 ? 'Give it a name of at least 3 characters.' : Object.values(errors).find(Boolean) ?? null;

  const create = useMutation({
    mutationFn: () =>
      post<CompetitionTable>(mode === 'paid' ? '/tables/paid-drafts' : '/tables', {
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...scoringFields.fields,
        timeZone: reminderTimeZone,
        ...(startIso ? { startsAt: startIso } : {}),
        ...(endless ? { openEnded: true } : scoringIso ? { scoringClosesAt: scoringIso } : {}),
        ...(remindDaily ? { reminderTime, reminderTimeZone } : {}),
        capacity: headToHead ? 2 : capacityNumber,
        ...(mode !== 'paid' && capMetres ? { distanceCapMetres: capMetres } : {}),
        ...(hasPrize ? { prizeSplitBps } : {}),
        ...(mode === 'sponsored' ? { fundedFree: true, ...(fundingStyle === 'FIXED' ? { guaranteedPrizeKobo } : {}), fundingDestination, ...(fundingDestination === 'CHARITY' ? { charityName: charityName.trim() } : {}) } : {}),
        ...(mode === 'paid' ? { entryFeeKobo } : {}),
        ...(club.data ? { communityId: club.data.id, ...((!draftOnCreate || later) && inviteClubMembers && !headToHead ? { inviteClubMembers: true } : {}) } : {}),
        ...(clubHost && eligibleCountries.length ? { eligibleCountries } : {}),
        ...(clubPrizesOn && prizesOn ? { clubPrizes: prizesPayload(prizes) } : {}),
        ...(later ? { publish, ...(publishIso ? { publishAt: publishIso } : {}) } : {}),
        ...(clubExtras && repeat !== 'none' ? { series: { cadence: repeat, autoPublish } } : {}),
        ...(!draftOnCreate && inviteEmails.length ? { inviteEmails } : {}),
        ...(mode !== 'paid' ? { format, visibility: format === 'open' ? 'public' : 'private' } : {}),
        ...(!draftOnCreate && invitePhones.length ? { invitePhones } : {}),
      }),
    async onSuccess(table) {
      if (banner) {
        await uploadBanner(table.id, banner).catch(() => {
          toast({ tone: 'warn', message: 'Created, but the banner didn’t upload. Add it from Host tools on the competition page.' });
        });
      }
      // A runner on Jump is invited by username once the competition exists.
      if (headToHead && opponent?.kind === 'runner' && table.status === 'OPEN_FOR_ENTRY') {
        await post(`/tables/${table.id}/invitations`, { username: opponent.username }).catch((error: unknown) => {
          toast({ tone: 'warn', message: `Created, but we couldn’t invite @${opponent.username}: ${error instanceof Error ? error.message : 'try again from the competition page.'}` });
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.tables }),
        queryClient.invalidateQueries({ queryKey: ['tables', 'mine'] }),
      ]);
      void navigate({ to: '/competitions/$code', params: { code: table.code }, search: { created: true } });
    },
  });

  function pickDuration(days: number) {
    setOpenEnded(false);
    setDuration(days);
    const start = startIso ? new Date(startIso) : new Date();
    setScoringClosesAt(toLocalInput(new Date(start.getTime() + days * 86_400_000)));
  }

  const preview: CompetitionTable = {
    id: 'preview',
    title: title.trim() || 'Your competition name',
    description: description.trim() || null,
    code: '- - - -',
    type: mode,
    status: mode === 'paid' ? 'PENDING_APPROVAL' : mode === 'sponsored' && fundingStyle === 'FIXED' ? 'PENDING_FUNDING' : 'OPEN_FOR_ENTRY',
    entryFeeKobo: mode === 'paid' ? entryFeeKobo : 0,
    guaranteedPrizeKobo: hasPrize && guaranteedPrizeKobo ? guaranteedPrizeKobo : null,
    fundingDestination: mode === 'sponsored' ? fundingDestination : 'WINNERS',
    charityName: mode === 'sponsored' && fundingDestination === 'CHARITY' ? charityName : null,
    fundedPrizeKobo: 0,
    prizeSplitBps: hasPrize ? prizeSplitBps : [10000],
    fundedAt: null,
    minimumEntrants: mode === 'paid' ? 2 : 1,
    startsAt: startIso ?? null,
    entryClosesAt: scoringIso ?? null,
    scoringClosesAt: scoringIso ?? null,
    capacity: capacityNumber ?? null,
    distanceCapMetres: capMetres ?? null,
    challengeType,
    scoringMethod: scoring.scoringMethod,
    targetDistanceMetres: null,
    ...scoringFields.fields,
    reminderTime: remindDaily ? reminderTime : null,
    reminderTimeZone: remindDaily ? reminderTimeZone : null,
    communityId: club.data?.id ?? null,
    platformFeeBps: mode === 'paid' ? 3500 : mode === 'sponsored' ? 1500 : 3000,
    creatorCommissionBps: mode === 'paid' ? 500 : 0,
    creatorId: user?.id ?? '',
    creator: { id: user?.id ?? '', displayName: user?.displayName ?? null },
    createdAt: new Date().toISOString(),
  };

  return (
    <div className="animate-rise">
      <PageHeader back={{ to: '/competitions', label: 'Competitions' }} eyebrow="New competition" title="Set up a competition" description="Choose the activity and exact scoring method before you publish." />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (blocker) toast({ tone: 'warn', message: blocker });
            else create.mutate();
          }}
        >
          {challengeType === 'CYCLING' ? <Notice tone="neutral" title="Cycling is free to compete">Cycling distance uses GPS verification. Cash prizes are paused until bicycle rides can be distinguished from vehicle trips more reliably.</Notice> : <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Competition type">
            {([
              ['free', 'Free', 'No entry fee, no prize'],
              ['sponsored', 'Funded', 'Free entry, cash prize'],
              ['paid', 'Paid', 'Entry fee, creators only'],
            ] as const).map(([value, title, body]) => <label key={value} className={cx(
              'flex cursor-pointer flex-col rounded-md border-[1.5px] border-ink p-3 transition-all',
              mode === value ? 'bg-ink text-paper shadow-none' : 'bg-card shadow-hard-sm hover:bg-track-wash',
            )}>
              <input type="radio" name="competition-mode" className="sr-only" checked={mode === value} onChange={() => {
                setMode(value);
                if (value !== 'free') setPrizesOn(false);
                // Cash needs a way of winning that's hard to game; fall back to the activity's first one that is.
                if (value !== 'free' && !METRICS[scoring.scoringMethod].prizes) {
                  const safe = ACTIVITY_RULES[challengeType].options.find((option) => METRICS[option.method].prizes);
                  if (safe) setScoring(draftFor(challengeType, safe.method, scoring));
                }
              }} />
              <span className="wide text-[13px] font-extrabold uppercase">{title}</span>
              <span className={cx('mt-1 text-[11.5px] leading-snug', mode === value ? 'text-paper/70' : 'text-ink-2')}>{body}</span>
            </label>)}
          </div>}
          {club.data && <Notice tone="neutral" title={`Hosting for ${club.data.name}`}>
            {mode === 'paid'
              ? `All ${club.data.memberCount} members are invited once Jump approves it; they choose whether to pay to enter.`
              : inviteClubMembers
                ? `All ${club.data.memberCount} members are entered automatically, and anyone who joins the club later is added while it’s open.`
                : 'Linked to your club. Members aren’t entered automatically.'}
          </Notice>}
          {mode === 'paid' && !creator.data && (
            <Notice tone="warn" title="Creator account required" action={<Link to="/creator" className="btn-quiet btn-sm">Become a creator</Link>}>
              Paid competitions are hosted by approved creators. Apply first; Jump reviews every application.
            </Notice>
          )}
          {mode === 'paid' && creator.data && creator.data.status !== 'ACTIVE' && (
            <Notice tone="warn" title={creator.data.status === 'PENDING' ? 'Your creator account is awaiting approval' : 'Your creator account is suspended'}>
              {creator.data.status === 'PENDING'
                ? 'You can host paid competitions once Jump approves you. You’ll get a notification.'
                : 'You can’t host paid competitions right now. Contact Jump support.'}
            </Notice>
          )}
          <Field label="Competition name" error={errors.title}>
            {(props) => (
              <input
                {...props}
                className="field"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                minLength={3}
                maxLength={120}
                placeholder="e.g. Lekki Saturday 10K"
                required
              />
            )}
          </Field>
          <Field label="What’s it about?" optional hint={`${280 - description.length} characters left`}>
            {(props) => (
              <textarea
                {...props}
                className="field min-h-[76px] py-3"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={280}
                placeholder="e.g. Our run club’s month of miles. Every Saturday long run counts, slowest finisher buys the smoothies."
              />
            )}
          </Field>
          <div>
            <p className="mb-2 text-[13px] font-bold">Banner <span className="font-normal text-ink-3">Optional</span></p>
            {bannerPreview ? (
              <div className="space-y-2">
                <img src={bannerPreview} alt="Banner preview" className="aspect-[2/1] w-full rounded-lg object-cover" />
                <div className="flex gap-2">
                  <label className="btn-secondary btn-sm cursor-pointer">Change<input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) setBanner(file); }} /></label>
                  <button type="button" className="btn-quiet btn-sm" onClick={() => setBanner(null)}>Remove</button>
                </div>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-[1.5px] border-dashed border-line p-5 text-center hover:border-ink">
                <span className="text-[14px] font-bold">Add a banner image</span>
                <span className="text-[12px] text-ink-3">Shown at the top instead of the coloured card. Wide images (2:1) work best.</span>
                <input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) setBanner(file); }} />
              </label>
            )}
          </div>

          <ScoringPicker
            draft={scoring}
            unit={unit}
            prizes={mode !== 'free'}
            error={errors.target}
            onChange={(next) => {
              if (next.challengeType === 'CYCLING') setMode('free');
              setScoring(next);
            }}
          />

          <fieldset>
            <legend className="label">Length</legend>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  onClick={() => pickDuration(option.days)}
                  className={cx('btn btn-sm border-[1.5px] border-ink', !endless && duration === option.days ? 'bg-ink text-paper' : 'bg-card hover:bg-white')}
                  aria-pressed={!endless && duration === option.days}
                >
                  {option.label}
                </button>
              ))}
              {mode === 'free' && <button type="button" onClick={() => { setOpenEnded(true); setDuration(null); }} className={cx('btn btn-sm border-[1.5px] border-ink', endless ? 'bg-ink text-paper' : 'bg-card hover:bg-white')} aria-pressed={endless}>No end date</button>}
            </div>
            {endless && <p className="mt-2 text-[12px] text-ink-3">Runs until you end it. Every verified activity keeps counting; the leader holds the top spot for as long as they keep it.</p>}
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Starts">
              {(props) => (
                <DateTimePicker
                  {...props}
                  quickPicks
                  value={startsAt}
                  min={toLocalInput(new Date())}
                  onChange={(next) => {
                    setStartsAt(next);
                    setDuration(null);
                  }}
                />
              )}
            </Field>
            {!endless && <Field label="Ends" error={errors.scoring} hint="Runners can join and log activities until this.">
              {(props) => (
                <DateTimePicker
                  {...props}
                  value={scoringClosesAt}
                  min={startsAt || undefined}
                  onChange={(next) => {
                    setScoringClosesAt(next);
                    setOpenEnded(false);
                    setDuration(null);
                  }}
                />
              )}
            </Field>}
          </div>

          <div className="panel p-5">
            <label className="flex items-center gap-2 text-[14px] font-semibold">
              <input type="checkbox" checked={remindDaily} onChange={(event) => setRemindDaily(event.target.checked)} />
              Email joined runners a daily reminder
            </label>
            {remindDaily && <Field label={`Reminder time · ${reminderTimeZone}`} hint="Sent once per local day while the competition is active. Runners who have already recorded an activity that day are skipped.">
              {(props) => <input {...props} className="field mt-3 max-w-40" type="time" value={reminderTime} onChange={(event) => setReminderTime(event.target.value)} required />}
            </Field>}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {headToHead ? <div className="self-end text-[13px] text-ink-2">Head-to-head: just you and one other.</div> : <Field label="Max runners" error={errors.capacity} hint="Required for every competition. Choose 2 to 10,000.">
              {(props) => (
                <input {...props} type="number" inputMode="numeric" min={2} max={10000} required className="field num" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
              )}
            </Field>}
            {mode !== 'paid' ? <Field label={`Distance cap per activity (${unit})`} optional error={errors.cap} hint="Stops one monster activity from deciding everything.">
              {(props) => (
                <input {...props} type="number" inputMode="decimal" step="0.1" min={0} className="field num" value={cap} onChange={(event) => setCap(event.target.value)} />
              )}
            </Field> : <div />}
          </div>

          {hasPrize && (
            <div className="panel space-y-5 p-5">
              <SectionTitle>{mode === 'paid' ? 'Paid competition' : 'Funded free competition'}</SectionTitle>
              {mode === 'sponsored' && <>
                <Field label="Funding plan">
                  {(props) => <select {...props} className="field" value={fundingOption} onChange={(event) => setFundingOption(event.target.value as typeof fundingOption)}><option value="MULTI_WINNERS">Growing pool · many people fund winners</option><option value="FIXED_WINNERS">Fixed amount · I fund winners</option><option value="FIXED_CHARITY">Fixed amount · I fund charity</option></select>}
                </Field>
                {fundingStyle === 'FIXED' && <Field label="My fixed contribution · NGN" error={errors.funding} hint="Minimum ₦10,000. The amount shown is before Jump’s 15% fee.">{(props) => <input {...props} className="field num" type="text" inputMode="decimal" value={fixedPrize} onChange={(event) => setFixedPrize(formatNairaInput(event.target.value))} placeholder="10,000" />}</Field>}
                {fundingDestination === 'CHARITY' && <Field label="Charity name" error={errors.funding}>{(props) => <input {...props} className="field" maxLength={120} value={charityName} onChange={(event) => setCharityName(event.target.value)} />}</Field>}
              </>}
              <div className="grid gap-5 sm:grid-cols-2">
                {mode === 'paid' && <Field label="Entry fee · NGN">{(props) => <input {...props} className="field num" type="text" inputMode="decimal" value={entryFee} onChange={(event) => setEntryFee(formatNairaInput(event.target.value))} required />}</Field>}
              </div>
              {mode === 'paid' && <p className="text-[14px] leading-relaxed">Full-capacity prize pot: <span className="num font-bold">{formatMoney(guaranteedPrizeKobo)}</span> <span className="text-ink-2">({capacityNumber || 0} runners × {formatMoney(entryFeeKobo)} entry)</span></p>}
              {!isCharity && <Field label="Number of prize places" hint="Choose one winner, top three, or any number up to 100.">
                {(props) => <input {...props} className="field num" type="number" min="1" max="100" value={winnerCount} onChange={(event) => {
                  const next = event.target.value;
                  setWinnerCount(next);
                  const count = Number(next);
                  if (Number.isInteger(count) && count >= 1 && count <= 100) {
                    if (count === 3) setShares(['50', '30', '20']);
                    else { const equal = Math.floor(10000 / count); setShares(Array.from({ length: count }, (_, index) => ((equal + (index === 0 ? 10000 - equal * count : 0)) / 100).toFixed(2))); }
                  }
                }} required />}
              </Field>}
              {!isCharity && <div className="grid gap-3 sm:grid-cols-3">
                {shares.map((share, index) => <Field key={index} label={`Place ${index + 1} · %`}>
                  {(props) => <input {...props} className="field num" type="number" min="0.01" max="100" step="0.01" value={share} onChange={(event) => setShares((current) => current.map((part, partIndex) => partIndex === index ? event.target.value : part))} required />}
                </Field>)}
              </div>}
              {mode === 'paid' ? <PrizeBreakdown potKobo={guaranteedPrizeKobo} mode={mode} shares={prizeSplitBps} /> : <p className="text-[13px] text-ink-2">Jump retains 15%. {fundingDestination === 'CHARITY' ? 'The other 85% is held for the charity until an admin verifies the recipient.' : 'Your percentages split the remaining 85% between eligible winners.'}</p>}
              <p className="text-[12px] leading-relaxed text-ink-3">{mode === 'paid'
                ? 'This is a fixed guaranteed pot based on a full competition, even if fewer runners join. Jump must confirm that the full prize is funded before opening paid entry.'
                : fundingStyle === 'FIXED' ? 'Entry is free. The competition opens after your fixed contribution is confirmed.' : 'Joining opens immediately, with no creator funding required. Anyone can contribute any amount from ₦1 through Paystack before scoring closes and still compete for the cash prize.'}</p>
            </div>
          )}

          {mode !== 'paid' && <section className="panel space-y-3 p-5">
            <SectionTitle>Who competes</SectionTitle>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Who competes">
              {(Object.keys(FORMATS) as CompetitionFormat[]).map((value) => <label key={value} className={cx('cursor-pointer rounded-md border-[1.5px] p-3.5 transition-colors', format === value ? 'border-ink bg-ink text-paper' : 'border-line bg-card hover:border-ink-3')}>
                <input type="radio" name="competition-format" className="sr-only" checked={format === value} onChange={() => setFormat(value)} />
                <span className="wide block text-[13px] font-extrabold uppercase">{FORMATS[value].label}</span>
                <span className={cx('mt-1 block text-[12px] leading-snug', format === value ? 'text-paper/70' : 'text-ink-2')}>{FORMATS[value].summary}</span>
              </label>)}
            </div>
            {format === 'invite' && <p className="text-[12px] text-ink-3">Invite by email below, or by username from the competition page after you create it.</p>}
          </section>}

          {clubHost && <div className="space-y-2.5">
            <p className="label">For {club.data!.name}</p>
            <SheetRow title="Who can enter" onOpen={() => setSheet('entry')}
              summary={eligibleCountries.length ? `${eligibleCountries.map(countryName).join(', ')} only` : 'Anyone, anywhere'} />
            {clubPrizesOn && <SheetRow title="Club prizes" tone={prizesOn ? 'on' : 'default'} onOpen={() => { if (!prizesOn) setPrizesOn(true); setSheet('prizes'); }} error={errors.prizes}
              summary={prizesOn ? prizeSummary(prizes) : 'None yet. Add products, discounts or experiences.'} />}
            {clubExtras && <SheetRow title="Publishing" onOpen={() => setSheet('publish')} error={errors.publishAt ?? errors.series}
              summary={publishSummary(publish, publishIso ?? null, repeat, autoPublish)} />}
          </div>}

          <Sheet open={sheet === 'entry'} onOpenChange={(open) => setSheet(open ? 'entry' : null)} title="Who can enter"
            description="Only people whose profile country is listed can join."
            footer={<button type="button" className="btn-primary w-full" onClick={() => setSheet(null)}>Done</button>}>
            {/* Room below for the country list to open into. */}
            <div className="min-h-[340px]">
              <CountriesField label="Countries" value={eligibleCountries} onChange={setEligibleCountries} emptyLabel="Anyone, anywhere" hint="Leave empty to open it to everyone." />
            </div>
          </Sheet>

          {clubPrizesOn && <Sheet open={sheet === 'prizes'} onOpenChange={(open) => setSheet(open ? 'prizes' : null)} title="Club prizes"
            description={`From ${club.data!.name}. Winners get a claim form when it ends.`}
            footer={<div className="flex gap-2">
              <button type="button" className="btn-secondary flex-1" onClick={() => { setPrizesOn(false); setPrizes(EMPTY_PRIZES); setSheet(null); }}>Remove prizes</button>
              <button type="button" className="btn-primary flex-1" onClick={() => { const problem = prizeProblem(prizes, capacityNumber); if (problem) toast({ tone: 'warn', message: problem }); else setSheet(null); }}>Done</button>
            </div>}>
            <PrizeEditor clubSlug={club.data!.slug} value={prizes} onChange={setPrizes} />
            <p className="mt-5 text-[12px] leading-relaxed text-ink-3">By publishing, {club.data!.name} commits to these prizes and to delivering them to every listed country. Jump can remove competitions that break its rules.</p>
          </Sheet>}

          {clubExtras && <Sheet open={sheet === 'publish'} onOpenChange={(open) => setSheet(open ? 'publish' : null)} title="Publishing"
            description="When it opens, and whether it repeats."
            footer={<button type="button" className="btn-primary w-full" onClick={() => { if (errors.publishAt) toast({ tone: 'warn', message: errors.publishAt }); else setSheet(null); }}>Done</button>}>
            <div className="space-y-2" role="radiogroup" aria-label="When it opens">
              {([['now', 'Publish now', 'Opens as soon as you create it.'], ['schedule', 'Schedule', 'Opens at the time you pick.'], ['draft', 'Save as draft', 'Only your club’s managers see it.']] as const).map(([value, label, body]) =>
                <label key={value} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border-[1.5px] p-3.5 transition-colors', publish === value ? 'border-ink bg-ink text-paper' : 'border-line bg-card hover:border-ink-3')}>
                  <input type="radio" className="sr-only" checked={publish === value} onChange={() => setPublish(value)} />
                  <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', publish === value ? 'border-paper' : 'border-ink/30')}>{publish === value && <span className="h-2.5 w-2.5 rounded-full bg-paper" />}</span>
                  <span className="min-w-0"><span className="block text-[14px] font-bold">{label}</span><span className={cx('block text-[12.5px] leading-snug', publish === value ? 'text-paper/70' : 'text-ink-2')}>{body}</span></span>
                </label>)}
            </div>
            {publish === 'schedule' && <div className="mt-4"><Field label="Opens" error={errors.publishAt}>
              {(props) => <DateTimePicker {...props} value={publishAt} min={toLocalInput(new Date())} onChange={setPublishAt} />}
            </Field></div>}
            <div className="mt-6 border-t border-line pt-5">
              <p className="label">Repeat</p>
              <div className="grid grid-cols-3 rounded-xl bg-ink/[0.06] p-1">
                {([['none', 'Once'], ['weekly', 'Weekly'], ['monthly', 'Monthly']] as const).map(([value, label]) =>
                  <button key={value} type="button" aria-pressed={repeat === value} onClick={() => setRepeat(value)}
                    className={cx('h-10 rounded-lg text-[14px] font-bold transition-colors', repeat === value ? 'bg-card text-ink shadow-[0_0_0_1.5px_#121212]' : 'text-ink-2')}>{label}</button>)}
              </div>
              {repeat !== 'none' && <>
                <label className="mt-4 flex items-start gap-3 rounded-xl border border-line p-3.5 text-[14px]">
                  <input type="checkbox" className="mt-1" checked={autoPublish} onChange={(event) => setAutoPublish(event.target.checked)} />
                  <span><b>Publish each new edition automatically</b><span className="block text-[12.5px] text-ink-3">Otherwise each edition waits as a draft so you can change its theme and prizes first.</span></span>
                </label>
                <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">Each edition copies these rules and prizes, with its own dates, leaderboard and winners. It’s created a week before it starts, and you manage the series from the club dashboard.</p>
                {errors.series && <p className="hint font-semibold text-bad">{errors.series}</p>}
              </>}
            </div>
          </Sheet>}

          {headToHead && !draftOnCreate ? <SheetRow title="Your opponent" onOpen={() => setSheet('opponent')} tone={opponent ? 'on' : 'default'}
            summary={opponent ? opponentLabel(opponent) : 'Pick who you’re racing: a runner on Jump, an email or a phone number.'} />
          : !draftOnCreate ? <section className="panel flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="wide text-[13px] font-extrabold uppercase">Invite runners</p>
              <p className="truncate text-[12px] text-ink-2">{inviteSummary || 'Optional. Invite by email, phone or club.'}</p>
            </div>
            <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => setInvitesOpen(true)}>{inviteSummary ? 'Edit' : 'Add'}</button>
          </section> : later ? (club.data && <label className="panel flex items-center gap-2 p-4 text-[14px] font-semibold"><input type="checkbox" checked={inviteClubMembers} onChange={(event) => setInviteClubMembers(event.target.checked)} /> Enter everyone in {club.data.name} when it opens</label>)
            : <Notice tone="neutral" title="Invite after launch">Save this draft first. You can invite runners after funding or approval opens entry.</Notice>}
          <OpponentPicker open={sheet === 'opponent'} onOpenChange={(open) => setSheet(open ? 'opponent' : null)} value={opponent} onChange={setOpponent} />
          {invitesOpen && <Modal title="Invite runners" onClose={() => setInvitesOpen(false)}>
            <div className="space-y-4">
              {club.data && <label className="flex items-center gap-2 text-[14px] font-semibold"><input type="checkbox" checked={inviteClubMembers} onChange={(event) => setInviteClubMembers(event.target.checked)} /> Enter everyone in {club.data.name}</label>}
              <Field label="Email addresses" optional hint="Separate with commas or new lines.">
                {(props) => <textarea {...props} autoFocus className="field min-h-20" value={emailText} onChange={(event) => setEmailText(event.target.value)} placeholder="runner@example.com" />}
              </Field>
              <Field label="Phone numbers" optional hint="With country code, e.g. +2348012345678. Text links are ready after you create it.">
                {(props) => <textarea {...props} className="field min-h-20" value={phoneText} onChange={(event) => setPhoneText(event.target.value)} placeholder="+2348012345678" />}
              </Field>
              <button type="button" className="btn-primary w-full" onClick={() => { if (errors.invites) toast({ tone: 'warn', message: errors.invites }); else setInvitesOpen(false); }}>Done</button>
            </div>
          </Modal>}

          <ErrorNotice error={create.error} />
          {/* Always in reach: pinned above the mobile tab bar, at the bottom of the window on desktop. */}
          <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 -mx-4 bg-paper px-4 pb-2.5 pt-3 shadow-[0_-16px_16px_-4px_#F2EFE8] md:bottom-0 md:mx-0 md:px-0">
            <button className="btn-primary min-h-12 w-full md:w-auto md:px-8" disabled={create.isPending || Boolean(blocker)}>
              {create.isPending ? 'Saving…' : mode === 'paid' ? 'Submit paid draft' : mode === 'sponsored' && fundingStyle === 'FIXED' ? 'Save funding draft' : later ? (publish === 'draft' ? 'Save draft' : 'Schedule it') : 'Create competition'}
            </button>
            <p className="mt-1.5 truncate text-center text-[12px] text-ink-3 md:text-left">{blocker ?? (mode === 'paid' ? 'Jump reviews paid competitions before they open.' : mode === 'sponsored' && fundingStyle === 'FIXED' ? 'Entry opens once your payment is confirmed.' : later ? (publish === 'draft' ? 'Publish it from the club dashboard when it’s ready.' : `Opens ${publishIso ? formatDateTime(publishIso) : 'at the time you pick'}.`) : 'Opens as soon as you create it.')}</p>
          </div>
        </form>

        <aside className="hidden lg:block" aria-label="Preview">
          <p className="eyebrow mb-3">Preview</p>
          <div className="pointer-events-none">
            <CompetitionCard table={preview} unit={unit} now={Date.now()} />
          </div>
        </aside>
      </div>
    </div>
  );
}

export function CompetitionDetailPage() {
  const { code } = useParams({ strict: false }) as { code: string };
  const search = useSearch({ strict: false }) as { created?: boolean };
  const { user } = useAuth();
  const unit = useUnit();
  const now = useNow(30_000);
  const table = useQuery({
    queryKey: keys.table(code),
    queryFn: () => api<CompetitionTable>(`/tables/${encodeURIComponent(code)}`),
    refetchOnWindowFocus: 'always',
    refetchInterval: (query) => ['PENDING_APPROVAL', 'PENDING_FUNDING'].includes(query.state.data?.status ?? '') ? 5_000 : false,
  });
  const result = useFinalResult(table.data?.id);
  const live = table.data ? ['open', 'upcoming', 'entry-closed'].includes(competitionPhase(table.data, now)) : false;
  const standings = useStandings(table.data?.id, live ? 30_000 : false);
  const registration = useQuery({
    queryKey: ['table-registration', table.data?.id, user?.id],
    queryFn: () => api<{ joined: boolean }>(`/tables/${table.data!.id}/registration`),
    enabled: Boolean(table.data?.id && user),
  });

  const me = standings.data?.find((row) => row.userId === user?.id);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (user && me && table.data) rememberTable(user.id, { id: table.data.id, code: table.data.code, title: table.data.title });
  }, [me, table.data, user]);

  const rows: LeaderboardRow[] = useMemo(() => {
    const live = new Map(standings.data?.map((row) => [row.userId, row]));
    if (result.data && table.data) {
      return result.data.standings.map((row) => ({
        rank: row.rank,
        userId: row.userId,
        name: live.get(row.userId)?.displayName ?? (row.userId === user?.id ? user.displayName ?? 'You' : 'Runner'),
        avatarUrl: live.get(row.userId)?.avatarUrl,
        avatarStyle: live.get(row.userId)?.avatarStyle,
        username: live.get(row.userId)?.username,
        metres: row.creditedDistanceMetres,
        score: row.score ?? legacyScore(row, table.data!),
        host: row.userId === table.data?.creatorId,
        detail: otherMetrics(row, table.data!, unit),
      }));
    }
    return (standings.data ?? []).map((row) => ({
      rank: row.rank,
      userId: row.userId,
      name: row.displayName,
      avatarUrl: row.avatarUrl,
      avatarStyle: row.avatarStyle,
      verified: row.verified,
      username: row.username,
      metres: row.creditedDistanceMetres,
      score: row.score,
      host: row.userId === table.data?.creatorId,
      detail: [otherMetrics(row, table.data!, unit), row.qualified === false ? 'Not yet qualified' : null].filter(Boolean).join(' · ') || null,
    }));
  }, [result.data, standings.data, table.data, unit, user]);

  if (table.isLoading) return <Loading />;
  if (table.error || !table.data) {
    return (
      <>
        <PageHeader back={{ to: '/competitions', label: 'Competitions' }} title="Competition not found" />
        {isApiError(table.error, 404) ? (
          <EmptyState title={`No competition with code ${code.toUpperCase()}`}>Check the invite code and try again. Codes are 8 letters and numbers.</EmptyState>
        ) : (
          <ErrorNotice error={table.error} onRetry={() => void table.refetch()} />
        )}
      </>
    );
  }

  const t = table.data;
  const isFinal = Boolean(result.data);
  const shareUrl = `${window.location.origin}/competitions/${t.code}`;
  const isHost = user?.id === t.creatorId;
  const manages = isHost || Boolean(t.canManage);
  const unpublished = t.status === 'DRAFT' || t.status === 'SCHEDULED';
  const hostName = t.creator?.displayName ?? 'A Jump runner';
  const entrants = Math.max(standings.data?.length ?? 0, t.entrantCount ?? 0);

  return (
    <div className="animate-rise">
      <Link to="/competitions" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink">
        <ArrowLeftIcon size={16} /> Competitions
      </Link>

      {search.created && (
        <Notice tone="ok" className="mb-6" title="Competition created">
          {t.status === 'PENDING_APPROVAL' ? 'Your draft is waiting for Jump approval. ' : t.status === 'PENDING_FUNDING' ? 'Fund the prize to open entry. ' : t.status === 'DRAFT' ? 'Saved as a draft. Only your club’s managers can see it. ' : t.status === 'SCHEDULED' ? `It opens ${t.publishAt ? formatDateTime(t.publishAt) : 'soon'}. ` : 'Your competition is open. '}
          {t.status === 'PENDING_FUNDING' ? 'This draft is saved to your account. You can leave and return to fund it.' : 'Share the link so friends can join.'}
        </Notice>
      )}

      {t.archivedAt && <Notice tone="neutral" className="mb-6" title="Archived">
        {isHost ? 'Off every list, including yours. Anyone with the link can still see it. Unarchive it below to bring it back.' : 'The host archived this competition. Its final board stays here.'}
      </Notice>}

      {manages && unpublished && <DraftPanel table={t} />}

      {isHost && t.status === 'PENDING_FUNDING' && !search.created && <Notice tone="warn" className="mb-6" title="Funding draft">
        This competition is saved but not live. Only you can fund the fixed amount; entry opens after Jump verifies the Paystack payment.
      </Notice>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-10">
        {/* Cover, title, host and the leaderboard */}
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <ChallengeCover table={t} unit={unit} now={now} />
          {t.visibility === 'private' && <p className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-paper"><LockIcon size={12} /> Private · invite only</p>}
          <h1 className={cx('display break-words text-[34px] leading-[0.95] sm:text-[44px]', t.visibility === 'private' ? 'mt-3' : 'mt-5')}>{t.title}</h1>
          <div className="mt-4 flex items-center gap-3">
            <Avatar name={hostName} src={t.creator?.avatarUrl} avatarStyle={t.creator?.avatarStyle} size={40} className="rounded-full" />
            <p className="min-w-0 text-[14px] leading-snug">
              {t.creator?.username ? (
                <Link to="/runners/$username" params={{ username: t.creator.username }} search={{}} className="font-bold hover:underline">{hostName}</Link>
              ) : (
                <span className="font-bold">{hostName}</span>
              )}
              {isHost ? ' · you’re hosting' : me ? ' is hosting' : ' invited you to join'}
              <span className="block text-[12px] text-ink-3">Created {formatDate(t.createdAt, { year: 'numeric' })}</span>
            </p>
          </div>
          {t.description && <p className="mt-4 max-w-xl whitespace-pre-line break-words text-[15px] leading-relaxed">{t.description}</p>}
          {t.club && <Link to="/clubs/$id" params={{ id: t.club.slug }} search={{}} className="mt-4 inline-flex max-w-full items-center gap-2.5 rounded-full border-[1.5px] border-ink bg-card py-1.5 pl-1.5 pr-4 transition-shadow hover:shadow-hard-sm">
            {t.club.logoUrl ? <img src={t.club.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full bg-white object-cover" /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold" style={{ background: t.club.accentColor }}>{t.club.name.charAt(0)}</span>}
            <span className="min-w-0 truncate text-[13px]"><b>{t.club.name}</b>{t.club.seriesTitle && t.edition ? ` · ${t.club.seriesCadence === 'monthly' ? 'Monthly' : 'Weekly'} series, edition ${t.edition}` : ` · ${t.club.followerCount} ${t.club.followerCount === 1 ? 'follower' : 'followers'}`}</span>
          </Link>}
        </div>

        {/* The join box: sticky beside the story on desktop, straight after the intro on phones */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          {!unpublished && <EntryPanel table={t} joined={registration.data?.joined} joinedRank={me?.rank} joinedScore={me ? scoreText(me, t, unit) : undefined} entrants={entrants} faces={rows} now={now} />}
          {!['PENDING_FUNDING', 'PENDING_APPROVAL', 'CANCELLED', 'DRAFT', 'SCHEDULED'].includes(t.status) && <ShareBox table={t} url={shareUrl} rows={standings.data ?? []} viewerId={user?.id} unit={unit} />}
        </aside>

        <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-2">
          <section>
            <SectionTitle aside={isFinal ? <span className="tag border-ink bg-volt">Final</span> : t.status === 'PENDING_FUNDING' ? <span className="tag border-line bg-card text-ink-2">Draft</span> : <LiveTag />}>
              Leaderboard
            </SectionTitle>
            {standings.isLoading ? (
              <Skeleton className="h-48" />
            ) : standings.error ? (
              <ErrorNotice error={standings.error} onRetry={() => void standings.refetch()} />
            ) : (
              <Leaderboard
                rows={rows}
                currentUserId={user?.id}
                unit={unit}
                limit={showAll ? 200 : 10}
                metricLabel={scoreHeader(t)}
                formatScore={metricOf(t.scoringMethod).display === 'distance' ? undefined : (row) => (
                  <span className="score num whitespace-nowrap text-[20px]">
                    {hasScored(t.scoringMethod, row.score) ? formatScore(t, row.score, unit, { short: true }) : '-'}
                  </span>
                )}
                empty={<EmptyState title="Nobody’s on the board yet">Join now and your first verified {({ RUN: 'run', WALK: 'walk', CYCLING: 'ride', DISTANCE: 'run, walk or ride' } as Record<string, string>)[t.challengeType] ?? 'activity'} puts you on top.</EmptyState>}
              />
            )}
            {rows.length > 10 && (
              <button type="button" className="btn-quiet mt-3 w-full" onClick={() => setShowAll((value) => !value)}>
                {showAll ? 'Show top 10' : `See all ${rows.length} runners`}
              </button>
            )}
          </section>
          {t.productPrizes && <PrizeTerms terms={t.productPrizes} clubName={t.club?.name} />}
          {!me && !isHost && <HowItWorks table={t} unit={unit} />}


          <KeyDates table={t} now={now} />
          {manages && !['PENDING_FUNDING', 'PENDING_APPROVAL', 'CANCELLED', 'DRAFT', 'SCHEDULED'].includes(t.status) && <HostTools table={t} now={now} />}
          <Rules table={t} unit={unit} />
          {isHost && t.status === 'OPEN_FOR_ENTRY' && <InvitationsPanel table={t} />}
        </div>
      </div>
    </div>
  );
}

/** A club competition that isn't public yet: open it now, or manage it from the club dashboard. */
function DraftPanel({ table }: { table: CompetitionTable }) {
  const queryClient = useQueryClient();
  const publish = useMutation({
    mutationFn: () => post(`/tables/${table.id}/publish`, {}),
    async onSuccess() {
      await Promise.all([queryClient.invalidateQueries({ queryKey: keys.table(table.code) }), queryClient.invalidateQueries({ queryKey: ['club'] })]);
      toast({ tone: 'ok', message: 'Published. Your followers have been told.' });
    },
  });
  return <Notice tone="warn" className="mb-6" title={table.status === 'SCHEDULED' ? `Scheduled to open ${table.publishAt ? formatDateTime(table.publishAt) : ''}` : 'Draft · not public yet'}
    action={<div className="flex flex-wrap gap-2">
      <button type="button" className="btn-primary btn-sm" disabled={publish.isPending} onClick={() => publish.mutate()}>{publish.isPending ? 'Publishing…' : 'Publish now'}</button>
      {table.club && <Link to="/clubs/$id/dashboard" params={{ id: table.club.slug }} className="btn-secondary btn-sm">Edit in dashboard</Link>}
    </div>}>
    Only your club’s managers can see it. {table.status === 'SCHEDULED' ? 'It opens on its own at that time, and your followers are told.' : 'Change its theme, dates and prizes from the club dashboard, then publish it.'}
    <ErrorNotice error={publish.error} />
  </Notice>;
}

/** Uploads a competition's banner, scaled to at most 2000px. */
async function uploadBanner(tableId: string, file: File) {
  const form = new FormData();
  const blob = await prepare(file, 2000);
  form.append('file', blob, blob === file ? file.name : 'banner.jpg');
  return api<{ bannerUrl: string }>(`/tables/${tableId}/banner`, { method: 'POST', body: form });
}

/** The poster at the top of an invite: the challenge's colour, its one big number and its mark. */
function ChallengeCover({ table, unit, now }: { table: CompetitionTable; unit: Unit; now: number }) {
  // The host's banner fills the card; the same details sit on top of it, over a dark fade so they
  // read on any photo.
  const banner = table.bannerUrl;
  const theme = cardTheme(table);
  const hero = challengeHeadline(table, unit);
  return (
    <div className={cx('relative overflow-hidden rounded-xl border-[1.5px] border-ink px-5 pb-6 pt-4 sm:px-7 sm:pb-8', banner ? 'flex aspect-[2/1] flex-col justify-between bg-ink text-paper' : theme.band)}>
      {banner ? (
        <>
          <img src={banner} alt={`${table.title} banner`} className="absolute inset-0 h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-black/5 to-black/75" aria-hidden="true" />
        </>
      ) : (
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.13]" preserveAspectRatio="none" viewBox="0 0 400 200" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((lane) => (
            <path key={lane} d={`M-20 ${200 - lane * 26}C120 ${180 - lane * 30} 240 ${120 - lane * 22} 420 ${60 - lane * 18}`} fill="none" stroke="currentColor" strokeWidth="3" />
          ))}
        </svg>
      )}
      <div className="relative flex flex-wrap items-center gap-1.5">
        <TypeTag table={table} />
        <span className="tag bg-paper text-ink">{activityLabel(table.challengeType)}</span>
        <PhaseTag table={table} now={now} />
      </div>
      <div className={cx('relative flex items-end justify-between gap-4', banner ? 'mt-4 [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]' : 'mt-10 sm:mt-14')}>
        <div className="min-w-0">
          <p className="score whitespace-nowrap text-[clamp(44px,13vw,88px)] uppercase leading-[0.85]">{hero.big}</p>
          <p className={cx('mt-2 text-[12px] font-bold uppercase tracking-[0.14em]', banner ? 'opacity-90' : 'opacity-75')}>{hero.small}</p>
        </div>
        <ChallengeMark type={table.challengeType} code={table.code} size={64} />
      </div>
    </div>
  );
}

/** For people arriving from an invite who have never heard of a Jump challenge. */
function HowItWorks({ table, unit }: { table: CompetitionTable; unit: Unit }) {
  const cycling = table.challengeType === 'CYCLING';
  const distance = table.challengeType === 'DISTANCE';
  const counts = table.challengeType === 'RUN' ? 'run' : table.challengeType === 'WALK' ? 'walk' : cycling ? 'ride' : 'walk and run';
  const ends = table.scoringClosesAt ? formatDate(table.scoringClosesAt) : null;
  const prizePot = table.type === 'sponsored' ? (table.fundedPrizeKobo || table.guaranteedPrizeKobo) : table.guaranteedPrizeKobo;
  const prize = table.fundingDestination === 'CHARITY'
    ? `${prizePot ? formatMoney(prizeSplit(prizePot, table.platformFeeBps, 0).winnerKobo).replace(/\.00$/, '') : '85% of verified funding'} is reserved for ${table.charityName ?? 'charity'}, pending admin verification. No cash prize is paid to runners.`
    : prizePot
    ? `${formatMoney(prizeSplit(prizePot, table.platformFeeBps, table.creatorCommissionBps).winnerKobo).replace(/\.00$/, '')} goes to ${table.prizeSplitBps?.length > 1 ? `the top ${table.prizeSplitBps.length}` : 'the winner'}, paid out by Jump.`
    : table.type === 'sponsored' ? 'Anyone can contribute to the prize pool before scoring closes.' : 'The top spot takes the bragging rights.';
  const steps = [
    {
      title: table.type === 'paid' ? `Join for ${formatMoney(table.entryFeeKobo).replace(/\.00$/, '')}` : 'Join for free',
      body: table.type === 'paid' ? 'Pay securely with Paystack. Entry fees build the prize pot.' : 'One tap and you’re on the board. No fee, no catch.',
    },
    {
      title: distance ? 'Run, walk or cycle with Jump' : cycling ? 'Cycle with Jump' : `${counts === 'walk and run' ? 'Walk or run' : counts === 'run' ? 'Run' : 'Walk'} with Jump`,
      body: distance ? 'Record a run, walk or ride in Jump, or sync from Strava. Every verified distance in the competition window counts.' : cycling ? 'Choose Cycle when you start. Every GPS-verified ride in the competition window counts.' : `Hit Run in the app whenever you head out, or sync from Strava. Every verified ${counts} in the competition window counts.`,
    },
    {
      title: 'Climb the board',
      body: `${winsLabel(table, unit)}.${ends ? ` It ends ${ends}.` : ''} ${prize}`,
    },
  ];
  return (
    <section>
      <SectionTitle>How it works</SectionTitle>
      <p className="mb-5 max-w-xl text-[15px] leading-relaxed text-ink-2">
        {cycling ? 'Record rides with Jump. GPS-verified cycling distance updates the leaderboard; rides do not score in running leagues or foot-activity competitions. Cycling is free to enter and has no cash prize.' : distance ? 'Verified runs, walks and rides all add to your distance. Record them in Jump or sync from Strava, and the leaderboard updates when verification finishes.' : 'A Jump competition brings your people together. Everyone records their walks and runs with Jump, GPS and steps are checked, and the leaderboard updates live. It’s the easiest way to stay consistent with your people.'}
      </p>
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="rounded-xl border border-line bg-card p-4">
            <span className="score flex h-9 w-9 items-center justify-center rounded-full bg-ink text-[18px] text-volt">{index + 1}</span>
            <p className="wide mt-3 text-[14px] font-extrabold uppercase leading-tight">{step.title}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * For the host: edit the details, change dates (free competitions), end it now, and archive it once
 * it's over. Prize competitions keep the dates they were funded or approved with.
 */
function HostTools({ table, now }: { table: CompetitionTable; now: number }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const phase = competitionPhase(table, now);
  const over = phase === 'scoring-closed' || phase === 'final';
  const free = table.type === 'free';
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.table(table.code) }),
    queryClient.invalidateQueries({ queryKey: ['tables'] }),
    queryClient.invalidateQueries({ queryKey: keys.standings(table.id) }),
  ]);
  const endNow = useMutation({
    mutationFn: () => patch(`/tables/${table.id}`, { endNow: true }),
    async onSuccess() { await refresh(); toast({ tone: 'ok', message: 'Ended. The board is final for a free competition.' }); },
  });
  const archive = useMutation({
    mutationFn: (archived: boolean) => post(`/tables/${table.id}/archive`, { archived }),
    async onSuccess(_, archived) { await refresh(); toast({ tone: 'ok', message: archived ? 'Archived. It’s off your lists; the link still works.' : 'Back on your lists.' }); },
  });
  // Free competitions can always go; others only while no money is attached (the API decides).
  const navigate = useNavigate();
  const deletion = useQuery({ queryKey: ['table-deletion', table.id], queryFn: () => api<{ canDelete: boolean; reason: string | null }>(`/tables/${table.id}/deletion`) });
  const remove = useMutation({
    mutationFn: () => api(`/tables/${table.id}`, { method: 'DELETE' }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast({ tone: 'ok', message: 'Competition deleted.' });
      void navigate({ to: '/competitions' });
    },
  });
  const others = Math.max(0, (table.entrantCount ?? 0) - 1);
  const banner = useMutation({
    mutationFn: (file: File | null) => (file ? uploadBanner(table.id, file) : api(`/tables/${table.id}/banner`, { method: 'DELETE' })),
    async onSuccess(_, file) { await refresh(); toast({ tone: 'ok', message: file ? 'Banner updated.' : 'Banner removed.' }); },
  });
  return <section className="panel p-5">
    {confirm.dialog}
    <p className="eyebrow mb-3">Host tools</p>
    <div className="flex flex-wrap gap-2">
      {!over && <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(true)}><EditIcon size={14} /> Edit details</button>}
      {!over && <label className={cx('btn-secondary btn-sm cursor-pointer', banner.isPending && 'pointer-events-none opacity-50')}>
        {banner.isPending ? 'Uploading…' : table.bannerUrl ? 'Change banner' : 'Add banner'}
        <input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) banner.mutate(file); }} />
      </label>}
      {!over && table.bannerUrl && <button type="button" className="btn-quiet btn-sm" disabled={banner.isPending} onClick={() => banner.mutate(null)}>Remove banner</button>}
      {!over && free && <button type="button" className="btn-secondary btn-sm" disabled={endNow.isPending} onClick={() => confirm.ask({
        title: 'End it now?',
        body: 'Scoring closes immediately and the board as it stands is the final result. This can’t be undone.',
        confirmLabel: 'End now',
        danger: true,
        onConfirm: () => endNow.mutate(),
      })}>End now</button>}
      {table.archivedAt
        ? <button type="button" className="btn-secondary btn-sm" disabled={archive.isPending} onClick={() => archive.mutate(false)}>Unarchive</button>
        : (over || (table.entrantCount ?? 0) <= 1) && <button type="button" className="btn-secondary btn-sm" disabled={archive.isPending} onClick={() => confirm.ask({
          title: 'Archive this competition?',
          body: 'It comes off every list, yours included (find it under Compete → Archived). The page and its final board stay at the same link.',
          confirmLabel: 'Archive',
          onConfirm: () => archive.mutate(true),
        })}>Archive</button>}
    </div>
    <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
      {over ? 'It’s over. Archive it to tidy it off your lists.' : free ? 'You can change the name, description and dates, or end it early.' : 'You can change the name and description. Prize competitions keep their dates.'}
    </p>
    {deletion.data?.canDelete && <button type="button" className="btn-danger btn-sm mt-3" disabled={remove.isPending} onClick={() => confirm.ask({
      title: 'Delete this competition?',
      body: `It disappears for everyone, its board and link included. ${others ? `The ${others === 1 ? 'person' : `${others} people`} in it will be told. ` : ''}This can’t be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => remove.mutate(),
    })}>{remove.isPending ? 'Deleting…' : 'Delete competition'}</button>}
    {!over && <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">A banner is optional. It replaces the coloured card at the top; wide images (2:1) work best.</p>}
    <ErrorNotice error={endNow.error ?? archive.error ?? banner.error ?? remove.error} />
    {editing && <EditCompetitionSheet table={table} now={now} onClose={() => setEditing(false)} onSaved={refresh} />}
  </section>;
}

function EditCompetitionSheet({ table, now, onClose, onSaved }: { table: CompetitionTable; now: number; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [title, setTitle] = useState(table.title);
  const [description, setDescription] = useState(table.description ?? '');
  const started = !table.startsAt || new Date(table.startsAt).getTime() <= now;
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date(table.startsAt ?? Date.now())));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(new Date(table.scoringClosesAt ?? Date.now() + 7 * 86_400_000)));
  const [openEnded, setOpenEnded] = useState(!table.scoringClosesAt);
  const free = table.type === 'free';
  const save = useMutation({
    mutationFn: () => patch(`/tables/${table.id}`, {
      title: title.trim(),
      description: description.trim() || null,
      ...(free && !started ? { startsAt: fromLocalInput(startsAt) } : {}),
      ...(free ? { scoringClosesAt: openEnded ? null : fromLocalInput(endsAt) } : {}),
    }),
    async onSuccess() { await onSaved(); toast({ tone: 'ok', message: 'Saved.' }); onClose(); },
  });
  return <Modal title="Edit competition" onClose={onClose}>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <Field label="Name">
        {(props) => <input {...props} className="field" minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} required />}
      </Field>
      <Field label="What’s it about?" optional hint={`${280 - description.length} characters left`}>
        {(props) => <textarea {...props} className="field min-h-[76px] py-3" maxLength={280} value={description} onChange={(event) => setDescription(event.target.value)} />}
      </Field>
      {free && !started && <Field label="Starts">
        {(props) => <DateTimePicker {...props} value={startsAt} min={toLocalInput(new Date())} onChange={setStartsAt} />}
      </Field>}
      {free && <>
        {!openEnded && <Field label="Ends" hint="Move it later to give everyone more time, or sooner to finish early.">
          {(props) => <DateTimePicker {...props} value={endsAt} min={toLocalInput(new Date())} onChange={setEndsAt} />}
        </Field>}
        <label className="flex items-center gap-2 text-[14px] font-semibold">
          <input type="checkbox" checked={openEnded} onChange={(event) => setOpenEnded(event.target.checked)} /> No end date
        </label>
      </>}
      {!free && <p className="text-[12px] text-ink-3">Prize competitions keep the dates they were funded or approved with.</p>}
      <ErrorNotice error={save.error} />
      <button className="btn-primary w-full" disabled={save.isPending || title.trim().length < 3}>{save.isPending ? 'Saving…' : 'Save changes'}</button>
    </form>
  </Modal>;
}

function KeyDates({ table, now }: { table: CompetitionTable; now: number }) {
  const merged = !table.entryClosesAt || table.entryClosesAt === table.scoringClosesAt;
  const items = [
    { label: 'Starts', at: table.startsAt },
    ...(merged ? [] : [{ label: 'Entry closes', at: table.entryClosesAt }]),
    { label: 'Ends', at: table.scoringClosesAt },
  ];
  return (
    <section>
      <SectionTitle>Key dates</SectionTitle>
      <ol className="divide-y divide-line rounded-xl border border-line bg-card">
        {items.map((item) => {
          const past = item.at ? new Date(item.at).getTime() <= now : false;
          return (
            <li key={item.label} className="flex items-center justify-between gap-4 px-4 py-3 text-[14px]">
              <span className="flex items-center gap-2.5 font-semibold">
                <span className={cx('h-2.5 w-2.5 rounded-full border-2 border-ink', past ? 'bg-ink' : 'bg-card')} />
                {item.label}
              </span>
              <span className="num text-right text-ink-2">{item.at ? formatDateTime(item.at) : 'No end date'}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Post it: a designed card for stories and posts, or a quick link to WhatsApp and X. */
function ShareBox({ table, url, rows, viewerId, unit }: { table: CompetitionTable; url: string; rows: StandingRow[]; viewerId?: string; unit: Unit }) {
  const [open, setOpen] = useState(false);
  const text = `Join my Jump competition "${table.title}"`;
  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <p className="text-[14px] font-bold">Competitions are better with friends</p>
      <p className="mt-0.5 text-[13px] text-ink-2">Post the card to your story. Anyone who sees it can join with the code.</p>
      <button type="button" className="btn-primary mt-3 w-full" onClick={() => setOpen(true)}>
        <ShareIcon size={16} /> Share card
      </button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <a className="btn-secondary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(`${text}: ${url}`)}`} target="_blank" rel="noreferrer noopener">WhatsApp</a>
        <a className="btn-secondary btn-sm" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer noopener">X</a>
      </div>
      {open && <ShareCompetitionSheet table={table} rows={rows} viewerId={viewerId} unit={unit} onClose={() => setOpen(false)} />}
      <p className="mt-3 flex items-center justify-between text-[12px] text-ink-3">
        <span>Invite code</span>
        <span className="font-mono font-semibold tracking-[0.16em] text-ink">{table.code}</span>
      </p>
    </section>
  );
}

function Rules({ table, unit }: { table: CompetitionTable; unit: Unit }) {
  const items = [
    ...rulesLines(table, unit),
    ...(table.challengeType === 'CYCLING' ? ['Cycling uses GPS distance only. It does not add steps or running-league distance, and there are no cash prizes.'] : []),
    ...(table.eligibleCountries?.length ? [`Open to people whose Jump profile country is ${table.eligibleCountries.map(countryName).join(', ')}.`] : []),
    ...(table.reminderTime ? [`Joined runners may receive a daily email reminder at ${table.reminderTime.slice(0, 5)} (${table.reminderTimeZone}). No reminder is sent after they record an activity that day.`] : []),
    ...(table.type === 'paid' && table.minimumEntrants > 1 ? [`Needs at least ${table.minimumEntrants} entrants to go ahead.`] : []),
    ...(table.type !== 'free' && table.fundingDestination !== 'CHARITY' ? [`Prizes go to the top ${table.prizeSplitBps?.length ?? 1} eligible ${table.prizeSplitBps?.length === 1 ? 'runner' : 'runners'}. If fewer finish, their listed shares are proportionally redistributed. A very small funded pool may pay fewer places.`] : []),
    ...(['paid', 'sponsored'].includes(table.type) && table.fundingDestination !== 'CHARITY' ? ['The host is on the board but cannot receive a cash prize from their own competition.'] : []),
    ...(table.type === 'sponsored' && table.fundingDestination === 'CHARITY' ? [`Only the host funds this fixed amount. Jump retains ${table.platformFeeBps / 100}%; the remaining ${(10000 - table.platformFeeBps) / 100}% is held for ${table.charityName ?? 'the charity'} until an admin verifies the recipient. No runner cash prize is paid.`] : []),
    ...(table.type === 'sponsored' && table.fundingDestination !== 'CHARITY' ? [`${table.guaranteedPrizeKobo ? 'The host funds the fixed prize before entry opens' : 'The competition opens without creator funding. Anyone may contribute from ₦1 before scoring closes and still be eligible to win'}. Eligible winners split ${(10000 - table.platformFeeBps) / 100}% of verified contributions according to the creator’s percentages; Jump retains ${table.platformFeeBps / 100}%.`] : []),
  ];
  return (
    <section className="panel p-5">
      <p className="eyebrow mb-3">How it’s scored</p>
      <ul className="space-y-2.5 text-[13px] leading-relaxed">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 bg-track" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function InvitationsPanel({ table }: { table: CompetitionTable }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const invite = useMutation({
    mutationFn: () => post(`/tables/${table.id}/invitations`, { username: username.trim().replace(/^@/, '') }),
    onSuccess: async () => { setUsername(''); await queryClient.invalidateQueries({ queryKey: ['table', table.id, 'invitations'] }); },
  });
  const invitations = useQuery({
    queryKey: ['table', table.id, 'invitations'],
    queryFn: () => api<Array<{ id: string; email: string | null; phone: string | null; username: string | null }>>(`/tables/${table.id}/invitations`),
  });
  const link = `${window.location.origin}/competitions/${table.code}`;
  return (
    <section className="panel p-5">
      <SectionTitle>Invitations</SectionTitle>
      <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); invite.mutate(); }}>
        <input className="field min-w-0 flex-1" aria-label="Runner username" placeholder="Invite by username" value={username} onChange={(event) => setUsername(event.target.value)} required />
        <button className="btn-secondary btn-sm" disabled={invite.isPending || !username.trim()}>Invite</button>
      </form>
      <p className="mt-2 text-[12px] text-ink-3">They’ll get an in-app message, notification and email.</p>
      <ErrorNotice error={invite.error} className="mt-2" />
      <ErrorNotice error={invitations.error} onRetry={() => void invitations.refetch()} />
      <ul className="space-y-2 text-[13px]">
        {invitations.data?.map((invite) => (
          <li key={invite.id} className="flex items-center justify-between gap-3 border-b border-line py-2">
            <span className="truncate">{invite.username ? `@${invite.username}` : invite.email ?? invite.phone}</span>
            {invite.phone ? <a className="btn-quiet btn-sm shrink-0" href={`sms:${invite.phone}?body=${encodeURIComponent(`Join ${table.title} on Jump: ${link}`)}`}>Send text</a> : <span className="text-ink-3">{invite.username ? 'Sent' : 'Email invite'}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EntryPanel({
  table,
  joined,
  joinedRank,
  joinedScore,
  entrants,
  faces,
  now,
}: {
  table: CompetitionTable;
  joined?: boolean;
  joinedRank?: number;
  joinedScore?: string;
  entrants: number;
  faces: LeaderboardRow[];
  now: number;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const wallet = useWallet();
  const payments = useSavedPayments();
  const pendingPayment = payments.find((payment) => payment.tableId === table.id && OPEN_PAYMENT_STATUSES.includes(payment.lastStatus));
  const pendingEntryPayment = payments.find((payment) => payment.tableId === table.id && payment.purpose !== 'SPONSOR_FUNDING' && OPEN_PAYMENT_STATUSES.includes(payment.lastStatus));
  const open = canEnter(table, now);
  const full = table.capacity !== null && entrants >= table.capacity;
  const [fundingAmount, setFundingAmount] = useState('1,000');
  const fundingKobo = table.guaranteedPrizeKobo ?? nairaInputToKobo(fundingAmount);
  const canFund = table.type === 'sponsored' && (table.guaranteedPrizeKobo ? table.status === 'PENDING_FUNDING' && user?.id === table.creatorId : ['OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED'].includes(table.status)) && (!table.scoringClosesAt || new Date(table.scoringClosesAt).getTime() > now) && (table.fundingDestination !== 'CHARITY' || user?.id === table.creatorId);

  const [confirmLeave, setConfirmLeave] = useState(false);
  const leave = useMutation({
    mutationFn: () => post(`/tables/${table.id}/leave`),
    async onSuccess() {
      setConfirmLeave(false);
      toast({ tone: 'ok', message: `You left ${table.title}.` });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.standings(table.id) }),
        queryClient.invalidateQueries({ queryKey: ['table-registration', table.id, user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['tables', 'mine'] }),
        queryClient.invalidateQueries({ queryKey: keys.table(table.code) }),
      ]);
    },
  });

  const join = useMutation({
    mutationFn: () => post(`/tables/${table.id}/register-free`),
    async onSuccess() {
      if (user) rememberTable(user.id, { id: table.id, code: table.code, title: table.title });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.standings(table.id) }),
        queryClient.invalidateQueries({ queryKey: ['table-registration', table.id, user?.id] }),
        queryClient.invalidateQueries({ queryKey: keys.table(table.code) }),
      ]);
    },
  });

  const checkout = useMutation({
    mutationFn: () => post<CheckoutResponse>(`/tables/${table.id}/checkout`),
    onSuccess(response) {
      // Save the reference before leaving, so the payment can be recovered on return.
      savePayment({
        reference: response.reference,
        tableId: table.id,
        tableCode: table.code,
        tableTitle: table.title,
        amountKobo: table.entryFeeKobo,
        createdAt: new Date().toISOString(),
      });
      window.location.assign(response.authorizationUrl);
    },
  });

  const enterWallet = useMutation({
    mutationFn: () => post(`/challenges/${table.id}/enter-wallet`),
    async onSuccess() {
      if (user) rememberTable(user.id, { id: table.id, code: table.code, title: table.title });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.standings(table.id) }),
        queryClient.invalidateQueries({ queryKey: keys.wallet }),
        queryClient.invalidateQueries({ queryKey: keys.walletTransactions }),
      ]);
    },
  });

  const fundPrize = useMutation({
    mutationFn: (amountKobo: number) => post<CheckoutResponse>(`/tables/${table.id}/fund-prize`, { amountKobo }),
    onSuccess(response, amountKobo) {
      savePayment({ reference: response.reference, purpose: 'SPONSOR_FUNDING', tableId: table.id, tableCode: table.code, tableTitle: table.title, amountKobo, createdAt: new Date().toISOString() });
      window.location.assign(response.authorizationUrl);
    },
  });

  const fundingControl = canFund && user ? (
    <div className="mt-5 border-t border-line pt-4">
      <p className="eyebrow mb-2">{table.fundingDestination === 'CHARITY' ? 'Fund the charity allocation' : 'Fund the prize'}</p>
      {table.guaranteedPrizeKobo !== null && table.guaranteedPrizeKobo < 1_000_000 && <Notice tone="warn">This older fixed draft is below the new ₦10,000 minimum and can’t be funded. Create a new competition with at least ₦10,000.</Notice>}
      {!table.guaranteedPrizeKobo && <Field label="Your contribution · NGN" hint="Optional, any amount from ₦1. Jump keeps 15%; eligible winners share the rest.">
        {(props) => <input {...props} type="text" inputMode="decimal" className="field num" value={fundingAmount} onChange={(event) => setFundingAmount(formatNairaInput(event.target.value))} />}
      </Field>}
      {pendingPayment?.purpose === 'SPONSOR_FUNDING' ? <Link to="/payments/return" className="btn-secondary mt-3 w-full">Check prize payment</Link> : (
        <button type="button" className="btn-secondary mt-3 w-full" onClick={() => fundPrize.mutate(fundingKobo)} disabled={fundPrize.isPending || !Number.isSafeInteger(fundingKobo) || fundingKobo < (table.guaranteedPrizeKobo ? 1_000_000 : 100) || fundingKobo > (table.guaranteedPrizeKobo ? 1_000_000_000 : 100_000_000)}>
          {fundPrize.isPending ? 'Opening Paystack…' : `Fund ${formatMoney(fundingKobo || 0)}`}
        </button>
      )}
      <p className="mt-2 text-[12px] text-ink-3">{table.guaranteedPrizeKobo ? 'Only the host can fund this fixed amount; the host cannot win its cash prize.' : user?.id === table.creatorId ? 'You may contribute, but as host you cannot win this competition’s cash prize.' : 'Contributing is optional and does not affect your prize eligibility. Join the competition separately to compete.'}</p>
      <ErrorNotice error={fundPrize.error} className="mt-3" />
    </div>
  ) : null;

  // Arrived from "Join with Strava" / sign-up / log-in on this page: join free competitions straight away.
  const { join: joinOnArrival } = useSearch({ strict: false }) as { join?: boolean };
  const autoJoined = useRef(false);
  useEffect(() => {
    if (!joinOnArrival || autoJoined.current || !user || joined || table.type === 'paid' || !open || full) return;
    autoJoined.current = true;
    join.mutate();
  }, [joinOnArrival, user, joined, table.type, open, full, join]);

  if (joined || joinedRank !== undefined || user?.id === table.creatorId) {
    return (
      <section className="rounded-xl border-[1.5px] border-ink bg-volt p-5 shadow-hard">
        <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em]">
          {table.status === 'PENDING_FUNDING' ? 'Draft · funding needed' : <><CheckIcon size={16} /> {user?.id === table.creatorId ? 'You’re hosting and already joined' : 'You’re in'}</>}
        </p>
        {joinedRank !== undefined && table.status !== 'PENDING_FUNDING' ? <div className="mt-4 flex items-center gap-4">
          <RankBadge rank={joinedRank} size="lg" />
          <div>
            <p className="wide text-[20px] font-black uppercase leading-none">{ordinal(joinedRank)} place</p>
            <p className="num mt-1 text-[13px]">
              {joinedScore ?? 'No score yet'} · of {entrants}
            </p>
          </div>
        </div> : <p className="mt-3 text-[13px]">{table.status === 'PENDING_FUNDING' ? 'Only you can fund this fixed amount. It will not go live until Paystack confirms the payment.' : 'Your spot is already on the board. Your rank will appear when the standings load.'}</p>}
        {canEnter(table, now) || competitionPhase(table, now) === 'entry-closed' ? (
          <Link to="/run" className="btn-dark mt-5 w-full">
            Record an activity
          </Link>
        ) : null}
        {fundingControl}
        {joined && table.type !== 'paid' && table.status !== 'SETTLED' && (!table.scoringClosesAt || new Date(table.scoringClosesAt).getTime() > now) && (
          confirmLeave ? <div className="mt-4 rounded-md border-[1.5px] border-ink bg-card p-3">
            <p className="text-[14px] font-bold">Leave this competition?</p>
            <p className="mt-0.5 text-[12px] text-ink-2">Your place and score here are removed. You can rejoin while entry is open.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirmLeave(false)} disabled={leave.isPending}>Stay in</button>
              <button type="button" className="btn btn-sm border-2 border-ink bg-bad text-paper shadow-hard-sm" onClick={() => leave.mutate()} disabled={leave.isPending}>{leave.isPending ? 'Leaving…' : 'Leave'}</button>
            </div>
          </div> : <button type="button" className="mt-4 block w-full text-center text-[12px] font-bold text-ink-2 underline decoration-ink/30 decoration-2 underline-offset-4 hover:text-bad" onClick={() => setConfirmLeave(true)}>Leave competition</button>
        )}
        <ErrorNotice error={leave.error} />
      </section>
    );
  }

  const isPaid = table.type === 'paid';
  const participantCount = isPaid ? Math.max(0, entrants - 1) : entrants;
  const conflict = isApiError(join.error, 409) ? joinConflictCopy(join.error.message) : null;

  return (
    <section className="rounded-xl border-[1.5px] border-ink bg-card p-5 shadow-hard">
      <Stakes table={table} />
      <TimeLeft table={table} now={now} />
      <Faces faces={faces} count={participantCount} capacity={table.capacity} />
      <div className="mt-5">
        {!open ? (
          <Notice tone="neutral">{table.status === 'PENDING_APPROVAL' ? 'Waiting for Jump to approve this competition.' : table.status === 'PENDING_FUNDING' ? 'This is a funding draft. Only the host can fund it; entry opens after Paystack confirms payment.' : 'Entry is closed for this competition.'}</Notice>
        ) : full ? (
          <Notice tone="neutral">This competition is full.</Notice>
        ) : !user ? (
          <div className="space-y-2">
            <Link to="/register" search={{ redirect: `/competitions/${table.code}?join=1` }} className="btn-primary w-full">
              Sign up to join
            </Link>
            <StravaButton intent="login" redirect={`/competitions/${table.code}?join=1`} label="Join with Strava" />
            <p className="text-center text-[13px] text-ink-2">Have an account? <Link to="/login" search={{ redirect: `/competitions/${table.code}?join=1` }} className="font-bold underline">Log in</Link></p>
          </div>
        ) : isPaid && pendingEntryPayment ? (
          <Link to="/payments/return" className="btn-secondary w-full">
            Payment in progress: check status
          </Link>
        ) : isPaid ? (
          <>
            <button type="button" className="btn-primary w-full" onClick={() => checkout.mutate()} disabled={checkout.isPending}>
              {checkout.isPending ? 'Opening Paystack…' : `Pay ${formatMoney(table.entryFeeKobo)} & enter`}
            </button>
            {Number(wallet.data?.balanceKobo ?? 0) >= table.entryFeeKobo && (
              <button type="button" className="btn-secondary mt-2 w-full" onClick={() => enterWallet.mutate()} disabled={enterWallet.isPending}>
                {enterWallet.isPending ? 'Entering…' : `Use entry credit · ${formatMoney(wallet.data?.balanceKobo ?? 0)} available`}
              </button>
            )}
            <p className="mt-2 text-[12px] text-ink-3">You’ll pay securely on Paystack. Your seat is confirmed once we verify the payment.</p>
            {checkout.error && (
              <div className="mt-4">
                {isApiError(checkout.error, 503) ? (
                  <Notice tone="warn" title="Paid entry is switched off">
                    Paid competitions are temporarily unavailable. Nothing has been charged.
                  </Notice>
                ) : isApiError(checkout.error, 403) ? (
                  <Notice tone="warn" title="Paid entry unavailable">
                    {checkout.error.message}
                  </Notice>
                ) : (
                  <ErrorNotice error={checkout.error} />
                )}
              </div>
            )}
            {enterWallet.error && <div className="mt-4"><ErrorNotice error={enterWallet.error} /></div>}
          </>
        ) : (
          <>
            <button type="button" className="btn-primary w-full" onClick={() => join.mutate()} disabled={join.isPending}>
              {join.isPending ? 'Joining…' : 'Join competition'}
            </button>
            {conflict ? <Notice tone="neutral" className="mt-4">{conflict}</Notice> : <ErrorNotice error={join.error} className="mt-4" />}
          </>
        )}
      </div>
      {fundingControl}
    </section>
  );
}

/** The headline of the join box: what's at stake, GoFundMe-style. */
function Stakes({ table }: { table: CompetitionTable }) {
  const money = (kobo: number) => formatMoney(kobo).replace(/\.00$/, '');
  const prizePot = table.type === 'sponsored' ? (table.fundedPrizeKobo || table.guaranteedPrizeKobo) : table.guaranteedPrizeKobo;
  if (prizePot) {
    const winner = prizeSplit(prizePot, table.platformFeeBps, table.creatorCommissionBps).winnerKobo;
    return (
      <div>
        <p className="score num text-[44px] leading-none">{money(winner)}</p>
        <p className="mt-1.5 text-[13px] text-ink-2">
          prize {table.prizeSplitBps?.length > 1 ? `shared by the top ${table.prizeSplitBps.length}` : 'for the winner'} · {table.type === 'paid' ? `${money(table.entryFeeKobo)} to enter` : 'free to enter'}
        </p>
      </div>
    );
  }
  if (table.type === 'sponsored') return <div><p className="score text-[44px] leading-none">Funded free</p><p className="mt-1.5 text-[13px] text-ink-2">free to enter · contribute to the prize</p></div>;
  if (table.type === 'paid') {
    return (
      <div>
        <p className="score num text-[44px] leading-none">{money(table.entryFeeKobo)}</p>
        <p className="mt-1.5 text-[13px] text-ink-2">to enter · entry fees build the prize pot</p>
      </div>
    );
  }
  return (
    <div>
      <p className="score text-[44px] leading-none">Free</p>
      <p className="mt-1.5 text-[13px] text-ink-2">to join · {table.challengeType === 'CYCLING' ? 'record a GPS ride' : table.challengeType === 'DISTANCE' ? 'run, walk or ride' : 'just walk or run'}</p>
    </div>
  );
}

function TimeLeft({ table, now }: { table: CompetitionTable; now: number }) {
  const phase = competitionPhase(table, now);
  const start = new Date(table.startsAt ?? table.createdAt).getTime();
  const end = table.scoringClosesAt ? new Date(table.scoringClosesAt).getTime() : null;
  const done = end && end > start ? Math.min(1, Math.max(0, (now - start) / (end - start))) : null;
  const daysLeft = end ? Math.ceil((end - now) / 86_400_000) : null;
  const label =
    phase === 'upcoming' ? `Starts in ${formatCountdown(table.startsAt!, now)}`
      : phase === 'final' || phase === 'scoring-closed' ? 'Competition ended'
        : daysLeft !== null && daysLeft > 1 ? `${daysLeft} days left`
          : end ? `Ends in ${formatCountdown(table.scoringClosesAt!, now)}` : 'No end date';
  return (
    <div className="mt-5">
      {done !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
          <div className="h-full origin-left animate-grow-x rounded-full bg-track" style={{ width: `${Math.max(3, done * 100)}%` }} />
        </div>
      )}
      <p className="mt-2 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-bold">{label}</span>
        {end && <span className="text-ink-3">Ends {formatDate(table.scoringClosesAt)}</span>}
      </p>
    </div>
  );
}

function Faces({ faces, count, capacity }: { faces: LeaderboardRow[]; count: number; capacity: number | null }) {
  const shown = faces.slice(0, 5);
  const first = shown.map((face) => face.name.split(' ')[0]);
  const line =
    count === 0 ? 'Be the first to join'
      : count === 1 ? `${first[0] ?? 'One runner'} is in`
        : count === 2 && first.length === 2 ? `${first[0]} and ${first[1]} are in`
          : `${first[0] ?? 'Runners'}${first[1] ? `, ${first[1]}` : ''} and ${count - Math.min(2, first.length)} others are in`;
  return (
    <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
      {shown.length > 0 && (
        <span className="flex shrink-0 -space-x-2">
          {shown.map((face) => (
            <Avatar key={face.userId} name={face.name} src={face.avatarUrl} avatarStyle={face.avatarStyle} size={30} className="rounded-full ring-2 ring-card" />
          ))}
        </span>
      )}
      <p className="min-w-0 text-[13px] leading-snug">
        <span className="font-semibold">{line}</span>
        {capacity ? <span className="block text-[12px] text-ink-3">{Math.max(0, capacity - count)} of {capacity} spots left</span> : null}
      </p>
    </div>
  );
}

/** The reward preview uses the same integer rounding as settlement: leftover kobo goes to first place. */
function PrizeBreakdown({ potKobo, mode, shares }: { potKobo: number; mode: 'paid' | 'sponsored'; shares: number[] }) {
  if (potKobo < 100 || !shares.length || shares.reduce((sum, part) => sum + part, 0) !== 10000) return null;
  const split = mode === 'paid' ? prizeSplit(potKobo, 3500, 500) : prizeSplit(potKobo, 1500, 0);
  const allocations = shares.map((share) => Math.floor(split.winnerKobo * share / 10000));
  allocations[0] += split.winnerKobo - allocations.reduce((sum, amount) => sum + amount, 0);
  const rows = [
    ...allocations.map((amount, index) => ({ label: `Place ${index + 1}`, value: amount, share: `${(shares[index] / 100).toFixed(2)}%`, strong: index === 0 })),
    ...(mode === 'paid' ? [{ label: 'You earn as creator', value: split.creatorKobo, share: '5%', strong: false }] : []),
    { label: 'Jump fee', value: split.jumpKobo, share: mode === 'paid' ? '30%' : '15%', strong: false },
  ];
  return (
    <div className="rounded-md border border-line bg-paper p-4">
      <p className="eyebrow mb-2">When the competition ends</p>
      <dl className="divide-y divide-line">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 py-2 text-[14px]">
            <dt className={row.strong ? 'font-bold' : 'text-ink-2'}>
              {row.label} <span className="text-[12px] text-ink-3">{row.share}</span>
            </dt>
            <dd className={cx('num', row.strong ? 'text-[18px] font-extrabold' : 'font-semibold')}>{formatMoney(row.value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[12px] text-ink-3">{mode === 'sponsored' ? 'Entry stays free. Winners share 85% of the funded amount.' : 'The card shows the winner reward pool after fees.'}</p>
    </div>
  );
}
