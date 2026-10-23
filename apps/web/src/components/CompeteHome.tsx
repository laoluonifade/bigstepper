import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { api, post } from '../lib/api';
import { formatCountdown, ordinal } from '../lib/format';
import { useUser } from '../lib/auth';
import { keys, useDiscover, useStandings } from '../lib/queries';
import { formatGap, formatScore, hasScored, towardLeader } from '../lib/scoring';
import { TEMPLATES } from '../lib/templates';
import { toast } from '../lib/toast';
import type { ChallengeType, CompetitionTable, ScoringMethod, StandingRow, Unit } from '../lib/types';
import { ChallengeMark, CompetitionPreviewCard, phaseLine, prizeLabel } from './competition';
import { ChevronRightIcon, PlusIcon, SearchIcon, UsersIcon } from './icons';
import { Avatar, cx, ErrorNotice, Skeleton } from './ui';

export type MyCompetition = {
  id: string; code: string; title: string; type: string; challengeType: ChallengeType; scoringMethod: ScoringMethod; targetDistanceMetres: number | null;
  status: string; startsAt: string | null; scoringClosesAt: string | null; visibility: string; hosting: boolean; joined: boolean;
  entrants: number; myRank: number | null; myScore: number | null; leaderScore: number | null;
};

/*
 * Home design rules: one type scale (13–15px body, 15px section titles), ink outlines with small hard
 * shadows, neutral surfaces, and orange kept for the single primary action on screen.
 */
const CARD = 'rounded-xl border-[1.5px] border-ink bg-card shadow-hard-sm';

/** Section heading: quiet title on the left, one small action on the right. */
export function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="mb-2.5 flex items-baseline justify-between gap-3">
    <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
    {action && <span className="shrink-0 text-[13px] font-semibold text-ink-2">{action}</span>}
  </div>;
}

function SeeAll({ label = 'See all', search }: { label?: string; search?: Record<string, string> }) {
  return <Link to="/competitions" search={search ?? {}} className="inline-flex items-center gap-0.5 hover:text-ink">{label}<ChevronRightIcon size={14} /></Link>;
}

const CHIPS: Array<{ label: string; activity: 'all' | ChallengeType }> = [
  { label: 'All', activity: 'all' },
  { label: 'Run', activity: 'RUN' },
  { label: 'Walk', activity: 'WALK' },
  { label: 'Ride', activity: 'CYCLING' },
  { label: 'Steps', activity: 'STEP' },
  { label: 'Timed', activity: 'TIMED' },
];

/** Search competitions, or paste an invite code to jump straight to one. */
export function CompetitionSearch() {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const value = term.trim();
    if (/^[0-9A-F]{8}$/i.test(value)) void navigate({ to: '/competitions/$code', params: { code: value.toUpperCase() } });
    else void navigate({ to: '/competitions', search: value ? { q: value } : {} });
  }
  return <div>
    <form onSubmit={submit} className="flex h-11 items-center gap-2.5 rounded-xl border-[1.5px] border-ink bg-card px-3.5">
      <SearchIcon size={17} className="shrink-0 text-ink-3" />
      <input className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3" placeholder="Search competitions or enter a code" value={term} onChange={(event) => setTerm(event.target.value)} aria-label="Search competitions or enter an invite code" />
    </form>
    <div className="no-scrollbar -mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {CHIPS.map((chip) => <Link key={chip.label} to="/competitions" search={chip.activity === 'all' ? {} : { activity: chip.activity }} className="h-8 shrink-0 rounded-full border-[1.5px] border-line bg-card px-3.5 text-[13px] font-semibold leading-[29px] text-ink-2 transition-colors hover:border-ink hover:text-ink">{chip.label}</Link>)}
    </div>
  </div>;
}

const scoreOf = (table: Pick<MyCompetition, 'challengeType' | 'scoringMethod'>, value: number | null, unit: Unit) => formatScore(table, value, unit);

/** Where you stand, in a few words: leading, behind by how much, or not started. */
function standingLine(table: MyCompetition, unit: Unit) {
  const mine = table.myScore === null ? null : Number(table.myScore);
  const leader = table.leaderScore === null ? null : Number(table.leaderScore);
  if (!table.joined) return 'Hosting';
  if (!hasScored(table.scoringMethod, mine)) return 'No score yet';
  if (table.myRank === 1) return table.entrants > 1 ? 'Leading' : 'On top';
  if (leader === null) return '';
  return `${formatGap(table, mine!, leader, unit)} behind`;
}

