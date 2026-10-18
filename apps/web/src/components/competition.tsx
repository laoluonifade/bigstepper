import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { formatCountdown, formatDateTime, formatDistance, formatMoney } from '../lib/format';
import type { CompetitionTable, Unit } from '../lib/types';
import { ArrowRightIcon, LockIcon, UsersIcon } from './icons';
import { cx } from './ui';

export type CompetitionPhase = 'pending' | 'upcoming' | 'open' | 'entry-closed' | 'scoring-closed' | 'final';

export function competitionPhase(table: CompetitionTable, now = Date.now()): CompetitionPhase {
  if (table.status === 'SETTLED') return 'final';
  if (table.status === 'PENDING_APPROVAL') return 'pending';
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
      return 'Awaiting approval';
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

export function CompetitionCard({ table, unit, now }: { table: CompetitionTable; unit: Unit; now: number }) {
  return (
    <Link
      to="/competitions/$code"
      params={{ code: table.code }}
      className="group flex flex-col rounded-md border-[1.5px] border-ink bg-card transition-[transform,box-shadow] duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hard"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <TypeTag table={table} />
        <PhaseTag table={table} now={now} />
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5">
        <h3 className="wide line-clamp-2 text-[19px] font-extrabold uppercase leading-[1.05]">{table.title}</h3>
        <p className="mt-1.5 text-[13px] text-ink-2">
          {table.creator?.displayName ? `Hosted by ${table.creator.displayName}` : 'Community table'}
        </p>
        {table.type === 'paid' && table.guaranteedPrizeKobo ? (
          <p className="mt-3 text-[13px]">
            <span className="text-ink-2">Guaranteed prize </span>
            <span className="font-bold">{formatMoney(table.guaranteedPrizeKobo)}</span>
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-[12px] font-semibold text-ink-2">
          <span className="text-ink">{phaseLine(table, now)}</span>
          {table.capacity && (
            <span className="inline-flex items-center gap-1">
              <UsersIcon size={14} />
              {table.capacity} max
            </span>
          )}
          {table.distanceCapMetres && <span>Cap {formatDistance(table.distanceCapMetres, unit)}/run</span>}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
        <span className="font-mono text-[12px] tracking-[0.12em] text-ink-2">{table.code}</span>
        <ArrowRightIcon size={18} className="transition-transform group-hover:translate-x-0.5" />
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
