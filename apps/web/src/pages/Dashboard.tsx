import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ActivityRow } from '../components/ActivityRow';
import { RunIcon, ArrowRightIcon } from '../components/icons';
import { DivisionBadge, divisionRank } from '../components/league';
import { RankBadge } from '../components/Leaderboard';
import { MilestoneBadge } from '../components/Milestones';
import { WeekChart } from '../components/WeekChart';
import { cx, EmptyState, ErrorNotice, Meter, Notice, SectionTitle, Skeleton, useNow } from '../components/ui';
import { useUser } from '../lib/auth';
import { distanceValue, formatDistance, formatDistanceNumber, ordinal, toMetres } from '../lib/format';
import { SavedTable, setFlag, storageKeys, useStored } from '../lib/local';
import { computeMilestones, computeStreaks, nextMilestone, summariseWeek } from '../lib/progress';
import { useActivities, useLeagues, useLeagueStandings, useMyLeagues, useProfile, useStandings, useUnit } from '../lib/queries';
import { useRecorder } from '../lib/recorder';
import type { Unit } from '../lib/types';
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

  const list = useMemo(() => activities.data ?? [], [activities.data]);
  const week = useMemo(() => summariseWeek(list, new Date(now)), [list, now]);
  const streak = useMemo(() => computeStreaks(list, new Date(now)), [list, now]);
  const milestones = useMemo(() => computeMilestones(list, new Date(now)), [list, now]);
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

      {showVerify && !user.emailVerified && <VerifyPrompt userId={user.id} email={user.email} />}
      <ErrorNotice error={activities.error} onRetry={() => void activities.refetch()} className="mb-6" />

      <div className="grid gap-4 lg:grid-cols-3">
        <WeekPanel userId={user.id} unit={unit} week={week} loading={activities.isLoading} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <section className="panel-strong p-5" aria-labelledby="streak-title">
            <p id="streak-title" className="eyebrow">
              Streak
            </p>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="score text-[56px]">{activities.isLoading ? '–' : streak.current}</span>
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
          Recent runs
        </SectionTitle>
        {activities.isLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
      We sent a link to {email}. You’ll need a verified email to enter paid competitions — free tables work without it.
      {resend.error && <span className="mt-1 block text-bad">{resend.error.message}</span>}
    </Notice>
  );
}

const GOAL_OPTIONS: Record<Unit, number[]> = { km: [10, 20, 30, 50], mi: [5, 10, 20, 30] };

function WeekPanel({
  userId,
  unit,
  week,
  loading,
}: {
  userId: string;
  unit: Unit;
  week: ReturnType<typeof summariseWeek>;
  loading: boolean;
}) {
  const [goal, setGoal] = useStored<number>(storageKeys.weeklyGoal(userId), 20000);
  const [editing, setEditing] = useState(false);
  const reached = week.verifiedMetres >= goal;
  const remaining = Math.max(0, goal - week.verifiedMetres);

  return (
    <section className="panel-strong p-5 lg:col-span-2" aria-labelledby="week-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p id="week-title" className="eyebrow">
            This week · verified
          </p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="score text-[64px] sm:text-[76px]">{loading ? '–' : formatDistanceNumber(week.verifiedMetres, unit)}</span>
            <span className="text-[15px] font-semibold text-ink-2">
              / {formatDistanceNumber(goal, unit).replace(/\.0+$/, '')} {unit}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="num text-[13px] font-semibold">
            {week.runs} {week.runs === 1 ? 'run' : 'runs'}
          </p>
          <button type="button" className="mt-1 text-[12px] font-semibold text-ink-2 underline underline-offset-4 hover:text-ink" onClick={() => setEditing(!editing)}>
            {editing ? 'Done' : 'Change goal'}
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Weekly goal">
          {GOAL_OPTIONS[unit].map((option) => {
            const metres = toMetres(option, unit);
            const active = Math.abs(distanceValue(goal, unit) - option) < 0.01;
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
        <Meter value={week.verifiedMetres} max={goal} label="Weekly goal progress" tone={reached ? 'ok' : 'track'} />
        <p className="mt-2 text-[13px] text-ink-2">
          {reached ? (
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

function YourTables({ userId, unit }: { userId: string; unit: Unit }) {
  const [tables] = useStored<SavedTable[]>(storageKeys.tables(userId), []);
  return (
    <section>
      <SectionTitle
        aside={
          <Link to="/competitions" className="link">
            Find tables
          </Link>
        }
      >
        Your tables
      </SectionTitle>
      {tables.length === 0 ? (
        <EmptyState
          title="No tables yet"
          action={
            <Link to="/competitions" className="btn-secondary">
              Browse tables
            </Link>
          }
        >
          Join a table and every verified run moves you up the standings.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {tables.slice(0, 4).map((table) => (
            <TableStandingRow key={table.id} table={table} userId={userId} unit={unit} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TableStandingRow({ table, userId, unit }: { table: SavedTable; userId: string; unit: Unit }) {
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
        {me ? <RankBadge rank={me.rank} size="lg" /> : <span className="score flex h-12 w-12 items-center justify-center text-[24px] text-ink-3">–</span>}
        <div className="min-w-0 flex-1">
          <p className="wide truncate text-[14px] font-extrabold uppercase">{table.title}</p>
          <p className="num text-[12px] text-ink-2">
            {standings.isLoading
              ? 'Loading standings…'
              : me
                ? `${ordinal(me.rank)} of ${rows.length} · ${formatDistance(me.creditedDistanceMetres, unit)}`
                : `${rows.length} runners`}
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
          <ArrowRightIcon size={18} className="shrink-0" />
        </Link>
      )}
      <p className="mt-3 text-[12px] text-ink-3">League distance crediting isn’t live yet, so league standings may not move with your runs.</p>
    </section>
  );
}
