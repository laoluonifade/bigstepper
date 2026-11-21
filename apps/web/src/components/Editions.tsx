import { editionName, resultsPendingUntil } from '@jump/shared/competition';
import { formatDate, formatDateTime, ordinal } from '@jump/shared/format';
import { formatScore } from '@jump/shared/scoring';
import type { CompetitionEdition, CompetitionTable, MedalKind, Unit } from '@jump/shared/types';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../lib/api';
import { ChevronRightIcon } from './icons';
import { Avatar, ErrorNotice, Notice, SectionTitle, Skeleton } from './ui';

const MEDAL_EMOJI: Record<MedalKind, string> = { gold: '🥇', silver: '🥈', bronze: '🥉', completion: '🏅' };

/** Under a board that has ended but isn't final: late Apple Health syncs still count until results lock. */
export function ResultsPending({ table, now, className }: { table: CompetitionTable; now: number; className?: string }) {
  const until = resultsPendingUntil(table, now);
  if (!until) return null;
  return <Notice title="Checking the final results" className={className}>
    Steps that sync late from Apple Health still count until {formatDateTime(until.toISOString())}. Then the board locks and medals go out.
  </Notice>;
}

/** Every edition of a recurring competition, newest first, with who took the medals and how you did. */
export function EditionHistory({ table, seriesTitle, unit }: { table: CompetitionTable; seriesTitle?: string | null; unit: Unit }) {
  const [all, setAll] = useState(false);
  const editions = useQuery({
    queryKey: ['table-editions', table.id],
    queryFn: () => api<CompetitionEdition[]>(`/tables/${table.id}/editions`),
    enabled: Boolean(table.seriesId),
    staleTime: 60_000,
  });
  if (!table.seriesId) return null;
  const others = (editions.data ?? []).filter((edition) => edition.id !== table.id);
  if (editions.isSuccess && !others.length) return null;
  const shown = all ? others : others.slice(0, 6);
  return (
    <section>
      <SectionTitle aside={others.length ? <span className="text-[13px] text-ink-2">{others.length} {others.length === 1 ? 'edition' : 'editions'}</span> : undefined}>Past and upcoming</SectionTitle>
      {editions.isLoading ? <Skeleton className="h-40" />
        : editions.error ? <ErrorNotice error={editions.error} onRetry={() => void editions.refetch()} />
          : <ul className="divide-y divide-line rounded-xl border border-line bg-card px-4">
            {shown.map((edition) => <EditionRow key={edition.id} edition={edition} table={table} seriesTitle={seriesTitle} unit={unit} />)}
          </ul>}
      {others.length > 6 && (
        <button type="button" className="btn-quiet mt-3 w-full" onClick={() => setAll((value) => !value)}>
          {all ? 'Show fewer' : `See all ${others.length}`}
        </button>
      )}
    </section>
  );
}

function EditionRow({ edition, table, seriesTitle, unit }: { edition: CompetitionEdition; table: CompetitionTable; seriesTitle?: string | null; unit: Unit }) {
  const now = Date.now();
  const ended = edition.scoringClosesAt ? new Date(edition.scoringClosesAt).getTime() <= now : false;
  const upcoming = edition.startsAt ? new Date(edition.startsAt).getTime() > now : false;
  const status = edition.resultsFinalizedAt
    ? `${edition.entrants} took part${table.medalRule === 'completion' ? ` · ${edition.completed} finished` : ''}`
    : ended ? 'Checking results' : upcoming ? `Starts ${formatDate(edition.startsAt!)}` : `Live · ${edition.entrants} in`;
  const mine = edition.mine;
  return (
    <li>
      <Link to="/competitions/$code" params={{ code: edition.code }} className="flex items-center gap-3 py-3.5 hover:opacity-80">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-[15px] font-bold">{editionName(edition.title, seriesTitle)}</p>
          <p className="truncate text-[12px] text-ink-2">{status}</p>
          {edition.podium.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {edition.podium.map((winner) => (
                <span key={`${winner.rank}-${winner.username ?? winner.displayName}`} className="flex min-w-0 max-w-[48%] items-center gap-1.5 text-[12px] font-semibold">
                  <Avatar name={winner.displayName} src={winner.avatarUrl} avatarStyle={winner.avatarStyle} size={20} className="rounded-full" />
                  <span className="truncate">{winner.medal ? MEDAL_EMOJI[winner.medal] : ''} {winner.displayName}</span>
                </span>
              ))}
            </div>
          )}
          {mine && (
            <p className="truncate text-[12px] font-bold">
              {mine.medal === 'completion' ? '🏅 You finished it' : mine.medal ? `${MEDAL_EMOJI[mine.medal]} You came ${ordinal(mine.rank)}` : `You came ${ordinal(mine.rank)}`}
              {mine.score != null && mine.medal !== 'completion' ? ` · ${formatScore(table, mine.score, unit) ?? ''}` : ''}
            </p>
          )}
        </div>
        <ChevronRightIcon size={18} className="shrink-0 text-ink-3" />
      </Link>
    </li>
  );
}
