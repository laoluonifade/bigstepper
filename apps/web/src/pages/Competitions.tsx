import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ChallengeMark, CompetitionCard, PhaseTag, TypeTag, canEnter, cardTheme, challengeHeadline, competitionPhase, prizeSplit } from '../components/competition';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, PlusIcon, ShareIcon } from '../components/icons';
import { Leaderboard, LeaderboardRow, RankBadge } from '../components/Leaderboard';
import {
  Avatar,
  cx,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Notice,
  PageHeader,
  SectionTitle,
  Segmented,
  Skeleton,
  SubNav,
  useNow,
} from '../components/ui';
import { DateTimePicker } from '../components/DateTimePicker';
import { api, isApiError, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { joinConflictCopy } from '../lib/copy';
import {
  formatCountdown,
  formatDate,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatMoney,
  formatNairaInput,
  fromLocalInput,
  nairaInputToKobo,
  ordinal,
  toLocalInput,
  toMetres,
} from '../lib/format';
import { rememberTable } from '../lib/local';
import { OPEN_PAYMENT_STATUSES, savePayment, useSavedPayments } from '../lib/payments';
import { keys, useCreator, useFinalResult, useStandings, useTables, useUnit, useWallet } from '../lib/queries';
import type { ChallengeType, CheckoutResponse, CompetitionTable, ScoringMethod, Unit } from '../lib/types';

export const COMPETE_NAV = [
  { to: '/competitions', label: 'Competitions' },
  { to: '/clubs', label: 'Clubs' },
] as const;

export function CompeteSubNav() {
  const { user } = useAuth();
  return <SubNav items={user ? [...COMPETE_NAV] : COMPETE_NAV.filter((item) => item.to !== '/clubs')} />;
}

type TypeFilter = 'all' | 'free' | 'sponsored' | 'paid';

function scoringLabel(table: Pick<CompetitionTable, 'scoringMethod' | 'targetDistanceMetres'>, unit: Unit) {
  switch (table.scoringMethod) {
    case 'MOST_STEPS':
      return 'Most verified steps';
    case 'FASTEST_FIXED_DISTANCE':
    case 'FASTEST_TIME':
      return table.targetDistanceMetres ? `Fastest over ${formatDistance(table.targetDistanceMetres, unit)}` : 'Fastest completion';
    default:
      return 'Farthest verified distance';
  }
}

function scoreValue(row: { creditedDistanceMetres: number; creditedSteps: number; completionTimeSeconds: number | null }, method: ScoringMethod) {
  if (method === 'MOST_STEPS') return row.creditedSteps;
  if (method === 'FASTEST_FIXED_DISTANCE' || method === 'FASTEST_TIME') return row.completionTimeSeconds;
  return row.creditedDistanceMetres;
}

function scoreText(row: { creditedDistanceMetres: number; creditedSteps: number; completionTimeSeconds: number | null }, table: CompetitionTable, unit: Unit) {
  if (table.scoringMethod === 'MOST_STEPS') return `${row.creditedSteps.toLocaleString('en-GB')} steps`;
  if (table.scoringMethod === 'FASTEST_FIXED_DISTANCE' || table.scoringMethod === 'FASTEST_TIME') {
    return row.completionTimeSeconds === null ? 'Not finished' : formatDuration(row.completionTimeSeconds);
  }
  return formatDistance(row.creditedDistanceMetres, unit);
}

export function CompetitionsPage() {
  const { user } = useAuth();
  const unit = useUnit();
  const now = useNow(60_000);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [activity, setActivity] = useState<'all' | ChallengeType>('all');
  const [sort, setSort] = useState<'popular' | 'newest'>('popular');
  const tables = useTables(sort, filter, activity);
  const mine = useQuery({
    queryKey: ['tables', 'mine'],
    queryFn: () => api<Array<{ id: string; code: string; title: string; status: string; hosting: boolean }>>('/tables/mine'),
    enabled: Boolean(user),
  });
  const [code, setCode] = useState('');
  const list = tables.data ?? [];
  const fundingDrafts = mine.data?.filter((table) => table.hosting && table.status === 'PENDING_FUNDING') ?? [];

  function openCode(event: FormEvent) {
    event.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean) void navigate({ to: '/competitions/$code', params: { code: clean } });
  }

  return (
    <div className="animate-rise">
      <CompeteSubNav />
      <PageHeader
        eyebrow="Compete"
        title="Competitions"
        description="Compete on verified distance, steps, or completion time. Every competition shows exactly how the winner is decided."
        actions={
          user && (
            <Link to="/competitions/new" className="btn-primary">
              <PlusIcon size={16} /> Create competition
            </Link>
          )
        }
      />

      {user && (fundingDrafts.length > 0 || mine.error) && <section className="mb-8">
        <SectionTitle>Drafts to fund</SectionTitle>
        <ErrorNotice error={mine.error} onRetry={() => void mine.refetch()} />
        <div className="grid gap-3 sm:grid-cols-2">
          {fundingDrafts.map((draft) => <Link key={draft.id} to="/competitions/$code" params={{ code: draft.code }} className="flex items-center justify-between gap-3 rounded-md border border-ink bg-card px-4 py-3 shadow-hard-sm hover:bg-volt/30">
            <span className="min-w-0"><span className="wide block truncate text-[14px] font-extrabold uppercase">{draft.title}</span><span className="block text-[12px] text-ink-2">Saved draft · fund it to open free entry</span></span>
            <span className="btn-secondary btn-sm shrink-0">Fund draft <ArrowRightIcon size={14} /></span>
          </Link>)}
        </div>
      </section>}

      <form onSubmit={openCode} className="mb-8 flex max-w-md items-stretch gap-2">
        <label htmlFor="invite-code" className="sr-only">
          Invite code
        </label>
        <input
          id="invite-code"
          className="field font-mono uppercase tracking-[0.18em] placeholder:normal-case placeholder:tracking-normal"
          placeholder="Got an invite code?"
          value={code}
          maxLength={16}
          onChange={(event) => setCode(event.target.value.replace(/[^a-z0-9]/gi, ''))}
        />
        <button className="btn-dark shrink-0" disabled={!code.trim()} aria-label="Open competition">
          <ArrowRightIcon size={18} />
        </button>
      </form>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented<TypeFilter>
          label="Competition type"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'free', label: 'Free' },
            { value: 'sponsored', label: 'Funded free' },
            { value: 'paid', label: 'Paid' },
          ]}
        />
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Activity">
            {(props) => <select {...props} className="field min-w-28" value={activity} onChange={(event) => setActivity(event.target.value as typeof activity)}>
              <option value="all">All activities</option><option value="WALK">Walk</option><option value="RUN">Run</option><option value="DISTANCE">Distance</option><option value="STEP">Steps</option><option value="TIMED">Timed</option>
            </select>}
          </Field>
          <Field label="Order">
            {(props) => <select {...props} className="field min-w-28" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
              <option value="popular">Most joined</option><option value="newest">Newest</option>
            </select>}
          </Field>
          {tables.data && <p className="num pb-3 text-[12px] text-ink-3">{list.length} open</p>}
        </div>
      </div>

      <ErrorNotice error={tables.error} onRetry={() => void tables.refetch()} />
      {tables.isLoading ? (
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          mark="00"
          title="No open competitions"
          action={
            user ? (
              <Link to="/competitions/new" className="btn-primary">
                <PlusIcon size={16} /> Start the first one
              </Link>
            ) : undefined
          }
        >
          Create a competition and send the invite code to your crew.
        </EmptyState>
      ) : (
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((table) => (
            <CompetitionCard key={table.id} table={table} unit={unit} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

const DURATIONS = [
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '30 days', days: 30 },
];

export function NewCompetitionPage() {
  const navigate = useNavigate();
  const { club: clubId } = useSearch({ strict: false }) as { club?: string };
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const unit = useUnit();
  const creator = useCreator();
  const club = useQuery({ queryKey: keys.club(clubId ?? ''), queryFn: () => api<{ id: string; name: string; memberCount: number }>(`/clubs/${clubId}`), enabled: Boolean(clubId) });
  const [mode, setMode] = useState<'free' | 'sponsored' | 'paid'>('free');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [challengeType, setChallengeType] = useState<ChallengeType>('RUN');
  const [scoringMethod, setScoringMethod] = useState<ScoringMethod>('FARTHEST_DISTANCE');
  const [targetDistance, setTargetDistance] = useState('');
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [scoringClosesAt, setScoringClosesAt] = useState(() => toLocalInput(new Date(Date.now() + 7 * 86_400_000)));
  const [remindDaily, setRemindDaily] = useState(false);
  const [reminderTime, setReminderTime] = useState('08:00');
  const reminderTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [capacity, setCapacity] = useState('');
  const [cap, setCap] = useState('');
  const [duration, setDuration] = useState<number | null>(7);
  const [entryFee, setEntryFee] = useState('');
  const [fundingOption, setFundingOption] = useState<'MULTI_WINNERS' | 'FIXED_WINNERS' | 'FIXED_CHARITY'>('MULTI_WINNERS');
  const [fixedPrize, setFixedPrize] = useState('');
  const [charityName, setCharityName] = useState('');
  const [winnerCount, setWinnerCount] = useState('1');
  const [shares, setShares] = useState(['100']);
  const [inviteClubMembers, setInviteClubMembers] = useState(Boolean(clubId));
  const [emailText, setEmailText] = useState('');
  const [phoneText, setPhoneText] = useState('');

  const startIso = fromLocalInput(startsAt);
  const scoringIso = fromLocalInput(scoringClosesAt);
  const capMetres = cap ? toMetres(Number(cap), unit) : undefined;
  const capacityNumber = capacity ? Number(capacity) : undefined;
  const targetDistanceMetres = targetDistance ? toMetres(Number(targetDistance), unit) : undefined;
  const entryFeeKobo = nairaInputToKobo(entryFee);
  const fundingStyle = fundingOption === 'MULTI_WINNERS' ? 'OPEN' : 'FIXED';
  const fundingDestination = fundingOption === 'FIXED_CHARITY' ? 'CHARITY' : 'WINNERS';
  const draftOnCreate = mode === 'paid' || (mode === 'sponsored' && fundingStyle === 'FIXED');
  const guaranteedPrizeKobo = mode === 'paid' ? (capacityNumber ?? 0) * entryFeeKobo : mode === 'sponsored' && fundingStyle === 'FIXED' ? nairaInputToKobo(fixedPrize) : 0;
  const needsTarget = scoringMethod === 'FASTEST_FIXED_DISTANCE' || scoringMethod === 'FASTEST_TIME';
  const inviteEmails = emailText.split(/[\s,;]+/).map((value) => value.trim().toLowerCase()).filter(Boolean);
  const invitePhones = phoneText.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
  const isCharity = mode === 'sponsored' && fundingDestination === 'CHARITY';
  const prizeSplitBps = isCharity ? [10000] : shares.map((value) => Math.round(Number(value) * 100));
  const hasPrize = mode !== 'free';
  const prizeError = hasPrize && !isCharity && (!Number.isInteger(Number(winnerCount)) || Number(winnerCount) < 1 || Number(winnerCount) > 100 ||
    shares.length !== Number(winnerCount) || prizeSplitBps.some((part) => !Number.isInteger(part) || part < 1) ||
    prizeSplitBps.reduce((sum, part) => sum + part, 0) !== 10000 || (capacityNumber !== undefined && Number(winnerCount) > capacityNumber));

  const errors = {
    title: title.trim().length > 0 && title.trim().length < 3 ? 'At least 3 characters.' : undefined,
    scoring: startIso && scoringIso && new Date(scoringIso) <= new Date(startIso) ? 'Must be after the start.' : undefined,
    capacity: capacityNumber === undefined || capacityNumber < 2 || capacityNumber > 10000 || !Number.isInteger(capacityNumber) ? 'Enter a maximum between 2 and 10,000 runners.' : undefined,
    cap: capMetres !== undefined && (capMetres < 1000 || capMetres > 500000) ? `Between ${formatDistance(1000, unit)} and ${formatDistance(500000, unit)}.` : undefined,
    target: needsTarget && (!targetDistanceMetres || targetDistanceMetres < 100 || targetDistanceMetres > 500000) ? `Enter a target between ${formatDistance(100, unit)} and ${formatDistance(500000, unit)}.` : undefined,
    paid: mode === 'paid' && (creator.data?.status !== 'ACTIVE' || entryFeeKobo < 100 || guaranteedPrizeKobo < 100 || guaranteedPrizeKobo > 1_000_000_000 || !Number.isSafeInteger(guaranteedPrizeKobo)) ? 'Use an active creator account, an entry fee of at least ₦1, and a full-capacity pot no greater than ₦10,000,000.' : undefined,
    funding: mode === 'sponsored' && fundingStyle === 'FIXED' && (!Number.isSafeInteger(guaranteedPrizeKobo) || guaranteedPrizeKobo < 1_000_000 || guaranteedPrizeKobo > 1_000_000_000) ? 'Enter a fixed contribution from ₦10,000 to ₦10,000,000.' : mode === 'sponsored' && fundingDestination === 'CHARITY' && (fundingStyle !== 'FIXED' || charityName.trim().length < 2) ? 'Charity funding needs a fixed amount and charity name.' : undefined,
    prize: prizeError || (mode === 'paid' && guaranteedPrizeKobo < 100) ? 'Choose prize shares that total 100% and fit the maximum runner count.' : undefined,
    invites: !draftOnCreate && (inviteEmails.length > 50 || invitePhones.length > 50 || inviteEmails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || invitePhones.some((phone) => !/^\+[1-9]\d{7,14}$/.test(phone))) ? 'Use valid emails and international phone numbers, up to 50 of each.' : undefined,
    club: clubId && !club.data ? 'This club could not be loaded.' : undefined,
  };
  const invalid = Object.values(errors).some(Boolean) || title.trim().length < 3;

  const create = useMutation({
    mutationFn: () =>
      post<CompetitionTable>(mode === 'paid' ? '/tables/paid-drafts' : '/tables', {
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        challengeType,
        scoringMethod,
        ...(targetDistanceMetres ? { targetDistanceMetres } : {}),
        ...(startIso ? { startsAt: startIso } : {}),
        ...(scoringIso ? { scoringClosesAt: scoringIso } : {}),
        ...(remindDaily ? { reminderTime, reminderTimeZone } : {}),
        capacity: capacityNumber,
        ...(mode !== 'paid' && capMetres ? { distanceCapMetres: capMetres } : {}),
        ...(hasPrize ? { prizeSplitBps } : {}),
        ...(mode === 'sponsored' ? { fundedFree: true, ...(fundingStyle === 'FIXED' ? { guaranteedPrizeKobo } : {}), fundingDestination, ...(fundingDestination === 'CHARITY' ? { charityName: charityName.trim() } : {}) } : {}),
        ...(mode === 'paid' ? { entryFeeKobo } : {}),
        ...(club.data ? { communityId: club.data.id, ...(!draftOnCreate && inviteClubMembers ? { inviteClubMembers: true } : {}) } : {}),
        ...(!draftOnCreate && inviteEmails.length ? { inviteEmails } : {}),
        ...(!draftOnCreate && invitePhones.length ? { invitePhones } : {}),
      }),
    async onSuccess(table) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.tables }),
        queryClient.invalidateQueries({ queryKey: ['tables', 'mine'] }),
      ]);
      void navigate({ to: '/competitions/$code', params: { code: table.code }, search: { created: true } });
    },
  });

  function pickDuration(days: number) {
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
    scoringMethod,
    targetDistanceMetres: targetDistanceMetres ?? null,
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
            if (!invalid) create.mutate();
          }}
        >
          <Segmented<'free' | 'sponsored' | 'paid'>
            label="Competition type"
            value={mode}
            onChange={setMode}
            options={[{ value: 'free', label: 'Free' }, { value: 'sponsored', label: 'Free · funded prize' }, { value: 'paid', label: 'Paid · creator' }]}
          />
          {club.data && <Notice tone="neutral" title={`Hosting for ${club.data.name}`}>This competition will be linked to your club. You can invite all {club.data.memberCount} members below.</Notice>}
          {mode === 'paid' && !creator.data && (
            <Notice tone="warn" title="Creator account required" action={<Link to="/creator" className="btn-quiet btn-sm">Become a creator</Link>}>
              Paid competitions earn creators 5% and must be reviewed before opening.
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

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Activity">
              {(props) => (
                <select
                  {...props}
                  className="field"
                  value={challengeType}
                  onChange={(event) => {
                    const next = event.target.value as ChallengeType;
                    setChallengeType(next);
                    setScoringMethod(next === 'WALK' || next === 'STEP' ? 'MOST_STEPS' : next === 'TIMED' ? 'FASTEST_TIME' : 'FARTHEST_DISTANCE');
                  }}
                >
                  <option value="WALK">Walk</option>
                  <option value="RUN">Run</option>
                  <option value="DISTANCE">Distance · walk or run</option>
                  <option value="STEP">Steps</option>
                  <option value="TIMED">Timed activity</option>
                </select>
              )}
            </Field>
            <Field label="Winner is">
              {(props) => (
                <select {...props} className="field" value={scoringMethod} onChange={(event) => setScoringMethod(event.target.value as ScoringMethod)}>
                  {(challengeType === 'WALK' || challengeType === 'STEP') && <option value="MOST_STEPS">Most verified steps</option>}
                  {(challengeType === 'RUN' || challengeType === 'DISTANCE') && <option value="FARTHEST_DISTANCE">Farthest distance</option>}
                  {challengeType === 'RUN' && <option value="FASTEST_FIXED_DISTANCE">Fastest fixed distance</option>}
                  {challengeType === 'TIMED' && <option value="FASTEST_TIME">Fastest completion</option>}
                </select>
              )}
            </Field>
          </div>
          {needsTarget && (
            <Field label={`Target distance (${unit})`} error={errors.target} hint="The distance every participant must complete.">
              {(props) => <input {...props} className="field num" type="number" min="0.1" step="0.1" value={targetDistance} onChange={(event) => setTargetDistance(event.target.value)} required />}
            </Field>
          )}

          <fieldset>
            <legend className="label">Length</legend>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  onClick={() => pickDuration(option.days)}
                  className={cx('btn btn-sm border-[1.5px] border-ink', duration === option.days ? 'bg-ink text-paper' : 'bg-card hover:bg-white')}
                  aria-pressed={duration === option.days}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Starts">
              {(props) => (
                <DateTimePicker
                  {...props}
                  value={startsAt}
                  min={toLocalInput(new Date())}
                  onChange={(next) => {
                    setStartsAt(next);
                    setDuration(null);
                  }}
                />
              )}
            </Field>
            <Field label="Ends" error={errors.scoring} hint="Runners can join and log activities until this.">
              {(props) => (
                <DateTimePicker
                  {...props}
                  value={scoringClosesAt}
                  min={startsAt || undefined}
                  onChange={(next) => {
                    setScoringClosesAt(next);
                    setDuration(null);
                  }}
                />
              )}
            </Field>
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
            <Field label="Max runners" error={errors.capacity} hint="Required for every competition. Choose 2 to 10,000.">
              {(props) => (
                <input {...props} type="number" inputMode="numeric" min={2} max={10000} required className="field num" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
              )}
            </Field>
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
          {errors.paid && mode === 'paid' && <Notice tone="warn">{errors.paid}</Notice>}
          {errors.funding && mode === 'sponsored' && <Notice tone="warn">{errors.funding}</Notice>}
          {errors.prize && hasPrize && <Notice tone="warn">{errors.prize}</Notice>}

          {!draftOnCreate ? <section className="panel space-y-4 p-5">
            <SectionTitle>Invite runners</SectionTitle>
            {club.data && <label className="flex items-center gap-2 text-[14px] font-semibold"><input type="checkbox" checked={inviteClubMembers} onChange={(event) => setInviteClubMembers(event.target.checked)} /> Invite everyone in {club.data.name}</label>}
            <Field label="Email addresses" optional hint="Separate multiple addresses with commas or new lines. Email invitations are sent when a mail provider is configured.">
              {(props) => <textarea {...props} className="field min-h-20" value={emailText} onChange={(event) => setEmailText(event.target.value)} placeholder="runner@example.com" />}
            </Field>
            <Field label="Phone numbers" optional hint="Include country code, for example +2348012345678. Text links are prepared after creation.">
              {(props) => <textarea {...props} className="field min-h-20" value={phoneText} onChange={(event) => setPhoneText(event.target.value)} placeholder="+2348012345678" />}
            </Field>
            {errors.invites && <Notice tone="warn">{errors.invites}</Notice>}
          </section> : <Notice tone="neutral" title="Invite after launch">Save this draft first. You can invite runners after funding or approval opens entry.</Notice>}

          <ErrorNotice error={create.error} />
          <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
            <button className="btn-primary min-h-12 px-6" disabled={create.isPending || invalid}>
              {create.isPending ? 'Saving…' : mode === 'paid' ? 'Submit paid draft' : mode === 'sponsored' && fundingStyle === 'FIXED' ? 'Save funding draft' : 'Create competition'}
            </button>
            <p className="text-[12px] text-ink-3">{mode === 'paid' ? 'Paid competitions are reviewed by Jump staff.' : mode === 'sponsored' && fundingStyle === 'FIXED' ? 'Saved to your account. Only you can fund it; entry opens after Paystack confirms payment.' : 'Free-entry competitions open immediately.'}</p>
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
    const method = table.data?.scoringMethod ?? 'FARTHEST_DISTANCE';
    if (result.data) {
      return result.data.standings.map((row) => ({
        rank: row.rank,
        userId: row.userId,
        name: live.get(row.userId)?.displayName ?? (row.userId === user?.id ? user.displayName ?? 'You' : 'Runner'),
        avatarUrl: live.get(row.userId)?.avatarUrl,
        username: live.get(row.userId)?.username,
        metres: row.creditedDistanceMetres,
        score: scoreValue(row, method),
        host: row.userId === table.data?.creatorId,
      }));
    }
    return (standings.data ?? []).map((row) => ({
      rank: row.rank,
      userId: row.userId,
      name: row.displayName,
      avatarUrl: row.avatarUrl,
      username: row.username,
      metres: row.creditedDistanceMetres,
      score: scoreValue(row, method),
      host: row.userId === table.data?.creatorId,
    }));
  }, [result.data, standings.data, table.data?.creatorId, table.data?.scoringMethod, user]);

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
  const hostName = t.creator?.displayName ?? 'A Jump runner';
  const entrants = Math.max(standings.data?.length ?? 0, t.entrantCount ?? 0);

  return (
    <div className="animate-rise">
      <Link to="/competitions" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink">
        <ArrowLeftIcon size={16} /> Competitions
      </Link>

      {search.created && (
        <Notice tone="ok" className="mb-6" title="Competition created">
          {t.status === 'PENDING_APPROVAL' ? 'Your draft is waiting for Jump approval. ' : t.status === 'PENDING_FUNDING' ? 'Fund the prize to open entry. ' : 'Your competition is open. '}
          {t.status === 'PENDING_FUNDING' ? 'This draft is saved to your account. You can leave and return to fund it.' : 'Share the link so friends can join.'}
        </Notice>
      )}

      {isHost && t.status === 'PENDING_FUNDING' && !search.created && <Notice tone="warn" className="mb-6" title="Funding draft">
        This competition is saved but not live. Only you can fund the fixed amount; entry opens after Jump verifies the Paystack payment.
      </Notice>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-10">
        {/* Cover, title, host and the leaderboard */}
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <ChallengeCover table={t} unit={unit} now={now} />
          <h1 className="display mt-5 break-words text-[34px] leading-[0.95] sm:text-[44px]">{t.title}</h1>
          <div className="mt-4 flex items-center gap-3">
            <Avatar name={hostName} src={t.creator?.avatarUrl} size={40} className="rounded-full" />
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
        </div>

        {/* The join box: sticky beside the story on desktop, straight after the intro on phones */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <EntryPanel table={t} joined={registration.data?.joined} joinedRank={me?.rank} joinedScore={me ? scoreText(me, t, unit) : undefined} entrants={entrants} faces={rows} now={now} />
          {t.status === 'OPEN_FOR_ENTRY' && <ShareBox table={t} url={shareUrl} />}
        </aside>

        <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-2">
          <section>
            <SectionTitle aside={isFinal ? <span className="tag border-ink bg-volt">Final</span> : <span className="tag border-line bg-card text-ink-2">{t.status === 'PENDING_FUNDING' ? 'Draft' : 'Live'}</span>}>
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
                metricLabel={t.scoringMethod === 'MOST_STEPS' ? 'Steps' : t.scoringMethod === 'FARTHEST_DISTANCE' ? 'Distance' : 'Time'}
                formatScore={t.scoringMethod === 'FARTHEST_DISTANCE' ? undefined : (row) => (
                  <span className="score num text-[20px]">
                    {t.scoringMethod === 'MOST_STEPS' ? Number(row.score ?? 0).toLocaleString('en-GB') : row.score === null ? '-' : formatDuration(Number(row.score))}
                  </span>
                )}
                empty={<EmptyState title="Nobody’s on the board yet">Join now and your first verified walk or run puts you on top.</EmptyState>}
              />
            )}
            {rows.length > 10 && (
              <button type="button" className="btn-quiet mt-3 w-full" onClick={() => setShowAll((value) => !value)}>
                {showAll ? 'Show top 10' : `See all ${rows.length} runners`}
              </button>
            )}
          </section>
          {!me && !isHost && <HowItWorks table={t} unit={unit} />}


          <KeyDates table={t} now={now} />
          <Rules table={t} unit={unit} />
          {isHost && t.status === 'OPEN_FOR_ENTRY' && <InvitationsPanel table={t} />}
        </div>
      </div>
    </div>
  );
}

