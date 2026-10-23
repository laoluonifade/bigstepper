import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityRow } from '../components/ActivityRow';
import { ChallengeSomeone, MyCompetitions, RaceHero } from '../components/CompeteHome';
import { InstallPrompt } from '../components/InstallPrompt';
import { RunIcon, ArrowRightIcon, CheckIcon, ChevronDownIcon, FlameIcon } from '../components/icons';
import { EmojiPopover } from '../components/EmojiPopover';
import { DivisionBadge, divisionRank, leagueZone, ZoneTag } from '../components/league';
import { MilestoneBadge } from '../components/Milestones';
import { WeekChart } from '../components/WeekChart';
import { CountUp, cx, EmptyState, ErrorNotice, Meter, Notice, SectionTitle, Segmented, Skeleton, Stat, useNow } from '../components/ui';
import { patch } from '../lib/api';
import { useUser } from '../lib/auth';
import { distanceValue, formatDistance, formatDistanceNumber, formatDuration, formatPace, ordinal, toMetres } from '../lib/format';
import { storageKeys, useStored } from '../lib/local';
import { ActivityKind, computeMilestones, computeStreaks, countsForStreak, creditedMetres, isVerified, nextMilestone, ofKind, summariseWeek } from '../lib/progress';
import { keys, useActivities, useLeagues, useLeagueStandings, useMyLeagues, useProfile, useUnit } from '../lib/queries';
import { useRecorder } from '../lib/recorder';
import type { Activity, Profile, Unit } from '../lib/types';
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

  const [kind, setKind] = useStored<ActivityKind>(storageKeys.activityKind(user.id), 'all');
  const all = useMemo(() => activities.data ?? [], [activities.data]);
  const list = useMemo(() => ofKind(all, kind), [all, kind]);
  const footActivities = useMemo(() => list.filter((activity) => activity.activityType !== 'cycle'), [list]);
  const week = useMemo(() => summariseWeek(footActivities, new Date(now)), [footActivities, now]);
  // Any walk, run or ride keeps the streak, whatever the filter above shows.
  const streak = useMemo(() => computeStreaks(all, new Date(now)), [all, now]);
  const milestones = useMemo(() => computeMilestones(all.filter((activity) => activity.activityType !== 'cycle'), new Date(now)), [all, now]);
  const next = nextMilestone(milestones);
  const earned = milestones.filter((m) => m.earned).length;
  const name = profile.data?.displayName ?? user.displayName ?? 'runner';
  const live = recorder.phase === 'recording' || recorder.phase === 'paused';

  return (
    <div className="animate-rise">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink-3">{new Date(now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="mt-0.5 truncate text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]">{greeting(new Date(now).getHours())}, {name.split(' ')[0]}</h1>
        </div>
        <Link to="/run" className="btn-dark hidden min-h-10 px-5 md:inline-flex">
          <RunIcon size={16} />
          {live ? 'Back to your run' : 'Start a run'}
        </Link>
      </header>

      {!user.emailVerified && <VerifyPrompt email={user.email} />}
      <ErrorNotice error={activities.error} onRetry={() => void activities.refetch()} className="mb-6" />

      {/* Competition first: the race, your other races, the leaderboard, then your own training. */}
      <div className="mx-auto max-w-2xl space-y-8">
        <RaceHero unit={unit} now={now} />
        <MyCompetitions unit={unit} now={now} />
        <ChallengeSomeone />
      </div>

      <div className="mt-8"><InstallPrompt /></div>

      <div className="mb-4 mt-12 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold tracking-tight">Your training</h2>
        <KindFilter value={kind} onChange={setKind} />
      </div>

      <div className="stagger grid gap-4 lg:grid-cols-3">
        <WeekPanel userId={user.id} unit={unit} week={week} kind={kind} activities={footActivities} now={now} loading={activities.isLoading || profile.isLoading} />

        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <section className="panel-strong p-5" aria-labelledby="streak-title">
            <p id="streak-title" className="eyebrow">
              Streak
            </p>
            <div className="mt-2 flex items-center gap-3">
              <FlameIcon
                size={44}
                className={cx(
                  'shrink-0 transition-colors',
                  streak.ranToday ? 'animate-flicker text-track drop-shadow-[0_2px_6px_rgba(255,77,18,0.45)]' : streak.atRisk ? 'text-track/35' : 'text-ink/15',
                )}
                aria-label={streak.ranToday ? 'Streak lit today' : streak.atRisk ? 'Streak at risk' : 'No streak'}
              />
              <p className="flex items-baseline gap-2">
                <span className="score text-[56px]">{activities.isLoading ? '–' : <CountUp value={streak.current} />}</span>
                <span className="text-[14px] font-semibold text-ink-2">{streak.current === 1 ? 'day' : 'days'}</span>
              </p>
            </div>
            <StreakDots activities={all} now={now} />
            <p className="mt-3 text-[13px] text-ink-2">
              {streak.ranToday
                ? 'Fire’s lit for today. Move again tomorrow to keep it burning.'
                : streak.atRisk
                  ? `Move today or your ${streak.current}-day streak goes out at midnight.`
                  : 'Walk, run or ride today to light your streak.'}
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

      <div className="mt-10">
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

