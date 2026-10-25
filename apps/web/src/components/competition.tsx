import { canEnter, challengeHeadline, competitionPhase, phaseLine, prizeLabel, windowProgress } from '@jump/shared/competition';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useId, useState } from 'react';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';
import { formatCountdown, formatDateTime, formatDistance, formatMoney } from '../lib/format';
import { activityLabel, formatScore, metricOf, towardLeader, winsLabel } from '../lib/scoring';
import type { AvatarStyle, ChallengeType, CompetitionTable, Unit } from '../lib/types';
import { ArrowRightIcon, ChevronRightIcon, LockIcon, UsersIcon } from './icons';
import { METALS } from './Milestones';
import { Avatar, cx } from './ui';

export { canEnter, challengeHeadline, competitionPhase, phaseLine, prizeLabel, prizeSplit, windowProgress, type CompetitionPhase } from '@jump/shared/competition';

/**
 * A 3D tile for the competition type, in the same metals as the milestone medals: a thick base edge,
 * a bevelled face with gloss, and an embossed symbol. The metal is picked from the code, so each
 * competition keeps its colour.
 */
export function ChallengeMark({ type, code, size = 46 }: { type: ChallengeType; code: string; size?: number }) {
  const uid = useId().replace(/:/g, '');
  const metals = [METALS.flame, METALS.volt, METALS.bronze, METALS.silver, METALS.gold];
  const metal = metals[[...code].reduce((sum, char) => sum + char.charCodeAt(0), 0) % metals.length];
  const symbol = {
    RUN: <><circle cx="26" cy="9" r="3" /><path d="m24 15-7 6 7 3 3 8m-3-17 8 4-3 6m-12-4-7 3m17 8 9 1" /></>,
    CYCLING: <><circle cx="9" cy="29" r="6" /><circle cx="31" cy="29" r="6" /><path d="m9 29 7-15 7 15H9l9-10h5l8 10m-13-15h5m-9-4h5" /></>,
    WALK: <><path d="M13 7c-2 7-3 14-3 20m8-18c1 7 2 13 5 19M8 32c4-2 7-1 9 3m6-2c4-2 7-1 9 2" /><circle cx="12" cy="5" r="1" /><circle cx="18" cy="6" r="1" /></>,
    DISTANCE: <><circle cx="9" cy="29" r="3" /><circle cx="31" cy="11" r="3" /><path d="M12 28c13 2 4-15 16-16M18 20l4 2m-9 9 2-5" /></>,
    STEP: <><path d="M5 29h8v-7h8v-7h8V8h7" /><path d="M6 34h29" /><circle cx="8" cy="12" r="2" /></>,
    TIMED: <><circle cx="20" cy="22" r="12" /><path d="M20 22V13m0 9 7 4M16 5h8M20 5v5" /></>,
  }[type];
  return <span className="medal-earned relative inline-block shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${type.toLowerCase()} competition`}>
    <svg viewBox="0 0 64 64" width={size} height={size} className="overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={`trim-${uid}`} x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stopColor={metal.rim[0]} /><stop offset="1" stopColor={metal.rim[1]} /></linearGradient>
        <radialGradient id={`tface-${uid}`} cx="0.3" cy="0.25" r="0.9"><stop offset="0" stopColor={metal.face[0]} /><stop offset="1" stopColor={metal.face[1]} /></radialGradient>
        <linearGradient id={`tgloss-${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.7" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <clipPath id={`tclip-${uid}`}><rect x="9" y="7" width="46" height="46" rx="11" /></clipPath>
      </defs>
      {/* Ink outline and hard drop keep it on-brand; the base edge gives it thickness. */}
      <rect x="4" y="6" width="58" height="58" rx="15" fill="#121212" />
      <rect x="2" y="2" width="58" height="58" rx="15" fill="#121212" />
      <rect x="4" y="4" width="54" height="54" rx="13" fill={metal.edge} />
      <rect x="4" y="2.5" width="54" height="52" rx="13" fill={`url(#trim-${uid})`} />
      <rect x="9" y="7" width="46" height="46" rx="11" fill={metal.edge} opacity="0.5" />
      <rect x="9" y="7.8" width="46" height="45.2" rx="11" fill={`url(#tface-${uid})`} />
      <g transform="translate(14 13) scale(0.9)" fill="none" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter">
        <g stroke="#fff" strokeOpacity="0.55" transform="translate(0.8 1)">{symbol}</g>
        <g stroke={metal.ink}>{symbol}</g>
      </g>
      <g clipPath={`url(#tclip-${uid})`}>
        <ellipse cx="24" cy="12" rx="26" ry="10" fill={`url(#tgloss-${uid})`} transform="rotate(-18 24 12)" />
        <rect className="medal-shine" x="-30" y="0" width="12" height="64" fill="#fff" opacity="0.4" transform="skewX(-20)" />
      </g>
    </svg>
  </span>;
}

export function TypeTag({ table }: { table: CompetitionTable }) {
  if (table.type === 'paid') {
    return <span className="tag border-ink bg-ink text-paper">Paid · {formatMoney(table.entryFeeKobo)}</span>;
  }
  if (table.type === 'sponsored') return <span className="tag border-ink bg-volt text-ink">Free · funded prize</span>;
  return <span className="tag border-ink bg-card text-ink">Free</span>;
}

export function PhaseTag({ table, now }: { table: CompetitionTable; now?: number }) {
  const phase = competitionPhase(table, now);
  const live = phase === 'open' || phase === 'upcoming';
  return (
    <span
      className={cx(
        'tag',
        live && 'border-ok/60 bg-ok-wash text-ok',
        phase === 'entry-closed' && 'border-warn/60 bg-warn-wash text-warn',
        (phase === 'scoring-closed' || phase === 'pending') && 'border-line bg-card text-ink-2',
        phase === 'final' && 'border-ink bg-volt text-ink',
      )}
    >
      {live && <span className="h-1.5 w-1.5 animate-blink rounded-full bg-current" aria-hidden="true" />}
      {phase === 'upcoming' ? 'Upcoming' : phase === 'open' ? 'Open' : phase === 'entry-closed' ? 'Entry closed' : phase === 'scoring-closed' ? (table.type === 'free' ? 'Ended' : 'Closed') : phase === 'final' ? 'Final' : 'Pending'}
    </span>
  );
}

/** The card's colour comes from the activity: runs orange, walks/steps volt, anything else ink. */
export function cardTheme(table: CompetitionTable) {
  if (table.challengeType === 'RUN') return { band: 'bg-track text-ink', accent: 'bg-ink' };
  if (table.challengeType === 'WALK' || table.challengeType === 'STEP') return { band: 'bg-volt text-ink', accent: 'bg-ink' };
  return { band: 'bg-ink text-paper', accent: 'bg-volt' };
}

/** One row in a competition list: tile, title, what wins, who's in, time left, prize. Sits inside a bordered list. */
export function CompetitionRow({ table, unit, now }: { table: CompetitionTable; unit: Unit; now: number }) {
  const hero = challengeHeadline(table, unit);
  const prize = prizeLabel(table, unit);
  const wins = `${activityLabel(table.challengeType)} · ${winsLabel(table, unit)}${hero.big.startsWith('₦') ? ` · ${hero.small.replace(/^to the winner$/, 'winner takes it')}` : ''}`;
  return <Link to="/competitions/$code" params={{ code: table.code }} className="group flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-ink/[0.025]">
    <ChallengeMark type={table.challengeType} code={table.code} size={40} />
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-1.5 text-[14px] font-semibold leading-tight">
        <span className="truncate">{table.title}</span>
        {table.visibility === 'private' && <LockIcon size={12} className="shrink-0 text-ink-3" />}
      </p>
      <p className="mt-0.5 truncate text-[12px] text-ink-2">{wins}</p>
      <p className="num mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-0.5"><UsersIcon size={12} />{table.entrantCount ?? 0}{table.capacity ? `/${table.capacity}` : ''}</span>
        <span aria-hidden="true">·</span>
        <span className="truncate">{phaseLine(table, now)}</span>
      </p>
    </div>
    <div className="flex shrink-0 flex-col items-end gap-1">
      <span className={cx('num rounded-md px-2 py-0.5 text-[12px] font-bold', prize.prize ? 'bg-ok-wash text-ok' : table.type === 'paid' ? 'bg-ink text-paper' : 'bg-ink/[0.06] text-ink-2')}>{prize.text}</span>
      <ChevronRightIcon size={15} className="text-ink-3 transition-transform group-hover:translate-x-0.5" />
    </div>
  </Link>;
}

function boardScore(table: CompetitionTable, score: number, unit: Unit) {
  return formatScore(table, score, unit, { short: metricOf(table.scoringMethod).display === 'steps' }) ?? '';
}

function Face({ face, size = 28, ring }: { face: { displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle }; size?: number; ring?: string }) {
  return <Avatar name={face.displayName} src={face.avatarUrl} avatarStyle={face.avatarStyle} size={size} className={cx('rounded-full ring-2', ring ?? 'ring-card')} />;
}

/**
 * A competition card built to make you want in: what's at stake, the race itself (runners placed along a
 * track by score), who's in, how long is left, and one tap to join a free one.
 */
export function CompetitionPreviewCard({ table, unit, now }: { table: CompetitionTable; unit: Unit; now: number }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [joined, setJoined] = useState(false);
  const hero = challengeHeadline(table, unit);
  const cash = hero.big.startsWith('₦');
  // Activity first, so you know what to go and do: "Walk · First to 50 km".
  const rules = `${activityLabel(table.challengeType)} · ${winsLabel(table, unit)}${cash ? ` · ${hero.small.replace(/^to the winner$/, 'winner takes it')}` : ''}`;
  const leaders = table.leaders ?? [];
  const faces = table.faces ?? [];
  const leader = leaders[0];
  const entrants = table.entrantCount ?? 0;
  const myRank = table.myRank ?? null;
  const inIt = joined || myRank !== null;
  const phase = competitionPhase(table, now);
  const endsMs = table.scoringClosesAt ? new Date(table.scoringClosesAt).getTime() - now : null;
  const urgent = phase === 'open' && endsMs !== null && endsMs < 24 * 3_600_000;
  const when = phase === 'upcoming' ? `Starts in ${formatCountdown(table.startsAt!, now)}` : endsMs === null ? 'No end date' : `${formatCountdown(table.scoringClosesAt!, now)} left`;
  const canJoin = Boolean(user) && !inIt && table.type !== 'paid' && canEnter(table, now) && (!table.capacity || entrants < table.capacity);
  const join = useMutation({
    mutationFn: () => post(`/tables/${table.id}/register-free`),
    onSuccess() {
      setJoined(true);
      toast({ tone: 'ok', message: `You’re in ${table.title}. Your next run counts.` });
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
    },
  });

  return <article className="group relative overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card px-4 pb-3.5 pt-4 transition-shadow hover:shadow-hard-sm">
    {/* The host's banner, when there is one: a slim strip across the top; the card below is unchanged. */}
    {table.bannerUrl && <img src={table.bannerUrl} alt="" loading="lazy" className="-mx-4 -mt-4 mb-3.5 block aspect-[3/1] w-[calc(100%+2rem)] max-w-none bg-ink/5 object-cover" />}
    <Link to="/competitions/$code" params={{ code: table.code }} className="absolute inset-0 rounded-2xl" aria-label={`Open ${table.title}`} />

    <div className="flex items-start gap-3">
      <ChallengeMark type={table.challengeType} code={table.code} size={40} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[16px] font-bold leading-snug tracking-tight">
          <span className="truncate">{table.title}</span>
          {table.visibility === 'private' && <LockIcon size={13} className="shrink-0 text-ink-3" />}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-ink-3">{rules}</p>
      </div>
      <p className="shrink-0 pt-0.5 text-right">
        {cash ? <span className="num text-[17px] font-extrabold tracking-tight">{hero.big}</span>
          : table.type === 'paid' ? <span className="num text-[14px] font-bold">{formatMoney(table.entryFeeKobo).replace(/\.00$/, '')}</span>
            : <span className="text-[13px] font-semibold text-ink-3">Free</span>}
      </p>
    </div>

    {/* The race: everyone who's scored, placed along the track against the leader. */}
    <div className="relative mt-3 h-8">
      <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-ink/[0.07]" aria-hidden="true" />
      <span className="absolute bottom-1.5 right-[6%] top-1.5 border-l-[1.5px] border-dashed border-ink/25" aria-hidden="true" />
      {leaders.length
        ? [...leaders].reverse().map((runner) => <span key={runner.rank} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${6 + (leader ? towardLeader(table.scoringMethod, runner.score, leader.score) : 0) * 88}%` }} title={`${runner.displayName} · ${boardScore(table, runner.score, unit)}`}>
          <Face face={runner} size={26} ring={myRank === runner.rank ? 'ring-volt' : 'ring-card'} />
        </span>)
        : <span className="absolute left-0 top-1/2 flex -translate-y-1/2 -space-x-2">{faces.slice(0, 4).map((face, index) => <Face key={index} face={face} size={24} />)}</span>}
    </div>

    <div className="mt-2 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] text-ink-2">
          {leader ? <><span className="font-semibold text-ink">{leader.displayName.split(' ')[0]}</span> leads · <span className="num font-semibold text-ink">{boardScore(table, leader.score, unit)}</span></>
            : entrants ? 'On the start line. First run leads.' : 'Nobody’s in yet. Be first.'}
        </p>
        <p className="num mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-ink-3">
          <span className="inline-flex items-center gap-1"><UsersIcon size={12} />{entrants}{table.capacity ? `/${table.capacity}` : ''}</span>
          <span aria-hidden="true">·</span>
          <span className={cx('truncate', urgent && 'font-semibold text-bad')}>{when}</span>
        </p>
      </div>
      {inIt
        ? <span className="relative shrink-0 rounded-full border-[1.5px] border-ink px-3 py-1 text-[12px] font-bold">{myRank ? `You’re #${myRank}` : 'You’re in'}</span>
        : canJoin
          ? <button type="button" onClick={() => join.mutate()} disabled={join.isPending} className="relative h-9 shrink-0 rounded-full bg-ink px-5 text-[13px] font-bold text-paper transition-transform active:scale-95 disabled:opacity-60">{join.isPending ? 'Joining…' : 'Join'}</button>
          : <span className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-bold">{table.type === 'paid' ? 'Enter' : 'View'}<ChevronRightIcon size={15} /></span>}
    </div>
  </article>;
}

/** A card for horizontal rails on the home screen. */
export function TrendingCard({ table, unit, now }: { table: CompetitionTable; unit: Unit; now: number }) {
  const theme = cardTheme(table);
  const hero = challengeHeadline(table, unit);
  return <Link to="/competitions/$code" params={{ code: table.code }} className="group flex w-[230px] shrink-0 snap-start flex-col overflow-hidden rounded-md border-[1.5px] border-ink bg-card shadow-hard transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none">
    <div className={cx('flex items-end justify-between gap-2 px-3 pb-2.5 pt-3', theme.band)}>
      <div className="min-w-0">
        <p className="score truncate text-[30px] uppercase leading-[0.85]">{hero.big}</p>
        <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.1em] opacity-75">{hero.small}</p>
      </div>
      <ChallengeMark type={table.challengeType} code={table.code} size={38} />
    </div>
    <div className="flex flex-1 flex-col px-3 py-2.5">
      <p className="wide line-clamp-2 text-[13px] font-extrabold uppercase leading-tight">{table.title}</p>
      <p className="num mt-auto flex items-center justify-between gap-2 pt-2 text-[12px] font-semibold text-ink-2">
        <span className="inline-flex items-center gap-1"><UsersIcon size={13} />{table.entrantCount ?? 0} in</span>
        <span className="truncate">{phaseLine(table, now).replace(/^Ends in /, '')}</span>
      </p>
    </div>
  </Link>;
}

export function CompetitionCard({ table, unit, now }: { table: CompetitionTable; unit: Unit; now: number }) {
  const theme = cardTheme(table);
  const hero = challengeHeadline(table, unit);
  const phase = competitionPhase(table, now);
  const live = phase === 'open';
  const done = windowProgress(table, now);
  const joined = table.entrantCount ?? null;

  return (
    <Link
      to="/competitions/$code"
      params={{ code: table.code }}
      className="group flex flex-col overflow-hidden rounded-md border-[1.5px] border-ink bg-card transition-[transform,box-shadow] duration-150 ease-out hover:-translate-x-1 hover:-translate-y-1 hover:shadow-hard active:translate-x-0 active:translate-y-0 active:shadow-none"
    >
      {/* Colour band with the headline figure */}
      <div className={cx('relative overflow-hidden px-4 pb-4 pt-3', theme.band)}>
        <div className="relative z-10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <TypeTag table={table} />
            <span className="tag bg-paper text-ink">{activityLabel(table.challengeType)}</span>
          </div>
          <PhaseTag table={table} now={now} />
        </div>
        <div className="relative z-10 mt-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="score truncate text-[46px] uppercase leading-[0.85] transition-transform duration-300 ease-out group-hover:-translate-y-0.5">
              {hero.big}
            </p>
            <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.12em] opacity-75">{hero.small}</p>
          </div>
          <ChallengeMark type={table.challengeType} code={table.code} />
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5">
        <h3 className="wide line-clamp-2 text-[17px] font-extrabold uppercase leading-[1.05]">{table.title}</h3>
        <p className="mt-1 truncate text-[13px] text-ink-2">
          {table.creator?.displayName ? `Hosted by ${table.creator.displayName}` : 'Community competition'}
          {table.distanceCapMetres ? ` · cap ${formatDistance(table.distanceCapMetres, unit)}/activity` : ''}
        </p>

        <div className="mt-auto pt-4">
          {done !== null && (
            <div className="relative mb-2 h-1.5 rounded-full bg-ink/10" aria-hidden="true">
              <div className="h-full origin-left animate-grow-x rounded-full bg-ink" style={{ width: `${done * 100}%` }} />
              {phase !== 'scoring-closed' && phase !== 'final' && (
                <span className="absolute top-1/2 -ml-1.5 h-3 w-3 -translate-y-1/2" style={{ left: `${done * 100}%` }}>
                  {live && <span className={cx('absolute inset-0 animate-ring rounded-full', theme.accent)} />}
                  <span className="relative block h-full w-full rounded-full border-2 border-card bg-ink" />
                </span>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px] font-semibold">
            <span className="text-ink">{phaseLine(table, now)}</span>
            <span className="inline-flex items-center gap-1 text-ink-2">
              <UsersIcon size={14} />
              {joined !== null ? `${joined} joined` : ''}
              {table.capacity ? `${joined !== null ? ' / ' : ''}${table.capacity} max` : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
        <span className="font-mono text-[12px] tracking-[0.12em] text-ink-2">{table.code}</span>
        <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-2 transition-colors group-hover:text-ink">
          {canEnter(table, now) ? 'Join' : 'View'}
          <ArrowRightIcon size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}

/** Start → entry closes → scoring ends, with the present marked on the track. */
export function Timeline({ table, now }: { table: CompetitionTable; now: number }) {
  const merged = !table.entryClosesAt || table.entryClosesAt === table.scoringClosesAt;
  const stops = [
    { label: 'Starts', at: table.startsAt },
    ...(merged ? [] : [{ label: 'Entry closes', at: table.entryClosesAt }]),
    { label: merged ? 'Entry & scoring close' : 'Scoring ends', at: table.scoringClosesAt },
  ];
  const times = stops.map((stop) => (stop.at ? new Date(stop.at).getTime() : null));
  const first = times[0];
  const last = times[times.length - 1];
  const progress =
    first !== null && last !== null && last > first ? Math.min(1, Math.max(0, (now - first) / (last - first))) : now >= (last ?? Infinity) ? 1 : 0;

  return (
    <div>
      <div className="relative mx-2 h-6">
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-ink/10" />
        <div className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 bg-ink" style={{ width: `${progress * 100}%` }} />
        {stops.map((stop, index) => {
          const reached = times[index] !== null && now >= times[index]!;
          const left = stops.length === 1 ? 0 : (index / (stops.length - 1)) * 100;
          return (
            <span
              key={stop.label}
              className={cx(
                'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 border-2 border-ink',
                reached ? 'bg-ink' : 'bg-card',
              )}
              style={{ left: `${left}%` }}
            />
          );
        })}
        {progress > 0 && progress < 1 && (
          <span
            className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-track"
            style={{ left: `${progress * 100}%` }}
            title="Now"
          />
        )}
      </div>
      <div className={cx('mt-2 grid gap-2 text-[12px]', stops.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {stops.map((stop, index) => (
          <div key={stop.label} className={cx(index === stops.length - 1 && 'text-right', index === 1 && stops.length === 3 && 'text-center')}>
            <p className="font-bold uppercase tracking-[0.06em] text-ink-2">{stop.label}</p>
            <p className="num mt-0.5 font-semibold">{formatDateTime(stop.at)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LockedNotice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[13px] text-ink-2">
      <LockIcon size={14} />
      {children}
    </p>
  );
}
