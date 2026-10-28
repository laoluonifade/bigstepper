import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { api, post } from '../lib/api';
import { formatCountdown, formatDistance, ordinal } from '../lib/format';
import { useUser } from '../lib/auth';
import { keys, useDiscover, useStandings } from '../lib/queries';
import { formatGap, hasScored, towardLeader } from '../lib/scoring';
import { TEMPLATES } from '../lib/templates';
import { toast } from '../lib/toast';
import type { AvatarStyle, ChallengeType, CompetitionTable, ScoringMethod, StandingRow, Unit } from '../lib/types';
import { ChallengeMark, CompetitionPreviewCard, phaseLine, prizeLabel } from './competition';
import { ChevronRightIcon, LadderIcon, PlusIcon, SearchIcon, UsersIcon } from './icons';
import { Avatar, cx, ErrorNotice, Skeleton } from './ui';

export type MyCompetition = {
  id: string; code: string; title: string; type: string; challengeType: ChallengeType; scoringMethod: ScoringMethod; targetDistanceMetres: number | null;
  status: string; startsAt: string | null; scoringClosesAt: string | null; visibility: string; hosting: boolean; joined: boolean;
  entrants: number; myRank: number | null; myScore: number | null; leaderScore: number | null;
  /** The runners either side of you on the board. */
  aheadScore: number | null; aheadName: string | null; behindScore: number | null; behindName: string | null;
};

const LIVE_STATUSES = ['OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED'];

export function useMyCompetitions() {
  return useQuery({ queryKey: ['tables', 'mine'], queryFn: () => api<MyCompetition[]>('/tables/mine'), refetchInterval: 60_000 });
}

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

const scoreOf = (value: number | null) => (value === null ? null : Number(value));

/**
 * The race for the home banner: of your live ones, one you've actually moved in, then the one you're
 * closest to leading (first place counts as all the way), then whichever ends soonest.
 */
function heroRace(live: MyCompetition[]) {
  const scored = (table: MyCompetition) => hasScored(table.scoringMethod, scoreOf(table.myScore));
  const along = (table: MyCompetition) => (table.myRank === 1 ? 1 : towardLeader(table.scoringMethod, scoreOf(table.myScore), scoreOf(table.leaderScore)));
  const ends = (table: MyCompetition) => (table.scoringClosesAt ? new Date(table.scoringClosesAt).getTime() : Infinity);
  return live.filter((table) => table.joined).sort((a, b) => Number(scored(b)) - Number(scored(a)) || along(b) - along(a) || ends(a) - ends(b))[0];
}

/** Where you stand, in a few words: leading, behind by how much, or not started. */
function standingLine(table: MyCompetition, unit: Unit) {
  const mine = scoreOf(table.myScore);
  const leader = scoreOf(table.leaderScore);
  if (!table.joined) return 'Hosting';
  if (!hasScored(table.scoringMethod, mine)) return 'No score yet';
  if (table.myRank === 1) return table.entrants > 1 ? 'Leading' : 'On top';
  if (leader === null) return '';
  if (leader === mine) return 'Level with the leader';
  return `${formatGap(table, mine!, leader, unit)} behind`;
}

const liveNow = (tables: MyCompetition[] | undefined, now: number) =>
  (tables ?? []).filter((table) => LIVE_STATUSES.includes(table.status) && (!table.scoringClosesAt || new Date(table.scoringClosesAt).getTime() > now));