/** The poster at the top of an invite: the challenge's colour, its one big number and its mark. */
function ChallengeCover({ table, unit, now }: { table: CompetitionTable; unit: Unit; now: number }) {
  const theme = cardTheme(table);
  const hero = challengeHeadline(table, unit);
  return (
    <div className={cx('relative overflow-hidden rounded-xl border-[1.5px] border-ink px-5 pb-6 pt-4 sm:px-7 sm:pb-8', theme.band)}>
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.13]" preserveAspectRatio="none" viewBox="0 0 400 200" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((lane) => (
          <path key={lane} d={`M-20 ${200 - lane * 26}C120 ${180 - lane * 30} 240 ${120 - lane * 22} 420 ${60 - lane * 18}`} fill="none" stroke="currentColor" strokeWidth="3" />
        ))}
      </svg>
      <div className="relative flex flex-wrap items-center gap-1.5">
        <TypeTag table={table} />
        <span className="tag bg-paper text-ink">{table.challengeType === 'STEP' ? 'STEPS' : table.challengeType}</span>
        <PhaseTag table={table} now={now} />
      </div>
      <div className="relative mt-10 flex items-end justify-between gap-4 sm:mt-14">
        <div className="min-w-0">
          <p className="score whitespace-nowrap text-[clamp(44px,13vw,88px)] uppercase leading-[0.85]">{hero.big}</p>
          <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.14em] opacity-75">{hero.small}</p>
        </div>
        <ChallengeMark type={table.challengeType} code={table.code} size={64} />
      </div>
    </div>
  );
}

