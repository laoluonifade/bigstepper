import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityRow } from '../components/ActivityRow';
import { ChallengeMark } from '../components/competition';
import { InstallPrompt } from '../components/InstallPrompt';
import { RunIcon, ArrowRightIcon } from '../components/icons';
import { DivisionBadge, divisionRank, leagueZone, ZoneTag } from '../components/league';
import { MilestoneBadge } from '../components/Milestones';
import { WeekChart } from '../components/WeekChart';
import { CountUp, cx, EmptyState, ErrorNotice, Meter, Notice, SectionTitle, Segmented, Skeleton, useNow } from '../components/ui';
import { api, patch } from '../lib/api';
import { useUser } from '../lib/auth';
import { distanceValue, formatDistance, formatDistanceNumber, ordinal, toMetres } from '../lib/format';
import { setFlag, storageKeys, useStored } from '../lib/local';
import { ActivityKind, computeMilestones, computeStreaks, nextMilestone, ofKind, summariseWeek } from '../lib/progress';
import { keys, useActivities, useLeagues, useLeagueStandings, useMyLeagues, useProfile, useStandings, useUnit } from '../lib/queries';
import { useRecorder } from '../lib/recorder';
import type { Profile, Unit } from '../lib/types';
import { getDevVerifyToken, useResendVerification } from './auth';