/** Your live competitions: two at most, each one line of where you stand. */
export function MyCompetitions({ unit, now }: { unit: Unit; now: number }) {
  const mine = useQuery({ queryKey: ['tables', 'mine'], queryFn: () => api<MyCompetition[]>('/tables/mine'), refetchInterval: 60_000 });
  const live = (mine.data ?? []).filter((table) => ['OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED'].includes(table.status) && (!table.scoringClosesAt || new Date(table.scoringClosesAt).getTime() > now));

  if (mine.isLoading) return null;
  if (!live.some((table) => table.joined)) return <RecommendedJoin unit={unit} now={now} />;
  // The first joined race is the hero above; list the rest here.
  const heroId = live.find((table) => table.joined)?.id;
  const others = live.filter((table) => table.id !== heroId);
  if (!others.length) return null;
  return <section>
    <SectionHead title="Your other races" action={others.length > 2 ? <SeeAll label={`All ${others.length}`} /> : undefined} />
    <div className={cx(CARD, 'divide-y divide-line overflow-hidden')}>
      {others.slice(0, 2).map((table) => {
        const leading = table.joined && table.myRank === 1 && Number(table.myScore ?? 0) > 0;
        const ends = table.startsAt && new Date(table.startsAt).getTime() > now ? `Starts in ${formatCountdown(table.startsAt, now)}` : table.scoringClosesAt ? `${formatCountdown(table.scoringClosesAt, now)} left` : 'Open-ended';
        return <Link key={table.id} to="/competitions/$code" params={{ code: table.code }} className="block px-3.5 py-3 transition-colors hover:bg-ink/[0.02]">
          <div className="flex items-center gap-3">
            <ChallengeMark type={table.challengeType} code={table.code} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold leading-tight">{table.title}</p>
              <p className="num mt-0.5 truncate text-[12px] text-ink-3">{table.entrants} in · {ends}</p>
            </div>
            {table.joined && table.myRank !== null
              ? <div className="shrink-0 text-right leading-none">
                <p className={cx('score num text-[22px]', leading && 'text-ok')}>#{table.myRank}</p>
                <p className="mt-1 text-[11px] font-semibold text-ink-3">{standingLine(table, unit)}</p>
              </div>
              : <span className="shrink-0 text-[12px] font-semibold text-ink-3">{standingLine(table, unit)}</span>}
          </div>
          {table.joined && <div className="ml-12 mt-2 h-1 overflow-hidden rounded-full bg-ink/[0.07]"><div className={cx('h-full rounded-full', leading ? 'bg-ok' : 'bg-ink')} style={{ width: `${Math.max(3, towardLeader(table.scoringMethod, table.myScore === null ? null : Number(table.myScore), table.leaderScore === null ? null : Number(table.leaderScore)) * 100)}%` }} /></div>}
        </Link>;
      })}
    </div>
  </section>;
}

/** One competition as a single tidy row, shared by the home lists. */
function CompactRow({ table, unit, now, trailing }: { table: CompetitionTable; unit: Unit; now: number; trailing?: ReactNode }) {
  const prize = prizeLabel(table, unit);
  return <div className="flex items-center gap-3 px-3.5 py-3">
    <ChallengeMark type={table.challengeType} code={table.code} size={36} />
    <Link to="/competitions/$code" params={{ code: table.code }} className="min-w-0 flex-1">
      <p className="truncate text-[14px] font-semibold leading-tight">{table.title}</p>
      <p className="num mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-0.5"><UsersIcon size={12} />{table.entrantCount ?? 0}</span>
        <span aria-hidden="true">·</span>
        <span className="truncate">{phaseLine(table, now).replace(/^Ends in /, '')} left</span>
        <span aria-hidden="true">·</span>
        <span className={cx('shrink-0 font-semibold', prize.prize ? 'text-ok' : 'text-ink-2')}>{prize.text}</span>
      </p>
    </Link>
    {trailing}
  </div>;
}

/** The most-joined open competitions: two cards with their boards, then Compete for the rest. */
export function TrendingCompetitions({ unit, now }: { unit: Unit; now: number }) {
  const trending = useDiscover('trending');
  const list = (trending.data?.pages.flatMap((page) => page.items) ?? []).slice(0, 2);
  if (!trending.isLoading && !list.length) return null;
  return <section>
    <SectionHead title="Popular right now" action={<SeeAll />} />
    {trending.isLoading ? <Skeleton className="h-44 rounded-2xl" /> : <div className="grid gap-3 sm:grid-cols-2">
      {list.map((table) => <CompetitionPreviewCard key={table.id} table={table} unit={unit} now={now} />)}
    </div>}
  </section>;
}

