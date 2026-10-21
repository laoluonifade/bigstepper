import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CompetitionCard, PhaseTag, Timeline, TypeTag, canEnter, competitionPhase, phaseLine, prizeSplit } from '../components/competition';
import { ArrowRightIcon, CheckIcon, PlusIcon, ShareIcon } from '../components/icons';
import { Leaderboard, LeaderboardRow, RankBadge } from '../components/Leaderboard';
import {
  CopyButton,
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
  formatDate,
  formatDistance,
  formatDuration,
  formatMoney,
  fromLocalInput,
  ordinal,
  toLocalInput,
  toMetres,
} from '../lib/format';
import { rememberTable } from '../lib/local';
import { OPEN_PAYMENT_STATUSES, savePayment, useSavedPayments } from '../lib/payments';
import { keys, useCreator, useFinalResult, useStandings, useTables, useUnit, useWallet } from '../lib/queries';
import type { ChallengeType, CheckoutResponse, CompetitionTable, ScoringMethod, Unit } from '../lib/types';

export const COMPETE_NAV = [
  { to: '/competitions', label: 'Challenges' },
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
  const tables = useTables();
  const unit = useUnit();
  const now = useNow(60_000);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [code, setCode] = useState('');
  const list = (tables.data ?? []).filter((table) => filter === 'all' || table.type === filter);
  const hasPaid = tables.data?.some((table) => table.type === 'paid');

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
        title="Challenges"
        description="Compete on verified distance, steps, or completion time. Every challenge shows exactly how the winner is decided."
        actions={
          user && (
            <Link to="/competitions/new" className="btn-primary">
              <PlusIcon size={16} /> Create challenge
            </Link>
          )
        }
      />

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
        <button className="btn-dark shrink-0" disabled={!code.trim()} aria-label="Open challenge">
          <ArrowRightIcon size={18} />
        </button>
      </form>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {hasPaid ? (
          <Segmented<TypeFilter>
            label="Challenge type"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'free', label: 'Free' },
              { value: 'sponsored', label: 'Funded free' },
              { value: 'paid', label: 'Paid' },
            ]}
          />
        ) : (
          <span />
        )}
        {tables.data && <p className="num text-[12px] text-ink-3">{list.length} open</p>}
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
          title="No open challenges"
          action={
            user ? (
              <Link to="/competitions/new" className="btn-primary">
                <PlusIcon size={16} /> Start the first one
              </Link>
            ) : undefined
          }
        >
          Create a challenge and send the invite code to your crew.
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
  const [challengeType, setChallengeType] = useState<ChallengeType>('RUN');
  const [scoringMethod, setScoringMethod] = useState<ScoringMethod>('FARTHEST_DISTANCE');
  const [targetDistance, setTargetDistance] = useState('');
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [scoringClosesAt, setScoringClosesAt] = useState(() => toLocalInput(new Date(Date.now() + 7 * 86_400_000)));
  const [capacity, setCapacity] = useState('');
  const [cap, setCap] = useState('');
  const [duration, setDuration] = useState<number | null>(7);
  const [entryFee, setEntryFee] = useState('');
  // ₦10,000 is the suggested starting prize pot; creators can change it.
  const [guaranteedPrize, setGuaranteedPrize] = useState('10000');
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
  const entryFeeKobo = Math.round(Number(entryFee || 0) * 100);
  const guaranteedPrizeKobo = mode === 'paid'
    ? (capacityNumber ?? 0) * entryFeeKobo
    : Math.round(Number(guaranteedPrize || 0) * 100);
  const needsTarget = scoringMethod === 'FASTEST_FIXED_DISTANCE' || scoringMethod === 'FASTEST_TIME';
  const inviteEmails = emailText.split(/[\s,;]+/).map((value) => value.trim().toLowerCase()).filter(Boolean);
  const invitePhones = phoneText.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
  const prizeSplitBps = shares.map((value) => Math.round(Number(value) * 100));
  const hasPrize = mode !== 'free';
  const prizeError = hasPrize && (!Number.isInteger(Number(winnerCount)) || Number(winnerCount) < 1 || Number(winnerCount) > 100 ||
    shares.length !== Number(winnerCount) || prizeSplitBps.some((part) => !Number.isInteger(part) || part < 1) ||
    prizeSplitBps.reduce((sum, part) => sum + part, 0) !== 10000 || (capacityNumber !== undefined && Number(winnerCount) > capacityNumber));

  const errors = {
    title: title.trim().length > 0 && title.trim().length < 3 ? 'At least 3 characters.' : undefined,
    scoring: startIso && scoringIso && new Date(scoringIso) <= new Date(startIso) ? 'Must be after the start.' : undefined,
    capacity: capacityNumber === undefined || capacityNumber < 2 || capacityNumber > 10000 || !Number.isInteger(capacityNumber) ? 'Enter a maximum between 2 and 10,000 runners.' : undefined,
    cap: capMetres !== undefined && (capMetres < 1000 || capMetres > 500000) ? `Between ${formatDistance(1000, unit)} and ${formatDistance(500000, unit)}.` : undefined,
    target: needsTarget && (!targetDistanceMetres || targetDistanceMetres < 100 || targetDistanceMetres > 500000) ? `Enter a target between ${formatDistance(100, unit)} and ${formatDistance(500000, unit)}.` : undefined,
    paid: mode === 'paid' && (creator.data?.status !== 'ACTIVE' || entryFeeKobo < 100 || guaranteedPrizeKobo < 100 || guaranteedPrizeKobo > 1_000_000_000 || !Number.isSafeInteger(guaranteedPrizeKobo)) ? 'Use an active creator account, an entry fee of at least ₦1, and a full-capacity pot no greater than ₦10,000,000.' : undefined,
    prize: prizeError || (hasPrize && guaranteedPrizeKobo < 100) ? (mode === 'paid' ? 'Choose prize shares that total 100% and fit the maximum runner count.' : 'Set a prize of at least ₦1 and shares that total 100%.') : undefined,
    invites: inviteEmails.length > 50 || invitePhones.length > 50 || inviteEmails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || invitePhones.some((phone) => !/^\+[1-9]\d{7,14}$/.test(phone)) ? 'Use valid emails and international phone numbers, up to 50 of each.' : undefined,
    club: clubId && !club.data ? 'This club could not be loaded.' : undefined,
  };
  const invalid = Object.values(errors).some(Boolean) || title.trim().length < 3;

  const create = useMutation({
    mutationFn: () =>
      post<CompetitionTable>(mode === 'paid' ? '/tables/paid-drafts' : '/tables', {
        title: title.trim(),
        challengeType,
        scoringMethod,
        ...(targetDistanceMetres ? { targetDistanceMetres } : {}),
        ...(startIso ? { startsAt: startIso } : {}),
        ...(scoringIso ? { scoringClosesAt: scoringIso } : {}),
        capacity: capacityNumber,
        ...(mode !== 'paid' && capMetres ? { distanceCapMetres: capMetres } : {}),
        ...(hasPrize ? { prizeSplitBps } : {}),
        ...(mode === 'sponsored' ? { guaranteedPrizeKobo } : {}),
        ...(mode === 'paid' ? { entryFeeKobo } : {}),
        ...(club.data ? { communityId: club.data.id, ...(inviteClubMembers ? { inviteClubMembers: true } : {}) } : {}),
        ...(inviteEmails.length ? { inviteEmails } : {}),
        ...(invitePhones.length ? { invitePhones } : {}),
      }),
    async onSuccess(table) {
      await queryClient.invalidateQueries({ queryKey: keys.tables });
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
    title: title.trim() || 'Your challenge name',
    code: '- - - -',
    type: mode,
    status: mode === 'paid' ? 'PENDING_APPROVAL' : mode === 'sponsored' ? 'PENDING_FUNDING' : 'OPEN_FOR_ENTRY',
    entryFeeKobo: mode === 'paid' ? entryFeeKobo : 0,
    guaranteedPrizeKobo: hasPrize && guaranteedPrizeKobo ? guaranteedPrizeKobo : null,
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
    communityId: club.data?.id ?? null,
    platformFeeBps: mode === 'paid' ? 3500 : mode === 'sponsored' ? 1500 : 3000,
    creatorCommissionBps: mode === 'paid' ? 500 : 0,
    creatorId: user?.id ?? '',
    creator: { id: user?.id ?? '', displayName: user?.displayName ?? null },
    createdAt: new Date().toISOString(),
  };

  return (
    <div className="animate-rise">
      <PageHeader back={{ to: '/competitions', label: 'Challenges' }} eyebrow="New challenge" title="Set up a challenge" description="Choose the activity and exact scoring method before you publish." />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!invalid) create.mutate();
          }}
        >
          <Segmented<'free' | 'sponsored' | 'paid'>
            label="Challenge type"
            value={mode}
            onChange={setMode}
            options={[{ value: 'free', label: 'Free' }, { value: 'sponsored', label: 'Free · funded prize' }, { value: 'paid', label: 'Paid · creator' }]}
          />
          {club.data && <Notice tone="neutral" title={`Hosting for ${club.data.name}`}>This challenge will be linked to your club. You can invite all {club.data.memberCount} members below.</Notice>}
          {mode === 'paid' && !creator.data && (
            <Notice tone="warn" title="Creator account required" action={<Link to="/creator" className="btn-quiet btn-sm">Become a creator</Link>}>
              Paid challenges earn creators 5% and must be reviewed before opening.
            </Notice>
          )}
          {mode === 'paid' && creator.data && creator.data.status !== 'ACTIVE' && (
            <Notice tone="warn" title={creator.data.status === 'PENDING' ? 'Your creator account is awaiting approval' : 'Your creator account is suspended'}>
              {creator.data.status === 'PENDING'
                ? 'You can host paid challenges once Jump approves you. You’ll get a notification.'
                : 'You can’t host paid challenges right now. Contact Jump support.'}
            </Notice>
          )}
          <Field label="Challenge name" error={errors.title}>
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

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Max runners" error={errors.capacity} hint="Required for every challenge. Choose 2 to 10,000.">
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
              <SectionTitle>{mode === 'paid' ? 'Paid challenge' : 'Funded free challenge'}</SectionTitle>
              <div className="grid gap-5 sm:grid-cols-2">
                {mode === 'paid' && <Field label="Entry fee · NGN">{(props) => <input {...props} className="field num" type="number" min="1" step="1" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} required />}</Field>}
                {mode === 'sponsored' && <Field label="Prize funding · NGN" hint="Anyone can pay this amount to fund the free challenge.">
                  {(props) => <input {...props} className="field num" type="number" min="1" step="1" value={guaranteedPrize} onChange={(event) => setGuaranteedPrize(event.target.value)} required />}
                </Field>}
              </div>
              {mode === 'paid' && <p className="text-[14px] leading-relaxed">Full-capacity prize pot: <span className="num font-bold">{formatMoney(guaranteedPrizeKobo)}</span> <span className="text-ink-2">({capacityNumber || 0} runners × {formatMoney(entryFeeKobo)} entry)</span></p>}
              <Field label="Number of prize places" hint="Choose one winner, top three, or any number up to 100.">
                {(props) => <input {...props} className="field num" type="number" min="1" max="100" value={winnerCount} onChange={(event) => {
                  const next = event.target.value;
                  setWinnerCount(next);
                  const count = Number(next);
                  if (Number.isInteger(count) && count >= 1 && count <= 100) {
                    if (count === 3) setShares(['50', '30', '20']);
                    else { const equal = Math.floor(10000 / count); setShares(Array.from({ length: count }, (_, index) => ((equal + (index === 0 ? 10000 - equal * count : 0)) / 100).toFixed(2))); }
                  }
                }} required />}
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                {shares.map((share, index) => <Field key={index} label={`Place ${index + 1} · %`}>
                  {(props) => <input {...props} className="field num" type="number" min="0.01" max="100" step="0.01" value={share} onChange={(event) => setShares((current) => current.map((part, partIndex) => partIndex === index ? event.target.value : part))} required />}
                </Field>)}
              </div>
              <PrizeBreakdown potKobo={guaranteedPrizeKobo} mode={mode} shares={prizeSplitBps} />
              <p className="text-[12px] leading-relaxed text-ink-3">{mode === 'paid'
                ? 'This is a fixed guaranteed pot based on a full challenge, even if fewer runners join. Jump must confirm that the full prize is funded before opening paid entry.'
                : 'Joining stays free. Anyone can fund the prize through Paystack after creation. Entry opens when payment is verified. Winners share 85% of the deposit; Jump retains 15%.'}</p>
            </div>
          )}
          {errors.paid && mode === 'paid' && <Notice tone="warn">{errors.paid}</Notice>}
          {errors.prize && hasPrize && <Notice tone="warn">{errors.prize}</Notice>}

          <section className="panel space-y-4 p-5">
            <SectionTitle>Invite runners</SectionTitle>
            {club.data && <label className="flex items-center gap-2 text-[14px] font-semibold"><input type="checkbox" checked={inviteClubMembers} onChange={(event) => setInviteClubMembers(event.target.checked)} /> Invite everyone in {club.data.name}</label>}
            <Field label="Email addresses" optional hint="Separate multiple addresses with commas or new lines. Email invitations are sent when a mail provider is configured.">
              {(props) => <textarea {...props} className="field min-h-20" value={emailText} onChange={(event) => setEmailText(event.target.value)} placeholder="runner@example.com" />}
            </Field>
            <Field label="Phone numbers" optional hint="Include country code, for example +2348012345678. Text links are prepared after creation.">
              {(props) => <textarea {...props} className="field min-h-20" value={phoneText} onChange={(event) => setPhoneText(event.target.value)} placeholder="+2348012345678" />}
            </Field>
            {errors.invites && <Notice tone="warn">{errors.invites}</Notice>}
          </section>

          <ErrorNotice error={create.error} />
          <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
            <button className="btn-primary min-h-12 px-6" disabled={create.isPending || invalid}>
              {create.isPending ? 'Creating…' : mode === 'paid' ? 'Submit paid draft' : 'Create challenge'}
            </button>
            <p className="text-[12px] text-ink-3">{mode === 'paid' ? 'Paid challenges are reviewed by Jump staff.' : mode === 'sponsored' ? 'The prize must be funded before entry opens.' : 'Free challenges open immediately.'}</p>
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

  const me = standings.data?.find((row) => row.userId === user?.id);

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
        <PageHeader back={{ to: '/competitions', label: 'Challenges' }} title="Challenge not found" />
        {isApiError(table.error, 404) ? (
          <EmptyState title={`No challenge with code ${code.toUpperCase()}`}>Check the invite code and try again. Codes are 8 letters and numbers.</EmptyState>
        ) : (
          <ErrorNotice error={table.error} onRetry={() => void table.refetch()} />
        )}
      </>
    );
  }

  const t = table.data;
  const isFinal = Boolean(result.data);
  const shareUrl = `${window.location.origin}/competitions/${t.code}`;

  return (
    <div className="animate-rise">
      <PageHeader back={{ to: '/competitions', label: 'Challenges' }} title={t.title} eyebrow={<span className="flex flex-wrap gap-2"><TypeTag table={t} /><PhaseTag table={t} now={now} /></span>} description={t.creator?.displayName ? `Hosted by ${t.creator.displayName}` : undefined} />

      {search.created && (
        <Notice tone="ok" className="mb-6" title="Challenge created">
          {t.status === 'PENDING_APPROVAL' ? 'Your draft is waiting for Jump approval. ' : t.status === 'PENDING_FUNDING' ? 'Fund the prize to open entry. ' : 'Your challenge is open. '}
          Share code <span className="font-mono font-semibold text-ink">{t.code}</span> when it opens.
        </Notice>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <section className="panel p-5">
            <Timeline table={t} now={now} />
          </section>

          <section>
            <SectionTitle aside={isFinal ? <span className="tag border-ink bg-volt">Final</span> : <span className="tag border-warn/60 bg-warn-wash text-warn">Provisional</span>}>
              Standings
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
                metricLabel={t.scoringMethod === 'MOST_STEPS' ? 'Steps' : t.scoringMethod === 'FARTHEST_DISTANCE' ? 'Distance' : 'Time'}
                formatScore={t.scoringMethod === 'FARTHEST_DISTANCE' ? undefined : (row) => (
                  <span className="score num text-[20px]">
                    {t.scoringMethod === 'MOST_STEPS' ? Number(row.score ?? 0).toLocaleString('en-GB') : row.score === null ? '-' : formatDuration(Number(row.score))}
                  </span>
                )}
                caption={
                  isFinal
                    ? `Settled ${formatDate(result.data?.createdAt)} · version ${result.data?.version}. These standings are locked.`
                    : `Live · ${scoringLabel(t, unit)}. Positions can still change until the result is settled.`
                }
                empty={<EmptyState title="Nobody’s on the board yet">Join now and your first eligible verified activity puts you on the board.</EmptyState>}
              />
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <EntryPanel table={t} joinedRank={me?.rank} joinedScore={me ? scoreText(me, t, unit) : undefined} entrants={standings.data?.length ?? 0} now={now} />

          <section className="panel p-5">
            <p className="eyebrow mb-3">Invite code</p>
            <p className="font-mono text-[26px] font-semibold tracking-[0.2em]">{t.code}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <CopyButton value={t.code} label="Copy code" />
              <CopyButton value={shareUrl} label="Copy link" />
              {'share' in navigator && (
                <button
                  type="button"
                  className="btn-quiet btn-sm"
                  onClick={() => void navigator.share({ title: t.title, text: `Join my Jump challenge "${t.title}" (code ${t.code}): ${shareUrl}` }).catch(() => undefined)}
                >
                  <ShareIcon size={14} /> Share
                </button>
              )}
            </div>
          </section>

          <Rules table={t} unit={unit} />
          {user?.id === t.creatorId && <InvitationsPanel table={t} />}
        </aside>
      </div>
    </div>
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
    ...(table.scoringMethod === 'FARTHEST_DISTANCE'
      ? [table.distanceCapMetres ? `Each activity counts up to ${formatDistance(table.distanceCapMetres, unit)}.` : 'No per-activity distance cap.']
      : []),
    'Ties go to whoever joined first.',
    ...(table.type === 'paid' && table.minimumEntrants > 1 ? [`Needs at least ${table.minimumEntrants} entrants to go ahead.`] : []),
    ...(table.guaranteedPrizeKobo ? [`Prizes go to the top ${table.prizeSplitBps?.length ?? 1} eligible ${table.prizeSplitBps?.length === 1 ? 'runner' : 'runners'}. If fewer finish, their listed shares are proportionally redistributed.`] : []),
    ...(['paid', 'sponsored'].includes(table.type) ? ['The host is on the board but cannot receive a cash prize from their own challenge.'] : []),
    ...(table.type === 'sponsored' ? [`Anyone may fund this free-entry challenge. The funder cannot receive its cash prize. Winners share ${(10000 - table.platformFeeBps) / 100}% of the deposit; Jump retains ${table.platformFeeBps / 100}%.`] : []),
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
  const invitations = useQuery({
    queryKey: ['table', table.id, 'invitations'],
    queryFn: () => api<Array<{ id: string; email: string | null; phone: string | null }>>(`/tables/${table.id}/invitations`),
  });
  if (!invitations.data?.length && !invitations.error) return null;
  const link = `${window.location.origin}/competitions/${table.code}`;
  return (
    <section className="panel p-5">
      <SectionTitle>Invitations</SectionTitle>
      <ErrorNotice error={invitations.error} onRetry={() => void invitations.refetch()} />
      <ul className="space-y-2 text-[13px]">
        {invitations.data?.map((invite) => (
          <li key={invite.id} className="flex items-center justify-between gap-3 border-b border-line py-2">
            <span className="truncate">{invite.email ?? invite.phone}</span>
            {invite.phone ? <a className="btn-quiet btn-sm shrink-0" href={`sms:${invite.phone}?body=${encodeURIComponent(`Join ${table.title} on Jump: ${link}`)}`}>Send text</a> : <span className="text-ink-3">Email invite</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EntryPanel({
  table,
  joinedRank,
  joinedScore,
  entrants,
  now,
}: {
  table: CompetitionTable;
  joinedRank?: number;
  joinedScore?: string;
  entrants: number;
  now: number;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const wallet = useWallet();
  const payments = useSavedPayments();
  const pendingPayment = payments.find((payment) => payment.tableId === table.id && OPEN_PAYMENT_STATUSES.includes(payment.lastStatus));
  const open = canEnter(table, now);
  const full = table.capacity !== null && entrants >= table.capacity;

  const join = useMutation({
    mutationFn: () => post(`/tables/${table.id}/register-free`),
    async onSuccess() {
      if (user) rememberTable(user.id, { id: table.id, code: table.code, title: table.title });
      await queryClient.invalidateQueries({ queryKey: keys.standings(table.id) });
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
    mutationFn: () => post<CheckoutResponse>(`/tables/${table.id}/fund-prize`),
    onSuccess(response) {
      savePayment({ reference: response.reference, purpose: 'SPONSOR_FUNDING', tableId: table.id, tableCode: table.code, tableTitle: table.title, amountKobo: table.guaranteedPrizeKobo ?? 0, createdAt: new Date().toISOString() });
      window.location.assign(response.authorizationUrl);
    },
  });

  if (joinedRank !== undefined) {
    return (
      <section className="rounded-md border-2 border-ink bg-volt p-5 shadow-hard">
        <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em]">
          <CheckIcon size={16} /> You’re in
        </p>
        <div className="mt-4 flex items-center gap-4">
          <RankBadge rank={joinedRank} size="lg" />
          <div>
            <p className="wide text-[20px] font-black uppercase leading-none">{ordinal(joinedRank)} place</p>
            <p className="num mt-1 text-[13px]">
              {joinedScore ?? 'No score yet'} · of {entrants}
            </p>
          </div>
        </div>
        {canEnter(table, now) || competitionPhase(table, now) === 'entry-closed' ? (
          <Link to="/run" className="btn-dark mt-5 w-full">
            Record an activity
          </Link>
        ) : null}
        {table.type === 'sponsored' && table.status === 'PENDING_FUNDING' && user && (
          <div className="mt-5">
            {pendingPayment ? <Link to="/payments/return" className="btn-dark w-full">Check prize payment</Link> : (
              <button type="button" className="btn-dark w-full" onClick={() => fundPrize.mutate()} disabled={fundPrize.isPending}>
                {fundPrize.isPending ? 'Opening Paystack…' : `Fund prize · ${formatMoney(table.guaranteedPrizeKobo ?? 0)}`}
              </button>
            )}
            <ErrorNotice error={fundPrize.error} className="mt-3" />
          </div>
        )}
      </section>
    );
  }

  const isPaid = table.type === 'paid';
  const isSponsored = table.type === 'sponsored';
  const participantCount = isPaid ? Math.max(0, entrants - 1) : entrants;
  const conflict = isApiError(join.error, 409) ? joinConflictCopy(join.error.message) : null;

  return (
    <section className="panel-strong p-5">
      <p className="eyebrow">Entry</p>
      <p className="score mt-2 text-[44px]">{isPaid ? formatMoney(table.entryFeeKobo) : 'Free'}</p>
      <ul className="mt-3 space-y-1.5 text-[13px] text-ink-2">
        {table.guaranteedPrizeKobo ? (
          <li>
            Prize pool <span className="font-bold text-ink">{formatMoney(prizeSplit(table.guaranteedPrizeKobo, table.platformFeeBps, table.creatorCommissionBps).winnerKobo)}</span>
            {table.prizeSplitBps?.length > 1 ? ` · top ${table.prizeSplitBps.length}` : ' · winner takes all'}
          </li>
        ) : null}
        <li className="num">
          {participantCount} {participantCount === 1 ? 'runner' : 'runners'}
          {table.capacity ? ` of ${table.capacity}` : ''} so far
        </li>
        <li>{phaseLine(table, now)}</li>
      </ul>

      <div className="mt-5">
        {!open && isSponsored && table.status === 'PENDING_FUNDING' && user ? (
          <>
            {pendingPayment ? <Link to="/payments/return" className="btn-primary w-full">Check prize payment</Link> : (
              <button type="button" className="btn-primary w-full" onClick={() => fundPrize.mutate()} disabled={fundPrize.isPending}>
                {fundPrize.isPending ? 'Opening Paystack…' : `Fund prize · ${formatMoney(table.guaranteedPrizeKobo ?? 0)}`}
              </button>
            )}
            <p className="mt-2 text-[12px] text-ink-3">Anyone can fund it. Entry opens only after Paystack confirms the deposit. The funder cannot win the cash prize.</p>
            <ErrorNotice error={fundPrize.error} className="mt-3" />
          </>
        ) : !open ? (
          <Notice tone="neutral">{table.status === 'PENDING_APPROVAL' ? 'Waiting for Jump to approve this challenge.' : table.status === 'PENDING_FUNDING' ? <><span>Prize funding needed. </span><Link to="/login" search={{ redirect: `/competitions/${table.code}` }} className="font-semibold underline">Log in to fund it</Link>.</> : 'Entry is closed for this challenge.'}</Notice>
        ) : full ? (
          <Notice tone="neutral">This challenge is full.</Notice>
        ) : !user ? (
          <Link to="/login" search={{ redirect: `/competitions/${table.code}` }} className="btn-primary w-full">
            Log in to join
          </Link>
        ) : pendingPayment ? (
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
              {join.isPending ? 'Joining…' : 'Join challenge'}
            </button>
            {conflict ? <Notice tone="neutral" className="mt-4">{conflict}</Notice> : <ErrorNotice error={join.error} className="mt-4" />}
          </>
        )}
      </div>
    </section>
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
      <p className="eyebrow mb-2">When the challenge ends</p>
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
