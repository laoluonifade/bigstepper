import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { formatCountdown, formatDateTime, formatDistance, formatMoney } from '../lib/format';
import type { ChallengeType, CompetitionTable, Unit } from '../lib/types';
import { ArrowRightIcon, LockIcon, UsersIcon } from './icons';
import { cx } from './ui';

export type CompetitionPhase = 'pending' | 'upcoming' | 'open' | 'entry-closed' | 'scoring-closed' | 'final';

export function ChallengeMark({ type, code, size = 46 }: { type: ChallengeType; code: string; size?: number }) {
  const palettes = ['bg-track', 'bg-volt', 'bg-medal-bronze', 'bg-medal-silver', 'bg-card'];
  const colour = palettes[[...code].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palettes.length];
  const symbol = {
    RUN: <><circle cx="26" cy="9" r="3" /><path d="m24 15-7 6 7 3 3 8m-3-17 8 4-3 6m-12-4-7 3m17 8 9 1" /></>,
    WALK: <><path d="M13 7c-2 7-3 14-3 20m8-18c1 7 2 13 5 19M8 32c4-2 7-1 9 3m6-2c4-2 7-1 9 2" /><circle cx="12" cy="5" r="1" /><circle cx="18" cy="6" r="1" /></>,
    DISTANCE: <><circle cx="9" cy="29" r="3" /><circle cx="31" cy="11" r="3" /><path d="M12 28c13 2 4-15 16-16M18 20l4 2m-9 9 2-5" /></>,
    STEP: <><path d="M5 29h8v-7h8v-7h8V8h7" /><path d="M6 34h29" /><circle cx="8" cy="12" r="2" /></>,
    TIMED: <><circle cx="20" cy="22" r="12" /><path d="M20 22V13m0 9 7 4M16 5h8M20 5v5" /></>,
  }[type];
  return <span className={cx('flex shrink-0 items-center justify-center rounded-[10px] border-2 border-ink text-ink shadow-hard-sm', colour)} style={{ width: size, height: size }} aria-label={`${type.toLowerCase()} challenge`}>
    <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">{symbol}</svg>
  </span>;
}

export function competitionPhase(table: CompetitionTable, now = Date.now()): CompetitionPhase {
  if (table.status === 'SETTLED') return 'final';
  if (table.status === 'PENDING_APPROVAL' || table.status === 'PENDING_FUNDING') return 'pending';
  const t = (iso: string | null) => (iso ? new Date(iso).getTime() : null);
  const starts = t(table.startsAt);
  const entryCloses = t(table.entryClosesAt);
  const scoringCloses = t(table.scoringClosesAt);
  if (scoringCloses !== null && now >= scoringCloses) return 'scoring-closed';
  if ((entryCloses !== null && now >= entryCloses) || (table.status !== 'OPEN_FOR_ENTRY' && table.status !== 'ACTIVE')) {
    return 'entry-closed';
  }
  if (starts !== null && now < starts) return 'upcoming';
  return 'open';
}

export function canEnter(table: CompetitionTable, now = Date.now()) {
  const phase = competitionPhase(table, now);
  return table.status === 'OPEN_FOR_ENTRY' && (phase === 'open' || phase === 'upcoming');
}

/** One short line describing where the competition is in its lifecycle. */
export function phaseLine(table: CompetitionTable, now = Date.now()): string {
  switch (competitionPhase(table, now)) {
    case 'pending':
      return table.status === 'PENDING_FUNDING' ? 'Prize funding needed' : 'Awaiting approval';
    case 'upcoming':
      return `Starts in ${formatCountdown(table.startsAt!, now)}`;
    case 'open':
      return table.entryClosesAt && table.entryClosesAt !== table.scoringClosesAt
        ? `Entry closes in ${formatCountdown(table.entryClosesAt, now)}`
        : table.scoringClosesAt
          ? `Ends in ${formatCountdown(table.scoringClosesAt, now)}`
          : 'Open';
    case 'entry-closed':
      return table.scoringClosesAt ? `Entry closed · ends in ${formatCountdown(table.scoringClosesAt, now)}` : 'Entry closed';
    case 'scoring-closed':
      return 'Scoring closed · result pending';
    case 'final':
      return 'Final result';
  }
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
      {phase === 'upcoming' ? 'Upcoming' : phase === 'open' ? 'Open' : phase === 'entry-closed' ? 'Entry closed' : phase === 'scoring-closed' ? 'Closed' : phase === 'final' ? 'Final' : 'Pending'}
    </span>
  );
}