/** Start one and bring your people: a plain row, so the race above stays the thing to look at. */
export function CreateCompetitionCta() {
  return <Link to="/competitions/new" className={cx(CARD, 'group flex items-center gap-3.5 px-4 py-3.5')}>
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink text-paper transition-transform group-hover:rotate-90"><PlusIcon size={19} /></span>
    <span className="min-w-0 flex-1">
      <span className="block text-[15px] font-bold">Start a competition</span>
      <span className="block text-[13px] text-ink-3">Set the rules and bring your people.</span>
    </span>
    <ChevronRightIcon size={18} className="shrink-0 text-ink-3" />
  </Link>;
}

/**
 * Competitions picked for you, with one tap to join them. Free ones join instantly; paid ones are left
 * to pay for on their page (never charged without the runner's say).
 */
export function RecommendedJoin({ unit, now, limit = 2, onDone, title = 'Picked for you', freeOnly = false, empty = null }: {
  unit: Unit; now: number; limit?: number; onDone?: () => void; title?: string; freeOnly?: boolean; empty?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const feed = useDiscover('for-you', freeOnly ? 'free' : 'all');
  // For you leads with competitions you're already in; these are only the ones still to join.
  const all = (feed.data?.pages.flatMap((page) => page.items) ?? []).filter((table) => table.myRank === null || table.myRank === undefined);
  const picks = all.slice(0, limit);
  const free = picks.filter((table) => table.type !== 'paid');
  const join = useMutation({
    mutationFn: (ids: string[]) => post<{ joined: string[]; needsPayment: string[] }>('/tables/join-many', { ids }),
    async onSuccess(result) {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['tables'] }), queryClient.invalidateQueries({ queryKey: keys.tables })]);
      if (result.joined.length) toast({ tone: 'ok', title: `You’re in ${result.joined.length === 1 ? 'a competition' : `${result.joined.length} competitions`}`, message: 'Every run you record now counts toward your rank.' });
      const paid = picks.find((table) => result.needsPayment.includes(table.id));
      if (paid) void navigate({ to: '/competitions/$code', params: { code: paid.code } });
      onDone?.();
    },
  });

  if (feed.isLoading) return <section><SectionHead title={title} /><Skeleton className="h-36 rounded-xl" /></section>;
  if (!picks.length) return <>{empty}</>;
  return <section>
    <SectionHead title={title} action={all.length > limit ? <SeeAll search={{}} /> : undefined} />
    <div className={cx(CARD, 'overflow-hidden')}>
      <div className="divide-y divide-line">
        {picks.map((table) => <CompactRow key={table.id} table={table} unit={unit} now={now} trailing={
          <button type="button" className="h-8 shrink-0 rounded-lg border-[1.5px] border-ink px-3 text-[13px] font-bold transition-colors hover:bg-ink hover:text-paper disabled:opacity-40" disabled={join.isPending} onClick={() => join.mutate([table.id])}>
            {table.type === 'paid' ? 'View' : 'Join'}
          </button>
        } />)}
      </div>
      {free.length > 1 && <div className="border-t-[1.5px] border-ink p-3">
        <button type="button" className="btn-dark min-h-11 w-full text-[14px]" disabled={join.isPending} onClick={() => join.mutate(free.map((table) => table.id))}>
          {join.isPending ? 'Joining…' : `Join ${free.length === 2 ? 'both' : `all ${free.length}`}`}
        </button>
      </div>}
    </div>
    <ErrorNotice error={join.error} />
  </section>;
}

const laneScore = (row: StandingRow) => (row.score === null || row.score === undefined ? null : Number(row.score));

/** 0–1 along the track: how close to the leader, whichever way the score runs. */
function lanePosition(method: string, row: StandingRow, leader: StandingRow | undefined) {
  if (!hasScored(method, row.score) || !leader) return 0;
  return towardLeader(method, laneScore(row), laneScore(leader));
}

const firstName = (name: string) => name.split(' ')[0];

/**
 * The home hero: your most urgent race drawn as running lanes, everyone placed by their score, you in
 * volt. With no race of your own, it shows the hottest open one and invites you onto the start line.
 */