function VerifyPrompt({ email }: { email: string }) {
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
        </div>
      }
    >
      Confirm that you own {email} using the verification link. You’ll need a verified email to enter paid competitions. Free competitions work without it.
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
  activities,
  now,
  loading,
}: {
  userId: string;
  unit: Unit;
  week: ReturnType<typeof summariseWeek>;
  kind: ActivityKind;
  activities: Activity[];
  now: number;
  loading: boolean;
}) {
  const [period, setPeriod] = useStored<Period>(`jump_dashboard_period:${userId}`, 'week');
  // No goal until the runner picks one — never show an invented target. It covers walks and runs together.
  const [savedGoal, setGoal] = useWeeklyGoal(userId);
  const goal = kind === 'all' ? savedGoal : null;
  const [editingGoal, setEditing] = useState(false);
  const editing = kind === 'all' && !loading && (editingGoal || goal === null);
  const reached = goal !== null && week.verifiedMetres >= goal;
  const remaining = goal === null ? 0 : Math.max(0, goal - week.verifiedMetres);

  if (period !== 'week') {
    return (
      <section className="panel-strong p-5 lg:col-span-2" aria-labelledby="week-title">
        <PeriodTotals id="week-title" period={period} onPeriod={setPeriod} activities={activities} kind={kind} unit={unit} now={now} loading={loading} />
      </section>
    );
  }

  return (
    <section className="panel-strong p-5 lg:col-span-2" aria-labelledby="week-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p id="week-title" className="eyebrow flex items-center gap-1">
            <PeriodPicker period={period} onChange={setPeriod} now={now} /> · {kind === 'run' ? 'runs' : kind === 'walk' ? 'walks' : 'verified'}
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
                className={cx('wide h-9 rounded-md border-[1.5px] border-ink px-4 text-[12px] font-extrabold uppercase transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none', active ? 'bg-ink text-paper' : 'bg-card shadow-hard-sm hover:bg-track-wash')}
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

type Period = 'week' | 'month' | 'all';

/** Verified totals for this month or all time: distance, count, time moving, longest and average pace. */
/** The panel's eyebrow doubles as the period menu: "This week ▾". */
function PeriodPicker({ period, onChange, now }: { period: Period; onChange: (period: Period) => void; now: number }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const labels: Record<Period, string> = { week: 'This week', month: new Date(now).toLocaleDateString('en-GB', { month: 'long' }), all: 'All time' };
  return <>
    <button ref={anchor} type="button" className="eyebrow inline-flex items-center gap-1 rounded-full text-ink underline decoration-ink/30 decoration-2 underline-offset-4 hover:decoration-ink" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
      {labels[period]}<ChevronDownIcon size={13} className={cx('transition-transform', open && 'rotate-180')} />
    </button>
    {open && <EmojiPopover anchor={anchor} label="Choose a period" width={180} height={140} onClose={() => setOpen(false)}>
      <div role="menu">
        {(['week', 'month', 'all'] as const).map((value) => <button key={value} type="button" role="menuitemradio" aria-checked={period === value} className={cx('flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold normal-case tracking-normal', period === value ? 'bg-ink/[0.06]' : 'hover:bg-ink/[0.04]')} onClick={() => { onChange(value); setOpen(false); }}>
          {value === 'month' ? `This month` : labels[value]}{period === value && <CheckIcon size={15} className="text-track" />}
        </button>)}
      </div>
    </EmojiPopover>}
  </>;
}

function PeriodTotals({ id, period, onPeriod, activities, kind, unit, now, loading }: { id: string; period: Exclude<Period, 'week'>; onPeriod: (period: Period) => void; activities: Activity[]; kind: ActivityKind; unit: Unit; now: number; loading: boolean }) {
  const totals = useMemo(() => {
    const today = new Date(now);
    const from = period === 'month' ? new Date(today.getFullYear(), today.getMonth(), 1).getTime() : 0;
    const counted = activities.filter((activity) => isVerified(activity) && new Date(activity.startedAt).getTime() >= from);
    const metres = counted.reduce((sum, activity) => sum + creditedMetres(activity), 0);
    const seconds = counted.reduce((sum, activity) => sum + (activity.movingSeconds || activity.elapsedSeconds), 0);
    const longest = counted.reduce((max, activity) => Math.max(max, creditedMetres(activity)), 0);
    const first = counted.reduce<string | null>((earliest, activity) => (!earliest || activity.startedAt < earliest ? activity.startedAt : earliest), null);
    return { metres, seconds, longest, count: counted.length, first };
  }, [activities, period, now]);
  const noun = kind === 'walk' ? 'walks' : kind === 'run' ? 'runs' : 'activities';
  const pace = formatPace(totals.metres, totals.seconds, unit);

  return <>
    <p id={id} className="eyebrow flex items-center gap-1"><PeriodPicker period={period} onChange={onPeriod} now={now} /> · {kind === 'all' ? 'verified' : noun}</p>
    <p className="mt-2 flex items-baseline gap-2">
      <span className="score text-[64px] sm:text-[76px]">{loading ? '–' : <CountUp value={totals.metres} format={(m) => formatDistanceNumber(m, unit)} />}</span>
      <span className="text-[15px] font-semibold text-ink-2">{unit}</span>
    </p>
    {period === 'all' && totals.first && <p className="text-[13px] text-ink-2">Since {new Date(totals.first).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
    <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-4 sm:grid-cols-4">
      <Stat label={noun.charAt(0).toUpperCase() + noun.slice(1)} value={totals.count.toLocaleString('en-GB')} />
      <Stat label="Time moving" value={formatDuration(totals.seconds)} />
      <Stat label="Longest" value={formatDistanceNumber(totals.longest, unit)} unit={unit} />
      <Stat label={`Avg pace /${unit}`} value={pace ?? '–'} />
    </div>
  </>;
}

function StreakDots({ activities, now }: { activities: ReturnType<typeof useActivities>['data'] & object; now: number }) {
  const days = useMemo(() => {
    const moved = new Set(activities.filter(countsForStreak).map((a) => new Date(a.startedAt).toDateString()));
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(now);
      date.setDate(date.getDate() - (6 - i));
      return { moved: moved.has(date.toDateString()), today: i === 6, label: date.toLocaleDateString('en-GB', { weekday: 'narrow' }) };
    });
  }, [activities, now]);
  return (
    <div className="mt-3 flex gap-1.5" aria-label="Last seven days">
      {days.map((day, index) => (
        <div key={index} className="flex flex-col items-center gap-1">
          <span
            className={cx(
              'flex h-7 w-7 items-center justify-center rounded-md',
              day.moved ? 'bg-track text-paper' : day.today ? 'border-[1.5px] border-dashed border-ink text-ink/25' : 'bg-ink/[0.06] text-ink/20',
            )}
            title={day.moved ? 'Moved' : day.today ? 'Not yet today' : 'Rest'}
          >
            <FlameIcon size={14} />
          </span>
          <span className={cx('text-[10px] font-bold', day.today ? 'text-ink' : 'text-ink-3')}>{day.label}</span>
        </div>
      ))}
    </div>
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