function greeting(hour: number) {
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

export function DashboardPage() {
  const user = useUser();
  const profile = useProfile();
  const unit = useUnit();
  const activities = useActivities();
  const recorder = useRecorder();
  const now = useNow(60_000);
  const [showVerify] = useStored<boolean>(storageKeys.verifyPrompt(user.id), false);

  const [kind, setKind] = useStored<ActivityKind>(storageKeys.activityKind(user.id), 'all');
  const all = useMemo(() => activities.data ?? [], [activities.data]);
  const list = useMemo(() => ofKind(all, kind), [all, kind]);
  const week = useMemo(() => summariseWeek(list, new Date(now)), [list, now]);
  const streak = useMemo(() => computeStreaks(list, new Date(now)), [list, now]);
  const milestones = useMemo(() => computeMilestones(all, new Date(now)), [all, now]);
  const next = nextMilestone(milestones);
  const earned = milestones.filter((m) => m.earned).length;
  const name = profile.data?.displayName ?? user.displayName ?? 'runner';
  const live = recorder.phase === 'recording' || recorder.phase === 'paused';

  return (
    <div className="animate-rise">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">{new Date(now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="display text-[34px] sm:text-[44px]">
            {greeting(new Date(now).getHours())},
            <br className="sm:hidden" /> {name}.
          </h1>
        </div>
        <Link to="/run" className="btn-primary hidden min-h-12 px-6 md:inline-flex">
          <RunIcon size={16} />
          {live ? 'Back to your run' : 'Start a run'}
        </Link>
      </header>

      <InstallPrompt />
      {showVerify && !user.emailVerified && <VerifyPrompt userId={user.id} email={user.email} />}
      <ErrorNotice error={activities.error} onRetry={() => void activities.refetch()} className="mb-6" />

      <div className="mb-4">
        <KindFilter value={kind} onChange={setKind} />
      </div>

      <div className="stagger grid gap-4 lg:grid-cols-3">
        <WeekPanel userId={user.id} unit={unit} week={week} kind={kind} loading={activities.isLoading || profile.isLoading} />

        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <section className="panel-strong p-5" aria-labelledby="streak-title">
            <p id="streak-title" className="eyebrow">
              Streak
            </p>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="score text-[56px]">{activities.isLoading ? '–' : <CountUp value={streak.current} />}</span>
              <span className="text-[14px] font-semibold text-ink-2">{streak.current === 1 ? 'day' : 'days'}</span>
            </p>
            <StreakDots activities={list} now={now} />
            <p className="mt-3 text-[13px] text-ink-2">
              {streak.ranToday
                ? 'Today’s done. Come back tomorrow to keep it going.'
                : streak.current > 0
                  ? `Run today to make it ${streak.current + 1}.`
                  : 'Run today to start a streak.'}
              {streak.best > streak.current && ` Best: ${streak.best}.`}
            </p>
          </section>

          <section className="panel p-5" aria-labelledby="next-title">
            <div className="flex items-center justify-between">
              <p id="next-title" className="eyebrow">
                Next milestone
              </p>
              <span className="num text-[12px] font-semibold text-ink-2">
                {earned}/{milestones.length}
              </span>
            </div>
            {next ? (
              <div className="mt-3">
                <MilestoneBadge milestone={next} unit={unit} compact />
                <div className="mt-3">
                  <Meter value={next.progress} max={next.target} label={`${next.title} progress`} />
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[14px] font-semibold">Every milestone earned. Legendary.</p>
            )}
          </section>
        </div>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <YourTables userId={user.id} unit={unit} />
        <LeagueSummary unit={unit} />
      </div>

      <section className="mt-10">
        <SectionTitle
          aside={
            <Link to="/activities" className="link">
              All runs
            </Link>
          }
        >
          {kind === 'walk' ? 'Recent walks' : kind === 'run' ? 'Recent runs' : 'Recent activity'}
        </SectionTitle>
        {activities.isLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : list.length === 0 && kind !== 'all' ? (
          <EmptyState title={kind === 'walk' ? 'No walks yet' : 'No runs yet'}>
            Switch to All to see everything, or record a {kind}. Pick Walk or Run before you start.
          </EmptyState>
        ) : list.length === 0 ? (
          <EmptyState
            mark="0.00"
            title="No runs yet"
            action={
              <Link to="/run" className="btn-primary">
                <RunIcon size={16} /> Record your first run
              </Link>
            }
          >
            Your first verified run unlocks your first milestone.
          </EmptyState>
        ) : (
          <div>
            {list.slice(0, 4).map((activity) => (
              <ActivityRow key={activity.id} activity={activity} unit={unit} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <SectionTitle aside={`${earned} of ${milestones.length} earned`}>Milestones</SectionTitle>
        <div className="stagger grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {milestones.map((milestone) => (
            <MilestoneBadge key={milestone.id} milestone={milestone} unit={unit} />
          ))}
        </div>
        <p className="mt-3 text-[12px] text-ink-3">Milestones count verified distance only.</p>
      </section>
    </div>
  );
}

function VerifyPrompt({ userId, email }: { userId: string; email: string }) {
  const devToken = getDevVerifyToken();
  const resend = useResendVerification();
  return (
    <Notice
      tone="info"
      className="mb-6"
      title="Verify your email"
      action={
        <div className="flex flex-wrap gap-2">
          {devToken && (
            <Link to="/verify-email" search={{ token: devToken }} className="btn-secondary btn-sm">
              Development: verify now
            </Link>
          )}
          <button type="button" className="btn-secondary btn-sm" disabled={resend.isPending || resend.isSuccess} onClick={() => resend.mutate()}>
            {resend.isPending ? 'Sending…' : resend.isSuccess ? 'Sent' : 'Resend email'}
          </button>
          <button type="button" className="btn-quiet btn-sm" onClick={() => setFlag(storageKeys.verifyPrompt(userId), false)}>
            Dismiss
          </button>
        </div>
      }
    >
      We sent a link to {email}. You’ll need a verified email to enter paid competitions. Free competitions work without it.
      {resend.error && <span className="mt-1 block text-bad">{resend.error.message}</span>}
    </Notice>
  );
}

const GOAL_OPTIONS: Record<Unit, number[]> = { km: [10, 20, 30, 50], mi: [5, 10, 20, 30] };

export function KindFilter({ value, onChange }: { value: ActivityKind; onChange: (kind: ActivityKind) => void }) {
  return (
    <Segmented<ActivityKind>
      label="Show runs, walks or both"
      value={value}
      onChange={onChange}
      options={[
        { value: 'all', label: 'All' },
        { value: 'run', label: 'Runs' },
        { value: 'walk', label: 'Walks' },
      ]}
    />
  );
}

/** The goal lives on the profile, so it survives refreshes and follows the runner across devices. */
function useWeeklyGoal(userId: string) {
  const profile = useProfile();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (weeklyGoalMetres: number | null) => patch<Profile>('/me', { weeklyGoalMetres }),
    onMutate(weeklyGoalMetres) {
      queryClient.setQueryData<Profile>(keys.profile, (current) => (current ? { ...current, weeklyGoalMetres } : current));
    },
    onSuccess: (updated) => queryClient.setQueryData(keys.profile, updated),
    onError: () => void queryClient.invalidateQueries({ queryKey: keys.profile }),
  });

  // One-time move of a goal set before it was saved to the account.
  const [legacy] = useStored<number | null>(storageKeys.weeklyGoal(userId), null);
  const { mutate } = save;
  const needsMove = profile.data !== undefined && profile.data.weeklyGoalMetres === null && legacy !== null;
  useEffect(() => {
    if (!needsMove || legacy === null) return;
    mutate(Math.round(legacy));
    try {
      localStorage.removeItem(storageKeys.weeklyGoal(userId));
    } catch {
      /* storage unavailable */
    }
  }, [needsMove, legacy, mutate, userId]);

  return [profile.data?.weeklyGoalMetres ?? null, (metres: number) => mutate(Math.round(metres))] as const;
}

function WeekPanel({
  userId,
  unit,
  week,
  kind,
  loading,
}: {
  userId: string;
  unit: Unit;
  week: ReturnType<typeof summariseWeek>;
  kind: ActivityKind;
  loading: boolean;
}) {
  // No goal until the runner picks one — never show an invented target. It covers walks and runs together.
  const [savedGoal, setGoal] = useWeeklyGoal(userId);
  const goal = kind === 'all' ? savedGoal : null;
  const [editingGoal, setEditing] = useState(false);
  const editing = kind === 'all' && !loading && (editingGoal || goal === null);
  const reached = goal !== null && week.verifiedMetres >= goal;
  const remaining = goal === null ? 0 : Math.max(0, goal - week.verifiedMetres);

  return (
    <section className="panel-strong p-5 lg:col-span-2" aria-labelledby="week-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p id="week-title" className="eyebrow">
            This week · {kind === 'run' ? 'runs' : kind === 'walk' ? 'walks' : 'verified'}
          </p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="score text-[64px] sm:text-[76px]">{loading ? '–' : <CountUp value={week.verifiedMetres} format={(m) => formatDistanceNumber(m, unit)} />}</span>
            <span className="text-[15px] font-semibold text-ink-2">
              {goal === null ? unit : `/ ${formatDistanceNumber(goal, unit).replace(/\.0+$/, '')} ${unit}`}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="num text-[13px] font-semibold">
            {week.runs} {kind === 'all' ? (week.runs === 1 ? 'activity' : 'activities') : kind === 'walk' ? (week.runs === 1 ? 'walk' : 'walks') : week.runs === 1 ? 'run' : 'runs'}
          </p>
          {goal !== null && (
            <button type="button" className="mt-1 text-[12px] font-semibold text-ink-2 underline underline-offset-4 hover:text-ink" onClick={() => setEditing(!editingGoal)}>
              {editingGoal ? 'Done' : 'Change goal'}
            </button>
          )}
        </div>
      </div>

      {editing && goal === null && <p className="mt-3 text-[13px] font-semibold">Set a weekly goal</p>}
      {kind !== 'all' && savedGoal !== null && <p className="mt-3 text-[12px] text-ink-3">Your weekly goal counts walks and runs together. Switch to All to see it.</p>}
      {editing && (
        <div className="stagger mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Weekly goal">
          {GOAL_OPTIONS[unit].map((option) => {
            const metres = toMetres(option, unit);
            const active = goal !== null && Math.abs(distanceValue(goal, unit) - option) < 0.01;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setGoal(metres);
                  setEditing(false);
                }}
                className={cx('btn btn-sm border-[1.5px] border-ink', active ? 'bg-ink text-paper' : 'bg-card')}
              >
                {option} {unit}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4">
        {goal !== null && <Meter value={week.verifiedMetres} max={goal} label="Weekly goal progress" tone={reached ? 'ok' : 'track'} />}
        <p className="mt-2 text-[13px] text-ink-2">
          {goal === null ? null : reached ? (
            <span className="font-semibold text-ok">Weekly goal smashed. Anything more is a bonus.</span>
          ) : (
            <>
              <span className="font-semibold text-ink">{formatDistance(remaining, unit)}</span> to your weekly goal.
            </>
          )}
          {week.pendingMetres > 0 && ` ${formatDistance(week.pendingMetres, unit)} still verifying.`}
        </p>
      </div>

      <div className="mt-6">
        <WeekChart days={week.days} unit={unit} />
      </div>
    </section>
  );
}

function StreakDots({ activities, now }: { activities: ReturnType<typeof useActivities>['data'] & object; now: number }) {
  const days = useMemo(() => {
    const ran = new Set(
      activities
        .filter((a) => a.verificationStatus !== 'REJECTED' && a.recordedDistanceMetres >= 500)
        .map((a) => new Date(a.startedAt).toDateString()),
    );
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(now);
      date.setDate(date.getDate() - (6 - i));
      return { ran: ran.has(date.toDateString()), today: i === 6, label: date.toLocaleDateString('en-GB', { weekday: 'narrow' }) };
    });
  }, [activities, now]);
  return (
    <div className="mt-3 flex gap-1.5" aria-label="Last seven days">
      {days.map((day, index) => (
        <div key={index} className="flex flex-col items-center gap-1">
          <span
            className={cx(
              'h-6 w-6 rounded-sm',
              day.ran ? 'bg-track' : day.today ? 'border-[1.5px] border-dashed border-ink' : 'bg-ink/10',
            )}
            title={day.ran ? 'Ran' : 'Rest'}
          />
          <span className={cx('text-[10px] font-bold', day.today ? 'text-ink' : 'text-ink-3')}>{day.label}</span>
        </div>
      ))}
    </div>
  );
}

interface MyChallenge {
  id: string;
  code: string;
  title: string;
  hosting: boolean;
  joined: boolean;
  status: string;
  challengeType: 'WALK' | 'RUN' | 'DISTANCE' | 'STEP' | 'TIMED';
}

function YourTables({ userId, unit }: { userId: string; unit: Unit }) {
  // From the API, so challenges you created or joined on any device show up.
  const mine = useQuery({ queryKey: ['tables', 'mine'], queryFn: () => api<MyChallenge[]>('/tables/mine') });
  const tables = mine.data ?? [];
  return (
    <section>
      <SectionTitle
        aside={
          <Link to="/competitions" className="link">
            Find competitions
          </Link>
        }
      >
        Your competitions
      </SectionTitle>
      {mine.isLoading ? (
        <Skeleton className="h-20" />
      ) : tables.length === 0 ? (
        <EmptyState
          title="No competitions yet"
          action={
            <Link to="/competitions" className="btn-secondary">
              Browse competitions
            </Link>
          }
        >
          Join a competition and every verified run moves you up the standings.
        </EmptyState>
      ) : (
        <ul className="stagger space-y-2">
          {tables.slice(0, 4).map((table) => (
            <TableStandingRow key={table.id} table={table} userId={userId} unit={unit} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TableStandingRow({ table, userId, unit }: { table: MyChallenge; userId: string; unit: Unit }) {
  const standings = useStandings(table.id);
  const rows = standings.data ?? [];
  const me = rows.find((row) => row.userId === userId);
  const above = me ? rows.find((row) => row.rank === me.rank - 1) : undefined;
  return (
    <li>
      <Link
        to="/competitions/$code"
        params={{ code: table.code }}
        className="flex items-center gap-4 rounded-md border border-line bg-card px-4 py-3 hover:border-ink"
      >
        <ChallengeMark type={table.challengeType} code={table.code} size={48} />
        <div className="min-w-0 flex-1">
          <p className="wide truncate text-[14px] font-extrabold uppercase">
            {table.title}
            {table.hosting && <span className="tag ml-2 h-5 border-ink bg-volt px-1.5 align-middle text-[9.5px]">{table.status === 'PENDING_FUNDING' ? 'Draft' : 'Hosting'}</span>}
          </p>
          <p className="num text-[12px] text-ink-2">
            {table.status === 'PENDING_FUNDING' ? 'Not live · fund the fixed amount to open entry' : standings.isLoading
              ? 'Loading standings…'
              : me
                ? `${ordinal(me.rank)} of ${rows.length} · ${formatDistance(me.creditedDistanceMetres, unit)}`
                : `${rows.length} ${rows.length === 1 ? 'runner' : 'runners'}${table.hosting && !table.joined ? ' · you’re hosting' : ''}`}
          </p>
          {above && me && (
            <p className="text-[12px] font-semibold text-ink">
              {formatDistance(Math.max(0, above.creditedDistanceMetres - me.creditedDistanceMetres), unit)} to take {ordinal(above.rank)}
            </p>
          )}
        </div>
        <ArrowRightIcon size={18} className="shrink-0" />
      </Link>
    </li>
  );
}

function LeagueSummary({ unit }: { unit: Unit }) {
  const leagues = useLeagues();
  const mine = useMyLeagues();
  const active = leagues.data?.seasons.find((season) => season.status === 'ACTIVE');
  const membership = mine.data?.find((item) => item.seasonId === active?.id);
  const standings = useLeagueStandings(membership ? active?.id : undefined);
  const division = leagues.data?.divisions.find((item) => item.id === membership?.divisionId);
  const position = membership && standings.data ? divisionRank(standings.data, membership) : null;
  const zone =
    membership && position?.rank
      ? leagueZone(position.rank, position.size, membership.creditedDistanceMetres, division, leagues.data?.divisions ?? [], leagues.data?.rules)
      : null;

  return (
    <section>
      <SectionTitle
        aside={
          <Link to="/leagues" className="link">
            Leagues
          </Link>
        }
      >
        League
      </SectionTitle>
      {leagues.isLoading || mine.isLoading ? (
        <Skeleton className="h-24" />
      ) : !active ? (
        <EmptyState title="No active season">The next league season hasn’t started yet.</EmptyState>
      ) : !membership ? (
        <EmptyState title={`${active.name}`}>You’re not placed in this season’s league yet.</EmptyState>
      ) : (
        <Link
          to="/leagues/$id"
          params={{ id: active.id }}
          className="flex items-center gap-4 rounded-md border border-line bg-card px-4 py-4 hover:border-ink"
        >
          <DivisionBadge division={division} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">{active.name}</p>
            <p className="wide mt-1 text-[18px] font-extrabold uppercase">{division?.name ?? 'Division'} division</p>
            <p className="num text-[13px] text-ink-2">
              {position?.rank ? `${ordinal(position.rank)} of ${position.size}` : 'Ranking…'} · {formatDistance(membership.creditedDistanceMetres, unit)}
            </p>
          </div>
          {zone && <span className="hidden sm:block"><ZoneTag zone={zone} /></span>}
          <ArrowRightIcon size={18} className="shrink-0" />
        </Link>
      )}
      <p className="mt-3 text-[12px] text-ink-3">Verified walk and run distance this season counts toward your league.</p>
    </section>
  );
}