/** Your live competitions after the hero: two at most, each one line of where you stand. */
export function MyCompetitions({ unit, now }: { unit: Unit; now: number }) {
  const mine = useMyCompetitions();
  const live = liveNow(mine.data, now);

  if (mine.isLoading) return null;
  if (!live.some((table) => table.joined)) return <RecommendedJoin unit={unit} now={now} />;
  const heroId = heroRace(live)?.id;
  const others = live.filter((table) => table.id !== heroId);
  if (!others.length) return null;
  return <section>
    <SectionHead title="Your other races" action={others.length > 2 ? <SeeAll label={`All ${others.length}`} /> : undefined} />
    <div className="space-y-2">
      {others.slice(0, 2).map((table) => {
        const leading = table.joined && table.myRank === 1 && Number(table.myScore ?? 0) > 0;
        const ends = table.startsAt && new Date(table.startsAt).getTime() > now ? `Starts in ${formatCountdown(table.startsAt, now)}` : table.scoringClosesAt ? `${formatCountdown(table.scoringClosesAt, now)} left` : 'Open-ended';
        const along = towardLeader(table.scoringMethod, scoreOf(table.myScore), scoreOf(table.leaderScore));
        return <Link key={table.id} to="/competitions/$code" params={{ code: table.code }} className={cx(SUMMARY_CARD, 'flex items-center gap-3 rounded-[18px] px-3.5 py-3 transition-colors hover:bg-ink/[0.03]')}>
          <ChallengeMark type={table.challengeType} code={table.code} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold leading-tight">{table.title}</span>
            <span className="num mt-0.5 block truncate text-[12px] text-ink-3">{ends} · {standingLine(table, unit)}</span>
            {table.joined && <span className="mt-2 block h-1 overflow-hidden rounded-full bg-ink/[0.07]"><span className={cx('block h-full rounded-full', leading ? 'bg-ok' : 'bg-track')} style={{ width: `${Math.max(3, (leading ? 1 : along) * 100)}%` }} /></span>}
          </span>
          {table.joined && table.myRank !== null && <span className={cx('shrink-0 text-[20px] font-bold', leading && 'text-ok')}>{ordinal(table.myRank)}</span>}
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

/** The home summary's cards, like Apple Fitness on a light page: plain cards, ink figures, green for a lead. */
export const SUMMARY_CARD = 'border border-line bg-card';

/** Small ring: how far round a week of streak, or toward the leader. */
export function MiniRing({ progress, size = 30, className = 'text-ink' }: { progress: number; size?: number; className?: string }) {
  const stroke = size * 0.17;
  const r = (size - stroke) / 2;
  const around = 2 * Math.PI * r;
  return <svg width={size} height={size} aria-hidden="true">
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(18,18,18,0.07)" strokeWidth={stroke} />
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className={className} strokeWidth={stroke} strokeLinecap="round"
      strokeDasharray={`${Math.max(0.001, progress) * around} ${around}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray 1200ms cubic-bezier(0.2,0.8,0.2,1)' }} />
  </svg>;
}

/** You and the runners either side of you on one line, the fill showing how far toward the lead you are. */
function RaceLine({ progress, marks }: { progress: number; marks: Array<{ key: string; at: number; me: boolean; avatar: ReactNode }> }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(frame); }, []);
  return <div className="relative mt-5 flex h-[30px] items-center">
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.07]">
      <div className="h-full rounded-full bg-ink transition-[width] duration-[1200ms] ease-out" style={{ width: `${(shown ? progress : 0) * 100}%` }} />
    </div>
    {marks.map((mark) => <span key={mark.key} className={cx('absolute top-0 rounded-full border-2', mark.me ? 'z-10 border-track' : 'border-card')}
      style={{ left: `clamp(0px, calc(${mark.at * 100}% - 15px), calc(100% - 30px))` }}>{mark.avatar}</span>)}
  </div>;
}

/**
 * The home hero: your most urgent race at a glance. Your place, how far you are from the lead (or ahead
 * of second), and a line with you between your neighbours. With no race of your own, it shows the
 * hottest open one with a button to join.
 */
export function RaceHero({ unit, now }: { unit: Unit; now: number }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const mine = useMyCompetitions();
  const trending = useDiscover('trending');
  const live = liveNow(mine.data, now).filter((table) => table.joined);
  const hot = trending.data?.pages[0]?.items[0];
  const featured = heroRace(live);
  const race = featured ?? (hot && { id: hot.id, code: hot.code, title: hot.title, challengeType: hot.challengeType, scoringMethod: hot.scoringMethod, scoringClosesAt: hot.scoringClosesAt, startsAt: hot.startsAt, entrants: hot.entrantCount ?? 0, type: hot.type });
  const joined = Boolean(featured);
  const standings = useStandings(race?.id, 60_000);
  const join = useMutation({
    mutationFn: () => post('/tables/join-many', { ids: [race!.id] }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast({ tone: 'ok', message: `You’re in ${race!.title}. Your next run counts.` });
    },
  });

  if (mine.isLoading || (!live.length && trending.isLoading)) return <Skeleton className="h-[176px] rounded-3xl" />;
  if (!race) return null;

  const rows = standings.data ?? [];
  const me = rows.find((row) => row.userId === user.id);
  const leader = rows[0];
  const method = race.scoringMethod;
  const ends = race.startsAt && new Date(race.startsAt).getTime() > now ? `Starts in ${formatCountdown(race.startsAt, now)}` : race.scoringClosesAt ? `${formatCountdown(race.scoringClosesAt, now)} left` : 'Open-ended';
  const myScore = me && hasScored(method, me.score) ? laneScore(me) : null;
  const second = rows[1] && hasScored(method, rows[1].score) ? laneScore(rows[1]) : null;
  const leaderScore = leader ? laneScore(leader) : null;

  // The number on the right: the gap that matters, orange when chasing and green when leading.
  let gap: { value: string; label: string; tone: string } | null = null;
  if (joined && me) {
    if (myScore === null) gap = { value: '–', label: 'No score yet', tone: 'text-ink' };
    else if (me.rank === 1) gap = second === null ? { value: 'Lead', label: 'Out in front', tone: 'text-ok' }
      : second === myScore ? { value: 'Level', label: `with ${firstName(rows[1].displayName)}`, tone: 'text-ink' }
        : { value: formatGap(race, second, myScore, unit) ?? '–', label: `ahead of ${firstName(rows[1].displayName)}`, tone: 'text-ok' };
    else if (leaderScore === myScore) gap = { value: 'Level', label: `with ${firstName(leader.displayName)}`, tone: 'text-ink' };
    else if (leaderScore !== null) gap = { value: formatGap(race, myScore, leaderScore, unit) ?? '–', label: `behind ${firstName(leader.displayName)}`, tone: 'text-track' };
  }

  // You and whoever's either side of you, placed by how close each is to the leader.
  const neighbours = me ? [rows[me.rank - 2], me, rows[me.rank]].filter((row): row is StandingRow => Boolean(row)) : [];
  const marks = neighbours.map((row) => ({
    key: row.userId, me: row.userId === user.id, at: hasScored(method, row.score) ? (row.rank === 1 ? 1 : lanePosition(method, row, leader)) : 0,
    avatar: <Avatar name={row.displayName} src={row.avatarUrl} avatarStyle={row.avatarStyle} size={26} className="rounded-full" />,
  }));
  const progress = !joined || !me || myScore === null ? 0 : me.rank === 1 ? 1 : lanePosition(method, me, leader);
  const open = () => void navigate({ to: '/competitions/$code', params: { code: race.code } });

  return <section role="link" tabIndex={0} onClick={open} onKeyDown={(event) => { if (event.key === 'Enter') open(); }}
    aria-label={`${race.title}, ${joined && me ? `${ordinal(me.rank)} of ${rows.length}` : `${race.entrants} in`}`}
    className={cx(SUMMARY_CARD, 'cursor-pointer rounded-3xl p-5 transition-colors hover:bg-ink/[0.02]')}>
    <div className="flex items-baseline gap-3">
      <p className="min-w-0 flex-1 truncate text-[17px] font-bold">{race.title}</p>
      <p className="num shrink-0 text-[13px] font-semibold text-ink-3">{ends}</p>
    </div>
    <div className="mt-3 flex items-end gap-3">
      <div className="flex-1">
        <p className="num text-[48px] font-bold leading-[52px] tracking-tight">{joined && me ? ordinal(me.rank) : race.entrants}</p>
        <p className="text-[13px] font-medium text-ink-3">{joined && me ? `of ${rows.length} ${rows.length === 1 ? 'runner' : 'runners'}` : race.entrants === 1 ? 'runner in' : 'runners in'}</p>
      </div>
      {gap && <div className="pb-0.5 text-right">
        <p className={cx('num truncate text-[24px] font-bold leading-7 tracking-tight', gap.tone)}>{gap.value}</p>
        <p className="truncate text-[13px] font-medium text-ink-3">{gap.label}</p>
      </div>}
    </div>
    {joined && marks.length > 0 && <RaceLine progress={progress} marks={marks} />}
    {!joined && <button type="button" disabled={join.isPending}
      onClick={(event) => { event.stopPropagation(); if (race.type === 'paid') open(); else join.mutate(); }}
      className="mt-5 flex h-12 w-full items-center justify-center rounded-full bg-ink text-[15px] font-bold text-paper transition-transform active:scale-[0.98] disabled:opacity-60">
      {race.type === 'paid' ? 'See entry' : join.isPending ? 'Joining…' : 'Join the race'}
    </button>}
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

type BoardRow = { rank: number; userId: string; metres: number; displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle; isMe: boolean };

/**
 * Under Go on Home: where you stand on this week's global board, the top three's faces, and the gap to
 * the runner just above you. Clicking opens the full leaderboard.
 */
export function LeaderboardPeek({ unit }: { unit: Unit }) {
  const board = useQuery({ queryKey: ['leaderboard', 'foot', 'week', 'global', 50], queryFn: () => api<{ rows: BoardRow[]; me: BoardRow | null }>('/leaderboard?activity=foot&period=week&scope=global&limit=50'), staleTime: 60_000 });
  const rows = board.data?.rows ?? [];
  const me = board.data?.me ?? null;
  const above = me ? rows.find((row) => row.rank === me.rank - 1) ?? null : null;
  const line = !board.data ? '\u00a0'
    : !me || !me.metres ? 'Walk or run this week to get on the board.'
      : me.rank === 1 ? 'You’re top of the world this week.'
        : above ? `${formatDistance(Math.max(0, above.metres - me.metres) + 10, unit)} to pass ${above.displayName.split(' ')[0]}`
          : 'Keep moving to climb.';
  return <Link to="/leaderboard" className="flex items-center gap-3 rounded-[20px] border-[1.5px] border-line bg-card p-3 transition-colors hover:border-ink" aria-label="Open the leaderboard">
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border-2 border-ink bg-volt px-1 text-ink">
      {me && me.metres ? <span className="score num truncate text-[22px]">#{me.rank}</span> : <LadderIcon size={22} />}
    </span>
    <span className="min-w-0 flex-1">
      <span className="wide block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Leaderboard · this week</span>
      <span className="mt-0.5 block truncate text-[14px] font-semibold">{line}</span>
    </span>
    <span className="flex">
      {rows.slice(0, 3).map((row, index) => <span key={row.userId} className={cx('rounded-full border-2 border-card', index > 0 && '-ml-2.5')}><Avatar name={row.displayName} src={row.avatarUrl} avatarStyle={row.avatarStyle} size={28} className="rounded-full" /></span>)}
    </span>
    <ChevronRightIcon size={16} className="text-ink-3" />
  </Link>;
}
