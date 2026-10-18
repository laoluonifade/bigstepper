import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CompetitionCard, PhaseTag, Timeline, TypeTag, canEnter, competitionPhase, phaseLine } from '../components/competition';
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
  { to: '/competitions', label: 'Tables' },
  { to: '/leagues', label: 'Leagues' },
  { to: '/clubs', label: 'Clubs' },
] as const;

export function CompeteSubNav() {
  const { user } = useAuth();
  return <SubNav items={user ? [...COMPETE_NAV] : COMPETE_NAV.filter((item) => item.to !== '/clubs')} />;
}

type TypeFilter = 'all' | 'free' | 'paid';

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
        title="Tables"
        description="Compete on verified distance, steps, or completion time. Every challenge shows exactly how the winner is decided."
        actions={
          user && (
            <Link to="/competitions/new" className="btn-primary">
              <PlusIcon size={16} /> Create table
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
        <button className="btn-dark shrink-0" disabled={!code.trim()} aria-label="Open table">
          <ArrowRightIcon size={18} />
        </button>
      </form>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {hasPaid ? (
          <Segmented<TypeFilter>
            label="Table type"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'free', label: 'Free' },
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          mark="00"
          title="No open tables"
          action={
            user ? (
              <Link to="/competitions/new" className="btn-primary">
                <PlusIcon size={16} /> Start the first one
              </Link>
            ) : undefined
          }
        >
          Create a table and send the invite code to your crew.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const unit = useUnit();
  const creator = useCreator();
  const [mode, setMode] = useState<'free' | 'paid'>('free');
  const [title, setTitle] = useState('');
  const [challengeType, setChallengeType] = useState<ChallengeType>('RUN');
  const [scoringMethod, setScoringMethod] = useState<ScoringMethod>('FARTHEST_DISTANCE');
  const [targetDistance, setTargetDistance] = useState('');
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [scoringClosesAt, setScoringClosesAt] = useState(() => toLocalInput(new Date(Date.now() + 7 * 86_400_000)));
  const [entryClosesAt, setEntryClosesAt] = useState('');
  const [capacity, setCapacity] = useState('');
  const [cap, setCap] = useState('');
  const [duration, setDuration] = useState<number | null>(7);
  const [entryFee, setEntryFee] = useState('');
  const [guaranteedPrize, setGuaranteedPrize] = useState('');
  const [minimumEntrants, setMinimumEntrants] = useState('2');

  const startIso = fromLocalInput(startsAt);
  const scoringIso = fromLocalInput(scoringClosesAt);
  const entryIso = fromLocalInput(entryClosesAt);
  const capMetres = cap ? toMetres(Number(cap), unit) : undefined;
  const capacityNumber = capacity ? Number(capacity) : undefined;
  const targetDistanceMetres = targetDistance ? toMetres(Number(targetDistance), unit) : undefined;
  const entryFeeKobo = Math.round(Number(entryFee || 0) * 100);
  const guaranteedPrizeKobo = Math.round(Number(guaranteedPrize || 0) * 100);
  const minimumEntrantsNumber = Number(minimumEntrants || 0);
  const needsTarget = scoringMethod === 'FASTEST_FIXED_DISTANCE' || scoringMethod === 'FASTEST_TIME';

  const errors = {
    title: title.trim().length > 0 && title.trim().length < 3 ? 'At least 3 characters.' : undefined,
    scoring: startIso && scoringIso && new Date(scoringIso) <= new Date(startIso) ? 'Must be after the start.' : undefined,
    entry: entryIso && scoringIso && new Date(entryIso) > new Date(scoringIso) ? 'Entry must close before scoring closes.' : undefined,
    capacity: capacityNumber !== undefined && (capacityNumber < 2 || capacityNumber > 10000 || !Number.isInteger(capacityNumber)) ? 'Between 2 and 10,000 runners.' : undefined,
    cap: capMetres !== undefined && (capMetres < 1000 || capMetres > 500000) ? `Between ${formatDistance(1000, unit)} and ${formatDistance(500000, unit)}.` : undefined,
    target: needsTarget && (!targetDistanceMetres || targetDistanceMetres < 100 || targetDistanceMetres > 500000) ? `Enter a target between ${formatDistance(100, unit)} and ${formatDistance(500000, unit)}.` : undefined,
    paid: mode === 'paid' && (!creator.data || entryFeeKobo < 100 || guaranteedPrizeKobo < 100 || !capacityNumber || minimumEntrantsNumber < 2 || minimumEntrantsNumber > capacityNumber) ? 'Complete the paid challenge fields and use an active creator account.' : undefined,
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
        ...(entryIso || (mode === 'paid' && scoringIso) ? { entryClosesAt: entryIso ?? scoringIso } : {}),
        ...(capacityNumber ? { capacity: capacityNumber } : {}),
        ...(mode === 'free' && capMetres ? { distanceCapMetres: capMetres } : {}),
        ...(mode === 'paid' ? { entryFeeKobo, guaranteedPrizeKobo, minimumEntrants: minimumEntrantsNumber } : {}),
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
    title: title.trim() || 'Your table name',
    code: '— — — —',
    type: mode,
    status: 'OPEN_FOR_ENTRY',
    entryFeeKobo: mode === 'paid' ? entryFeeKobo : 0,
    guaranteedPrizeKobo: mode === 'paid' && guaranteedPrizeKobo ? guaranteedPrizeKobo : null,
    minimumEntrants: mode === 'paid' ? minimumEntrantsNumber : 1,
    startsAt: startIso ?? null,
    entryClosesAt: entryIso ?? scoringIso ?? null,
    scoringClosesAt: scoringIso ?? null,
    capacity: capacityNumber ?? null,
    distanceCapMetres: capMetres ?? null,
    challengeType,
    scoringMethod,
    targetDistanceMetres: targetDistanceMetres ?? null,
    communityId: null,
    platformFeeBps: mode === 'paid' ? 3500 : 3000,
    creatorCommissionBps: mode === 'paid' ? 500 : 0,
    creatorId: user?.id ?? '',
    creator: { id: user?.id ?? '', displayName: user?.displayName ?? null },
    createdAt: new Date().toISOString(),
  };

  return (
    <div className="animate-rise">
      <PageHeader back={{ to: '/competitions', label: 'Tables' }} eyebrow="New challenge" title="Set up a challenge" description="Choose the activity and exact scoring method before you publish." />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!invalid) create.mutate();
          }}
        >
          <Segmented<'free' | 'paid'>
            label="Challenge type"
            value={mode}
            onChange={setMode}
            options={[{ value: 'free', label: 'Free' }, { value: 'paid', label: 'Paid · creator' }]}
          />
          {mode === 'paid' && !creator.data && (
            <Notice tone="warn" title="Creator account required" action={<Link to="/creator" className="btn-quiet btn-sm">Become a creator</Link>}>
              Paid challenges earn creators 5% and must be reviewed before opening.
            </Notice>
          )}
          <Field label="Table name" error={errors.title}>
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
            <Field label="Scoring closes" error={errors.scoring} hint="Runs must finish before this.">
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

          <Field label="Entry closes" optional error={errors.entry} hint="Leave empty to accept new runners until scoring closes.">
            {(props) => (
              <DateTimePicker {...props} value={entryClosesAt} onChange={setEntryClosesAt} placeholder="Open until scoring closes" clearable />
            )}
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Max runners" optional error={errors.capacity} hint="2 to 10,000. Empty means no limit.">
              {(props) => (
                <input {...props} type="number" inputMode="numeric" min={2} max={10000} className="field num" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
              )}
            </Field>
            {mode === 'free' ? <Field label={`Distance cap per activity (${unit})`} optional error={errors.cap} hint="Stops one monster activity from deciding everything.">
              {(props) => (
                <input {...props} type="number" inputMode="decimal" step="0.1" min={0} className="field num" value={cap} onChange={(event) => setCap(event.target.value)} />
              )}
            </Field> : <div />}
          </div>

          {mode === 'paid' && (
            <div className="panel space-y-5 p-5">
              <SectionTitle>Paid challenge</SectionTitle>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Entry fee · NGN">{(props) => <input {...props} className="field num" type="number" min="1" step="1" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} required />}</Field>
                <Field label="Guaranteed prize · NGN">{(props) => <input {...props} className="field num" type="number" min="1" step="1" value={guaranteedPrize} onChange={(event) => setGuaranteedPrize(event.target.value)} required />}</Field>
                <Field label="Minimum entrants">{(props) => <input {...props} className="field num" type="number" min="2" max={capacityNumber ?? 10000} value={minimumEntrants} onChange={(event) => setMinimumEntrants(event.target.value)} required />}</Field>
              </div>
              <p className="text-[12px] leading-relaxed text-ink-3">The draft stays pending until Jump confirms funding and rules. On settlement, 30% goes to Jump, 5% to the creator, and 65% to the winner.</p>
            </div>
          )}
          {errors.paid && mode === 'paid' && <Notice tone="warn">{errors.paid}</Notice>}

          <ErrorNotice error={create.error} />
          <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
            <button className="btn-primary min-h-12 px-6" disabled={create.isPending || invalid}>
              {create.isPending ? 'Creating…' : mode === 'paid' ? 'Submit paid draft' : 'Create challenge'}
            </button>
            <p className="text-[12px] text-ink-3">Paid challenges are reviewed by Jump staff.</p>
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
  const table = useQuery({ queryKey: keys.table(code), queryFn: () => api<CompetitionTable>(`/tables/${encodeURIComponent(code)}`) });
  const result = useFinalResult(table.data?.id);
  const live = table.data ? ['open', 'upcoming', 'entry-closed'].includes(competitionPhase(table.data, now)) : false;
  const standings = useStandings(table.data?.id, live ? 30_000 : false);

  const me = standings.data?.find((row) => row.userId === user?.id);

  useEffect(() => {
    if (user && me && table.data) rememberTable(user.id, { id: table.data.id, code: table.data.code, title: table.data.title });
  }, [me, table.data, user]);

  const rows: LeaderboardRow[] = useMemo(() => {
    const names = new Map(standings.data?.map((row) => [row.userId, row.displayName]));
    const method = table.data?.scoringMethod ?? 'FARTHEST_DISTANCE';
    if (result.data) {
      return result.data.standings.map((row) => ({
        rank: row.rank,
        userId: row.userId,
        name: row.userId === user?.id ? user.displayName ?? 'You' : names.get(row.userId) ?? 'Runner',
        metres: row.creditedDistanceMetres,
        score: scoreValue(row, method),
      }));
    }
    return (standings.data ?? []).map((row) => ({
      rank: row.rank,
      userId: row.userId,
      name: row.displayName,
      metres: row.creditedDistanceMetres,
      score: scoreValue(row, method),
    }));
  }, [result.data, standings.data, table.data?.scoringMethod, user]);

  if (table.isLoading) return <Loading />;
  if (table.error || !table.data) {
    return (
      <>
        <PageHeader back={{ to: '/competitions', label: 'Tables' }} title="Table not found" />
        {isApiError(table.error, 404) ? (
          <EmptyState title={`No table with code ${code.toUpperCase()}`}>Check the invite code and try again. Codes are 8 letters and numbers.</EmptyState>
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
      <PageHeader back={{ to: '/competitions', label: 'Tables' }} title={t.title} eyebrow={<span className="flex flex-wrap gap-2"><TypeTag table={t} /><PhaseTag table={t} now={now} /></span>} description={t.creator?.displayName ? `Hosted by ${t.creator.displayName}` : undefined} />

      {search.created && (
        <Notice tone="ok" className="mb-6" title="Table created">
          Share the invite code <span className="font-mono font-semibold text-ink">{t.code}</span> so others can join. Hit join yourself to get on
          the board.
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
                    {t.scoringMethod === 'MOST_STEPS' ? Number(row.score ?? 0).toLocaleString('en-GB') : row.score === null ? '—' : formatDuration(Number(row.score))}
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
                  onClick={() => void navigator.share({ title: t.title, text: `Join my Jump challenge "${t.title}" — code ${t.code}`, url: shareUrl }).catch(() => undefined)}
                >
                  <ShareIcon size={14} /> Share
                </button>
              )}
            </div>
          </section>

          <Rules table={t} unit={unit} />
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
      </section>
    );
  }

  const isPaid = table.type === 'paid';
  const conflict = isApiError(join.error, 409) ? joinConflictCopy(join.error.message) : null;

  return (
    <section className="panel-strong p-5">
      <p className="eyebrow">Entry</p>
      <p className="score mt-2 text-[44px]">{isPaid ? formatMoney(table.entryFeeKobo) : 'Free'}</p>
      <ul className="mt-3 space-y-1.5 text-[13px] text-ink-2">
        {isPaid && table.guaranteedPrizeKobo ? (
          <li>
            Guaranteed prize <span className="font-bold text-ink">{formatMoney(table.guaranteedPrizeKobo)}</span> to the winner
          </li>
        ) : null}
        <li className="num">
          {entrants} {entrants === 1 ? 'runner' : 'runners'}
          {table.capacity ? ` of ${table.capacity}` : ''} so far
        </li>
        <li>{phaseLine(table, now)}</li>
      </ul>

      <div className="mt-5">
        {!open ? (
          <Notice tone="neutral">Entry is closed for this table.</Notice>
        ) : full ? (
          <Notice tone="neutral">This table is full.</Notice>
        ) : !user ? (
          <Link to="/login" search={{ redirect: `/competitions/${table.code}` }} className="btn-primary w-full">
            Log in to join
          </Link>
        ) : pendingPayment ? (
          <Link to="/payments/return" className="btn-secondary w-full">
            Payment in progress — check status
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
                    Your email, adult verification and paid-competition eligibility must all be approved before you can enter.
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
              {join.isPending ? 'Joining…' : 'Join table'}
            </button>
            {conflict ? <Notice tone="neutral" className="mt-4">{conflict}</Notice> : <ErrorNotice error={join.error} className="mt-4" />}
          </>
        )}
      </div>
    </section>
  );
}
