import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowRightIcon, PlusIcon } from '../components/icons';
import { DivisionBadge, divisionRank, leagueZone, OUTCOME_LABEL, rulesLine, ZoneTag } from '../components/league';
import { Leaderboard } from '../components/Leaderboard';
import {
  Avatar,
  CopyButton,
  cx,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Notice,
  PageHeader,
  SectionTitle,
  Skeleton,
  SubNav,
  useNow,
} from '../components/ui';
import { api, isApiError, post } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import { formatCountdown, formatDate, formatDistance, ordinal } from '../lib/format';
import { rememberClub, SavedClub, storageKeys, useStored } from '../lib/local';
import { keys, useLeagues, useLeagueStandings, useMyLeagues, useUnit } from '../lib/queries';
import type { Club, ClubMember, ClubStanding } from '../lib/types';
import { CompeteSubNav } from './Competitions';
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

/* ───────────────────────── Clubs ───────────────────────── */

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Accepts `my-club`, `/my-club` or a pasted club link and returns the handle. */
function clubHandle(value: string) {
  return value.trim().toLowerCase().replace(/^.*\/clubs\//, '').replace(/^\/+|\/+$/g, '');
}

function runnerHandle(value: string) {
  return value.trim().toLowerCase().replace(/^.*\/runners\//, '').replace(/^@/, '');
}

export function ClubsPage() {
  const user = useUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [clubs] = useStored<SavedClub[]>(storageKeys.clubs(user.id), []);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [lookup, setLookup] = useState('');
  const effectiveSlug = slugTouched ? slug : slugify(name);
  const slugError = effectiveSlug && !/^[a-z0-9-]{3,40}$/.test(effectiveSlug) ? '3–40 characters: lowercase letters, numbers and dashes.' : undefined;

  const create = useMutation({
    mutationFn: () => post<Club>('/clubs', { name: name.trim(), slug: effectiveSlug }),
    onSuccess(club) {
      rememberClub(user.id, { id: club.id, name: club.name, slug: club.slug });
      queryClient.setQueryData(keys.club(club.slug), { ...club, memberCount: 1 });
      void navigate({ to: '/clubs/$id', params: { id: club.slug } });
    },
  });

  function open(event: FormEvent) {
    event.preventDefault();
    const handle = clubHandle(lookup);
    if (handle) void navigate({ to: '/clubs/$id', params: { id: handle } });
  }

  return (
    <div className="animate-rise">
      <CompeteSubNav />
      <PageHeader eyebrow="Compete" title="Clubs" description="Run with your crew. Start a club and add members by their username." />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <SectionTitle>Your clubs</SectionTitle>
          {clubs.length === 0 ? (
            <EmptyState title="No clubs yet">Clubs you create or open on this device appear here.</EmptyState>
          ) : (
            <ul className="stagger space-y-2">
              {clubs.map((club) => (
                <li key={club.id}>
                  <Link to="/clubs/$id" params={{ id: club.slug }} className="flex items-center gap-4 rounded-md border border-line bg-card px-4 py-3 hover:border-ink">
                    <Avatar name={club.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="wide truncate text-[15px] font-extrabold uppercase">{club.name}</p>
                      <p className="text-[12px] text-ink-2">/{club.slug}</p>
                    </div>
                    <ArrowRightIcon size={18} />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={open} className="mt-8">
            <Field label="Open a club" hint="Enter the club’s handle or paste its link.">
              {(props) => (
                <div className="flex gap-2">
                  <input {...props} className="field" value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="lagos-road-runners" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                  <button className="btn-dark shrink-0" disabled={!clubHandle(lookup)} aria-label="Open club">
                    <ArrowRightIcon size={18} />
                  </button>
                </div>
              )}
            </Field>
          </form>
        </section>

        <section>
          <SectionTitle>Start a club</SectionTitle>
          <form
            className="panel space-y-4 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!slugError) create.mutate();
            }}
          >
            <Field label="Club name">
              {(props) => <input {...props} className="field" minLength={3} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} required />}
            </Field>
            <Field label="Club handle" error={slugError} hint="Lowercase, used in links. Can’t be changed later.">
              {(props) => (
                <input
                  {...props}
                  className="field font-mono text-[14px]"
                  maxLength={40}
                  value={effectiveSlug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setSlug(event.target.value.toLowerCase());
                  }}
                  required
                />
              )}
            </Field>
            <ErrorNotice error={create.error} />
            <button className="btn-primary w-full" disabled={create.isPending || name.trim().length < 3 || Boolean(slugError) || !effectiveSlug}>
              <PlusIcon size={16} /> {create.isPending ? 'Creating…' : 'Create club'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

export function ClubDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { user } = useAuth();
  const unit = useUnit();
  const queryClient = useQueryClient();
  const club = useQuery({ queryKey: keys.club(id), queryFn: () => api<Club>(`/clubs/${id}`) });
  const members = useQuery({ queryKey: keys.clubMembers(id), queryFn: () => api<ClubMember[]>(`/clubs/${id}/members`) });
  const board = useQuery({ queryKey: ['club', id, 'leaderboard'], queryFn: () => api<ClubStanding[]>(`/clubs/${id}/leaderboard`), enabled: Boolean(members.data?.some((member) => member.userId === user?.id)) });
  const [memberHandle, setMemberHandle] = useState('');
  const me = members.data?.find((member) => member.userId === user?.id);
  const canManage = me?.role === 'owner' || me?.role === 'admin';

  const add = useMutation({
    mutationFn: () => post<ClubMember>(`/clubs/${id}/members`, { username: runnerHandle(memberHandle) }),
    onSuccess() {
      setMemberHandle('');
      void queryClient.invalidateQueries({ queryKey: keys.clubMembers(id) });
      void queryClient.invalidateQueries({ queryKey: keys.club(id) });
    },
  });

  useEffect(() => {
    if (user && me && club.data) rememberClub(user.id, { id: club.data.id, name: club.data.name, slug: club.data.slug });
  }, [club.data, me, user]);

  if (club.isLoading) return <Loading />;
  if (club.error || !club.data) {
    return (
      <>
        <PageHeader back={{ to: '/clubs', label: 'Clubs' }} title="Club not found" />
        {isApiError(club.error, 404) ? <EmptyState title="No club with that handle" /> : <ErrorNotice error={club.error} onRetry={() => void club.refetch()} />}
      </>
    );
  }

  return (
    <div className="animate-rise">
      <PageHeader back={{ to: '/clubs', label: 'Clubs' }} eyebrow={`/${club.data.slug}`} title={club.data.name} />
      {canManage && (
        <Link to="/competitions/new" search={{ club: club.data.id }} className="btn-primary mb-6">
          <PlusIcon size={16} /> Start a competition · invite members
        </Link>
      )}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <div className="mb-8">
            <SectionTitle aside="This month">Club leaderboard</SectionTitle>
            <ErrorNotice error={board.error} onRetry={() => void board.refetch()} />
            {board.isLoading ? <Skeleton className="h-40" /> : board.data ? (
              <Leaderboard
                rows={board.data.map((row) => ({ rank: row.rank, userId: row.userId, name: row.displayName, username: row.username, avatarUrl: row.avatarUrl, metres: row.monthMetres }))}
                currentUserId={user?.id}
                unit={unit}
                caption="Verified running distance since the start of this month."
                empty={<EmptyState title="No activity this month" />}
              />
            ) : <Notice tone="neutral">Join this club to see its monthly leaderboard.</Notice>}
          </div>
          <SectionTitle aside={`${club.data.memberCount ?? members.data?.length ?? 0} members`}>Members</SectionTitle>
          <ErrorNotice error={members.error} />
          {members.isLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <ul className="stagger divide-y divide-line border-b border-line">
              {members.data?.map((member) => {
                const isMe = member.userId === user?.id;
                const name = member.displayName ?? (member.username ? `@${member.username}` : isMe ? 'You' : 'Runner');
                return (
                  <li key={member.id} className={cx('flex items-center gap-3 px-2 py-3', isMe && 'bg-volt')}>
                    <Avatar name={name} src={member.avatarUrl} highlight={isMe} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">
                        {name}
                        {isMe && <span className="tag ml-2 h-5 border-ink bg-ink px-1.5 text-[9.5px] text-volt">You</span>}
                      </p>
                      <p className="truncate text-[12px] text-ink-2">
                        {member.username && <>@{member.username} · </>}Joined {formatDate(member.joinedAt, { year: 'numeric' })}
                      </p>
                    </div>
                    {member.role !== 'member' && <span className="tag border-ink bg-card">{member.role}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <section className="panel p-5">
            <p className="eyebrow mb-2">Club handle</p>
            <p className="wide break-all text-[18px] font-extrabold">/{club.data.slug}</p>
            <p className="hint">Share the link so runners can find this club.</p>
            <CopyButton value={`${window.location.origin}/clubs/${club.data.slug}`} label="Copy link" className="mt-3" />
          </section>

          {canManage ? (
            <section className="panel-strong p-5">
              <p className="eyebrow mb-3">Add a member</p>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  add.mutate();
                }}
              >
                <Field label="Runner username" hint="Runners find it under You → Profile.">
                  {(props) => (
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">@</span>
                      <input
                        {...props}
                        className="field pl-8"
                        value={memberHandle}
                        onChange={(event) => setMemberHandle(event.target.value)}
                        placeholder="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        required
                      />
                    </div>
                  )}
                </Field>
                {add.isSuccess && <Notice tone="ok">Member added.</Notice>}
                <ErrorNotice error={add.error} />
                <button className="btn-secondary w-full" disabled={add.isPending || !runnerHandle(memberHandle)}>
                  {add.isPending ? 'Adding…' : 'Add member'}
                </button>
              </form>
              <p className="mt-4 text-[12px] text-ink-3">Invitations aren’t available yet, so members are added directly by username.</p>
            </section>
          ) : (
            !me && user && (
              <Notice tone="neutral" title="Want in?">
                Send a club admin your username from You → Profile. Join requests aren’t available yet.
              </Notice>
            )
          )}
        </aside>
      </div>
    </div>
  );
}