/** The card's colour comes from the activity: runs orange, walks/steps volt, anything else ink. */
export function cardTheme(table: CompetitionTable) {
  if (table.challengeType === 'RUN') return { band: 'bg-track text-ink', accent: 'bg-ink' };
  if (table.challengeType === 'WALK' || table.challengeType === 'STEP') return { band: 'bg-volt text-ink', accent: 'bg-ink' };
  return { band: 'bg-ink text-paper', accent: 'bg-volt' };
}

/** The one big thing about a challenge, from its real settings. */
export function challengeHeadline(table: CompetitionTable, unit: Unit): { big: string; small: string } {
  if (table.guaranteedPrizeKobo) {
    const amount = prizeSplit(table.guaranteedPrizeKobo, table.platformFeeBps, table.creatorCommissionBps).winnerKobo;
    return { big: formatMoney(amount).replace(/\.00$/, ''), small: table.prizeSplitBps?.length > 1 ? `across top ${table.prizeSplitBps.length}` : 'to the winner' };
  }
  if ((table.scoringMethod === 'FASTEST_FIXED_DISTANCE' || table.scoringMethod === 'FASTEST_TIME') && table.targetDistanceMetres) {
    const value = unit === 'km' ? table.targetDistanceMetres / 1000 : table.targetDistanceMetres / 1609.344;
    const label = Number.isInteger(Math.round(value * 10) / 10) ? String(Math.round(value)) : value.toFixed(1);
    return { big: `${label}${unit === 'km' ? 'K' : ' MI'}`, small: `fastest ${table.challengeType === 'WALK' ? 'walk' : 'time'} wins` };
  }
  if (table.scoringMethod === 'MOST_STEPS') return { big: 'Steps', small: 'most steps wins' };
  return { big: 'Farthest', small: `most ${unit} wins` };
}

/** How far through its window a challenge is, 0–1, or null when it has no end. */
function progress(table: CompetitionTable, now: number) {
  if (!table.scoringClosesAt) return null;
  const start = new Date(table.startsAt ?? table.createdAt).getTime();
  const end = new Date(table.scoringClosesAt).getTime();
  if (end <= start) return null;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

export function CompetitionCard({ table, unit, now }: { table: CompetitionTable; unit: Unit; now: number }) {
  const theme = cardTheme(table);
  const hero = challengeHeadline(table, unit);
  const phase = competitionPhase(table, now);
  const live = phase === 'open';
  const done = progress(table, now);
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
            <span className="tag bg-paper text-ink">{table.challengeType === 'STEP' ? 'STEPS' : table.challengeType}</span>
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
          {table.creator?.displayName ? `Hosted by ${table.creator.displayName}` : 'Community challenge'}
          {table.distanceCapMetres ? ` · cap ${formatDistance(table.distanceCapMetres, unit)}/run` : ''}
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

/**
 * How a funded prize pot is paid out at settlement (mirrors the API's calculatePrizeBreakdown):
 * Jump's fee comes off the pot; paid creators also receive a commission from that fee.
 */
export function prizeSplit(potKobo: number, platformFeeBps: number, creatorCommissionBps: number) {
  const feeKobo = Math.floor((potKobo * platformFeeBps) / 10_000);
  const creatorKobo = Math.floor((potKobo * creatorCommissionBps) / 10_000);
  return { winnerKobo: potKobo - feeKobo, creatorKobo, jumpKobo: feeKobo - creatorKobo };
}
