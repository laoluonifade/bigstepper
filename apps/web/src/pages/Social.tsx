import { Link, useParams } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ArrowRightIcon } from '../components/icons';
import { DivisionBadge, divisionRank, leagueZone, OUTCOME_LABEL, rulesLine, ZoneTag } from '../components/league';
import { Leaderboard } from '../components/Leaderboard';
import {
  cx,
  EmptyState,
  ErrorNotice,
  Notice,
  PageHeader,
  SectionTitle,
  Skeleton,
  SubNav,
  useNow,
} from '../components/ui';
import { useAuth } from '../lib/auth';
import { formatCountdown, formatDate, formatDistance, ordinal } from '../lib/format';
import { useLeagues, useLeagueStandings, useMyLeagues, useUnit } from '../lib/queries';
import { YOU_NAV } from './You';

/* ───────────────────────── Leagues ───────────────────────── */

export function LeaguesPage() {
  const leagues = useLeagues();
  const unit = useUnit();
  const now = useNow(60_000);
  const seasons = leagues.data?.seasons ?? [];
  const divisions = [...(leagues.data?.divisions ?? [])].sort((a, b) => b.level - a.level);
  const active = seasons.find((season) => season.status === 'ACTIVE');

  return (
    <div className="animate-rise">
      <SubNav items={[...YOU_NAV]} />
      <PageHeader
        eyebrow="You"
        title="My league"
        description="Your monthly ranking. Verified walk and run distance places you in your division. Only signed-in runners can see it."
      />
      <LastSeasonResult />
      <ErrorNotice error={leagues.error} onRetry={() => void leagues.refetch()} />
      {leagues.isLoading ? (
        <Skeleton className="h-64" />
      ) : !active ? (
        <EmptyState title="No active season">The next season hasn’t started yet.</EmptyState>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="panel-strong overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-4 bg-ink px-5 py-5 text-paper">
              <div>
                <p className="eyebrow text-paper/60">Current season</p>
                <h2 className="display mt-1 text-[28px]">{active.name}</h2>
                <p className="num mt-1 text-[13px] text-paper/70">
                  {formatDate(active.startsAt)} – {formatDate(active.endsAt, { year: 'numeric' })}
                </p>
              </div>
              <div className="text-right">
                <p className="eyebrow text-paper/60">Ends in</p>
                <p className="score num mt-1 text-[32px] text-volt">{formatCountdown(active.endsAt, now)}</p>
              </div>
            </div>
            <MyDivision seasonId={active.id} unit={unit} />
            <div className="border-t border-line px-5 py-4">
              <Link to="/leagues/$id" params={{ id: active.id }} className="btn-secondary">
                Full standings <ArrowRightIcon size={16} />
              </Link>
            </div>
          </section>

          <aside>
            <SectionTitle>Divisions</SectionTitle>
            <ol className="stagger space-y-2">
              {divisions.map((division) => (
                <li key={division.id} className="flex items-center gap-3 rounded-md border border-line bg-card px-3 py-2.5">
                  <DivisionBadge division={division} />
                  <span className="wide flex-1 text-[14px] font-extrabold uppercase">{division.name}</span>
                  <span className="num text-[12px] text-ink-3">Level {division.level}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-2">
              {rulesLine(leagues.data?.rules)} Everyone starts in {divisions[divisions.length - 1]?.name ?? 'the bottom division'}.
            </p>
          </aside>
        </div>
      )}

      {seasons.filter((season) => season.id !== active?.id).length > 0 && (
        <section className="mt-10">
          <SectionTitle>Other seasons</SectionTitle>
          <ul className="stagger divide-y divide-line">
            {seasons
              .filter((season) => season.id !== active?.id)
              .map((season) => (
                <li key={season.id}>
                  <Link to="/leagues/$id" params={{ id: season.id }} className="flex items-center justify-between py-3 hover:text-track-deep">
                    <span className="font-semibold">{season.name}</span>
                    <span className="num text-[13px] text-ink-2">
                      {formatDate(season.startsAt)} – {formatDate(season.endsAt, { year: 'numeric' })}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MyDivision({ seasonId, unit }: { seasonId: string; unit: 'km' | 'mi' }) {
  const leagues = useLeagues();
  const mine = useMyLeagues();
  const membership = mine.data?.find((item) => item.seasonId === seasonId);
  const standings = useLeagueStandings(membership ? seasonId : undefined);
  const division = leagues.data?.divisions.find((item) => item.id === membership?.divisionId);
  const position = membership && standings.data ? divisionRank(standings.data, membership) : null;
  const zone =
    membership && position?.rank
      ? leagueZone(position.rank, position.size, membership.creditedDistanceMetres, division, leagues.data?.divisions ?? [], leagues.data?.rules)
      : null;

  if (mine.isLoading) return <Skeleton className="m-5 h-20" />;
  if (!membership) return <p className="p-5 text-[14px] text-ink-2">You haven’t been placed in this season yet.</p>;
  return (
    <div className="flex flex-wrap items-center gap-5 p-5">
      <DivisionBadge division={division} size="lg" />
      <div className="flex-1">
        <p className="eyebrow">Your division</p>
        <p className="wide mt-1 text-[22px] font-black uppercase">{division?.name ?? 'Division'}</p>
        {zone && <div className="mt-2"><ZoneTag zone={zone} /></div>}
      </div>
      <div className="text-right">
        <p className="score num text-[40px]">{position?.rank ? ordinal(position.rank) : '–'}</p>
        <p className="num text-[12px] text-ink-2">
          of {position?.size ?? '–'} · {formatDistance(membership.creditedDistanceMetres, unit)}
        </p>
      </div>
    </div>
  );
}

/** The runner's result from the most recent finished season, if they took part. */
function LastSeasonResult() {
  const leagues = useLeagues();
  const mine = useMyLeagues();
  const unit = useUnit();
  const seasons = leagues.data?.seasons ?? [];
  const last = mine.data
    ?.filter((item) => item.outcome)
    .map((item) => ({ item, season: seasons.find((season) => season.id === item.seasonId) }))
    .filter((entry) => entry.season?.status === 'FINALIZED')
    .sort((a, b) => new Date(b.season!.endsAt).getTime() - new Date(a.season!.endsAt).getTime())[0];
  if (!last || !last.item.outcome) return null;
  const division = leagues.data?.divisions.find((item) => item.id === last.item.divisionId);
  return (
    <Notice
      tone={last.item.outcome === 'PROMOTED' ? 'ok' : last.item.outcome === 'RELEGATED' ? 'warn' : 'info'}
      className="mb-6"
      title={`${last.season!.name}: ${OUTCOME_LABEL[last.item.outcome]}`}
    >
      You finished {last.item.finalRank ? ordinal(last.item.finalRank) : '-'} in {division?.name ?? 'your division'} with{' '}
      {formatDistance(last.item.creditedDistanceMetres, unit)}.{' '}
      <Link to="/leagues/$id" params={{ id: last.item.seasonId }} className="link text-ink">
        Final standings
      </Link>
    </Notice>
  );
}

export function LeagueDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { user } = useAuth();
  const unit = useUnit();
  const leagues = useLeagues();
  const standings = useLeagueStandings(id);
  const season = leagues.data?.seasons.find((item) => item.id === id);
  const divisions = [...(leagues.data?.divisions ?? [])].sort((a, b) => b.level - a.level);
  const myDivisionId = standings.data?.find((row) => row.userId === user?.id)?.divisionId;
  const [picked, setPicked] = useState<string | null>(null);
  const divisionId = picked ?? myDivisionId ?? divisions[divisions.length - 1]?.id;

  const rows = useMemo(
    () =>
      (standings.data ?? [])
        .filter((row) => row.divisionId === divisionId)
        .map((row, index) => ({
          rank: index + 1,
          userId: row.userId,
          name: row.displayName ?? (row.username ? `@${row.username}` : row.userId === user?.id ? 'You' : 'Runner'),
          avatarUrl: row.avatarUrl,
          avatarStyle: row.avatarStyle,
          username: row.username,
          metres: row.creditedDistanceMetres,
        })),
    [divisionId, standings.data, user],
  );

  return (
    <div className="animate-rise">
      <PageHeader back={{ to: '/leagues', label: 'My league' }} eyebrow="League standings" title={season?.name ?? 'Season'} />
      <div className="-mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex min-w-max gap-2" role="tablist" aria-label="Division">
          {divisions.map((division) => {
            const active = division.id === divisionId;
            return (
              <button
                key={division.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPicked(division.id)}
                className={cx(
                  'flex items-center gap-2 rounded border-[1.5px] py-1.5 pl-1.5 pr-3 text-[13px] font-bold',
                  active ? 'border-ink bg-ink text-paper' : 'border-line bg-card hover:border-ink-3',
                )}
              >
                <DivisionBadge division={division} />
                {division.name}
                {division.id === myDivisionId && <span className="text-[10px] uppercase tracking-[0.1em] text-volt">You</span>}
              </button>
            );
          })}
        </div>
      </div>
      <ErrorNotice error={standings.error} onRetry={() => void standings.refetch()} />
      {standings.isLoading || leagues.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <Leaderboard
          rows={rows}
          currentUserId={user?.id}
          unit={unit}
          limit={100}
          caption={
            season?.status === 'FINALIZED'
              ? 'Final standings. Verified distance only.'
              : `Verified distance only. ${rulesLine(leagues.data?.rules)}`
          }
          empty={<EmptyState title="Nobody in this division yet" />}
        />
      )}
    </div>
  );
}