export function RaceHero({ unit, now }: { unit: Unit; now: number }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const mine = useQuery({ queryKey: ['tables', 'mine'], queryFn: () => api<MyCompetition[]>('/tables/mine'), refetchInterval: 60_000 });
  const trending = useDiscover('trending');
  const live = (mine.data ?? []).filter((table) => table.joined && ['OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED'].includes(table.status) && (!table.scoringClosesAt || new Date(table.scoringClosesAt).getTime() > now));
  const hot = trending.data?.pages[0]?.items[0];
  const race = live[0] ?? (hot && { id: hot.id, code: hot.code, title: hot.title, challengeType: hot.challengeType, scoringMethod: hot.scoringMethod, scoringClosesAt: hot.scoringClosesAt, startsAt: hot.startsAt, entrants: hot.entrantCount ?? 0, type: hot.type });
  const joined = Boolean(live[0]);
  const standings = useStandings(race?.id, 60_000);
  const [shown, setShown] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(frame); }, [race?.id]);
  const join = useMutation({
    mutationFn: () => post('/tables/join-many', { ids: [race!.id] }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast({ tone: 'ok', message: `You’re in ${race!.title}. Your next run counts.` });
    },
  });

  if (mine.isLoading || (!live.length && trending.isLoading)) return <Skeleton className="h-[230px] rounded-3xl" />;
  if (!race) return null;

  const rows = standings.data ?? [];
  const me = rows.find((row) => row.userId === user.id);
  const leader = rows[0];
  const lanes = [...rows.slice(0, 4), ...(me && me.rank > 4 ? [me] : [])];
  const method = race.scoringMethod;
  const ends = race.startsAt && new Date(race.startsAt).getTime() > now ? `starts in ${formatCountdown(race.startsAt, now)}` : race.scoringClosesAt ? `${formatCountdown(race.scoringClosesAt, now)} to go` : 'no end date';
  const myScore = me && hasScored(method, me.score) ? laneScore(me) : null;
  const runnerUp = rows[1] && hasScored(method, rows[1].score) ? laneScore(rows[1]) : null;
  const leaderScore = leader ? laneScore(leader) : null;
  const gapToLeader = myScore !== null && leaderScore !== null ? formatGap(race, myScore, leaderScore, unit) : null;
  const progress = !joined || !me || myScore === null ? 0 : me.rank === 1 ? 1 : lanePosition(method, me, leader);
  const RADIUS = 50;
  const circumference = 2 * Math.PI * RADIUS;
  const line = !joined
    ? <><b className="font-semibold text-paper">{race.entrants} {race.entrants === 1 ? 'runner' : 'runners'}</b> in, {ends}. Join and your next run counts.</>
    : myScore === null ? <>Your first run puts you on the board, {ends}.</>
      : me?.rank === 1 ? (runnerUp !== null ? <>Leading by <b className="font-semibold text-paper">{formatGap(race, runnerUp, myScore, unit)}</b>, {ends}. Keep the gap.</> : <>Out in front, {ends}. Invite rivals to chase you.</>)
        : <><b className="font-semibold text-paper">{gapToLeader}</b> behind {firstName(leader.displayName)} with {ends}.</>;

  return <section className="overflow-hidden rounded-3xl bg-[#121212] p-5 text-paper">
    <div className="flex items-center gap-5">
      <div className="relative h-[116px] w-[116px] shrink-0">
        <svg width="116" height="116" viewBox="0 0 116 116" aria-hidden="true">
          <circle cx="58" cy="58" r={RADIUS} fill="none" stroke="#2A2A2E" strokeWidth="10" />
          <circle cx="58" cy="58" r={RADIUS} fill="none" stroke="#E4FF3A" strokeWidth="10" strokeLinecap="round" transform="rotate(-90 58 58)"
            strokeDasharray={`${(shown ? progress : 0) * circumference} ${circumference}`}
            style={{ transition: 'stroke-dasharray 1400ms cubic-bezier(0.2,0.8,0.2,1)', filter: progress ? 'drop-shadow(0 0 6px rgba(228,255,58,0.45))' : undefined }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {joined && me
            ? <><span className="score num text-[40px] leading-none">{ordinal(me.rank)}</span><span className="mt-0.5 text-[11px] text-paper/50">of {rows.length}</span></>
            : <><span className="score num text-[40px] leading-none">{race.entrants}</span><span className="mt-0.5 text-[11px] text-paper/50">{race.entrants === 1 ? 'runner' : 'runners'}</span></>}
        </div>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-volt">{race.title} · {joined ? 'Live' : 'Popular'}</p>
        <p className="mt-2 text-[15px] leading-snug text-paper/70">{line}</p>
      </div>
    </div>
    {/* The race itself: top runners (and you) placed along the track by score; the dashed line is the leader's mark. */}
    {lanes.length > 0 && <div className="relative mt-5">
      <div className="pointer-events-none absolute bottom-0 right-[calc(56px+0.5rem+2%)] top-0 border-l-[1.5px] border-dashed border-paper/20" aria-hidden="true" />
      <ol className="space-y-1">
        {lanes.map((row) => {
          const isMe = row.userId === user.id;
          const position = lanePosition(method, row, leader);
          return <li key={row.userId} className="grid grid-cols-[56px_1fr_56px] items-center gap-2">
            <span className={cx('truncate text-[12px]', isMe ? 'font-bold text-volt' : 'text-paper/60')}>{isMe ? 'You' : firstName(row.displayName)}</span>
            <span className="relative h-7">
              <span className="absolute inset-x-0 top-1/2 h-px bg-paper/10" aria-hidden="true" />
              <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-[1400ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]" style={{ left: `${shown ? 4 + position * 92 : 4}%` }}>
                <Avatar name={row.displayName} src={row.avatarUrl} avatarStyle={row.avatarStyle} size={24} className={cx('rounded-full', isMe && 'ring-2 ring-volt shadow-[0_0_10px_rgba(228,255,58,0.55)]')} />
              </span>
            </span>
            <span className={cx('num truncate text-right text-[12px]', isMe ? 'font-bold text-volt' : 'text-paper/60')}>{hasScored(method, row.score) ? scoreOf(race, laneScore(row), unit) : '–'}</span>
          </li>;
        })}
      </ol>
    </div>}
    {joined
      ? <Link to="/run" className="mt-5 flex h-12 items-center justify-center rounded-full bg-volt text-[15px] font-bold text-ink transition-transform active:scale-[0.98]">Start a run</Link>
      : race.type === 'paid'
        ? <Link to="/competitions/$code" params={{ code: race.code }} className="mt-5 flex h-12 items-center justify-center rounded-full bg-volt text-[15px] font-bold text-ink">See entry</Link>
        : <button type="button" onClick={() => join.mutate()} disabled={join.isPending} className="mt-5 flex h-12 w-full items-center justify-center rounded-full bg-volt text-[15px] font-bold text-ink transition-transform active:scale-[0.98] disabled:opacity-60">{join.isPending ? 'Joining…' : 'Join the race'}</button>}
    <Link to="/competitions/$code" params={{ code: race.code }} className="mt-3 block text-center text-[13px] font-semibold text-paper/55 transition-colors hover:text-paper">Full board</Link>
    <ErrorNotice error={join.error} />
  </section>;
}