/** For people arriving from an invite who have never heard of a Jump challenge. */
function HowItWorks({ table, unit }: { table: CompetitionTable; unit: Unit }) {
  const counts = table.challengeType === 'RUN' ? 'run' : table.challengeType === 'WALK' ? 'walk' : 'walk and run';
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
      title: `${counts === 'walk and run' ? 'Walk or run' : counts === 'run' ? 'Run' : 'Walk'} with Jump`,
      body: `Hit Run in the app whenever you head out. Every verified ${counts} after you join adds to your total.`,
    },
    {
      title: 'Climb the board',
      body: `${scoringLabel(table, unit)}.${ends ? ` It ends ${ends}.` : ''} ${prize}`,
    },
  ];
  return (
    <section>
      <SectionTitle>How it works</SectionTitle>
      <p className="mb-5 max-w-xl text-[15px] leading-relaxed text-ink-2">
        A Jump competition brings your people together. Everyone records their walks and runs with Jump, GPS and steps are checked, and the leaderboard updates live. It’s the easiest way to stay consistent with your people.
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

function ShareBox({ table, url }: { table: CompetitionTable; url: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Join my Jump competition "${table.title}": ${url}`;
  async function share() {
    if (navigator.share) {
      await navigator.share({ title: table.title, text }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <p className="text-[14px] font-bold">Competitions are better with friends</p>
      <p className="mt-0.5 text-[13px] text-ink-2">Send the link. They can join straight from it.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={() => void share()}>
          <ShareIcon size={14} /> {copied ? 'Link copied' : 'Invite friends'}
        </button>
        <a className="btn-secondary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer noopener">
          WhatsApp
        </a>
      </div>
      <p className="mt-3 flex items-center justify-between text-[12px] text-ink-3">
        <span>Invite code</span>
        <span className="font-mono font-semibold tracking-[0.16em] text-ink">{table.code}</span>
      </p>
    </section>
  );
}

function Rules({ table, unit }: { table: CompetitionTable; unit: Unit }) {
  const activity = table.challengeType === 'DISTANCE' || table.challengeType === 'STEP' || table.challengeType === 'TIMED'
    ? 'Eligible walks and runs count.'
    : `Only verified ${table.challengeType.toLowerCase()} activities count.`;
  const scoring = table.scoringMethod === 'MOST_STEPS'
    ? 'The highest total verified step count wins.'
    : table.scoringMethod === 'FARTHEST_DISTANCE'
      ? 'The highest total verified distance wins.'
      : `The fastest valid completion${table.targetDistanceMetres ? ` of ${formatDistance(table.targetDistanceMetres, unit)}` : ''} wins.`;
  const items = [
    scoring,
    `${activity} Flagged activities count only after a reviewer approves them.`,
    'An activity counts if it starts after you join and finishes before scoring closes.',
    ...(table.reminderTime ? [`Joined runners may receive a daily email reminder at ${table.reminderTime.slice(0, 5)} (${table.reminderTimeZone}). No reminder is sent after they record an activity that day.`] : []),
    ...(table.scoringMethod === 'FARTHEST_DISTANCE'
      ? [table.distanceCapMetres ? `Each activity counts up to ${formatDistance(table.distanceCapMetres, unit)}.` : 'No per-activity distance cap.']
      : []),
    'Ties go to whoever joined first.',
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
          <Link to="/login" search={{ redirect: `/competitions/${table.code}` }} className="btn-primary w-full">
            Log in to join
          </Link>
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
                {enterWallet.isPending ? 'Entering…' : `Use wallet · ${formatMoney(wallet.data?.balanceKobo ?? 0)} available`}
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
      <p className="mt-1.5 text-[13px] text-ink-2">to join · just walk or run</p>
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
            <Avatar key={face.userId} name={face.name} src={face.avatarUrl} size={30} className="rounded-full ring-2 ring-card" />
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