const WHO_ICONS: Record<string, ReactNode> = {
  coworkers: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></>,
  partner: <path d="M12 20s-7-4.4-8.6-8.8C2.3 8 4.2 5 7.4 5c1.9 0 3.3 1.1 4.6 2.8C13.3 6.1 14.7 5 16.6 5c3.2 0 5.1 3 4 6.2C19 15.6 12 20 12 20Z" />,
  squad: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c3 0 6 1.8 6 5.5" /></>,
  family: <><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /><path d="M10 20v-5h4v5" /></>,
};

/**
 * Home's call to action: pick who you want to race and the competition is set up for you (private,
 * sensible rules), so all that's left is naming it and inviting them.
 */
export function ChallengeSomeone() {
  return <section>
    <SectionHead title="Challenge someone" />
    {/* One tap from "who" to a ready-made competition; ink only, so the race above keeps the colour. */}
    <div className="grid grid-cols-5 gap-1">
      {TEMPLATES.map((template) => <Link key={template.id} to="/competitions/new" search={{ template: template.id }} className="group flex flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-ink bg-card transition-all group-hover:bg-ink group-hover:text-paper group-active:scale-95">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{WHO_ICONS[template.id]}</svg>
        </span>
        <span className="mt-2 text-[13px] font-bold leading-tight">{template.who.replace(/^Your /, '').replace(/^./, (c) => c.toUpperCase())}</span>
        <span className="mt-0.5 text-[11px] leading-tight text-ink-3">{template.short}</span>
      </Link>)}
      <Link to="/competitions/new" className="group flex flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-dashed border-ink/50 text-ink-2 transition-all group-hover:border-solid group-hover:border-ink group-hover:text-ink group-active:scale-95"><PlusIcon size={20} /></span>
        <span className="mt-2 text-[13px] font-bold leading-tight">Custom</span>
        <span className="mt-0.5 text-[11px] leading-tight text-ink-3">Your rules</span>
      </Link>
    </div>
  </section>;
}
