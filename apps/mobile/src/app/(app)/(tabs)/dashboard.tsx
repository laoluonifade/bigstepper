import { distanceValue, formatDistance, formatDistanceNumber, formatDuration, formatPace, ordinal, toMetres } from '@jump/shared/format';
import { divisionRank, leagueZone } from '@jump/shared/league';
import { computeMilestones, computeStreaks, creditedMetres, isVerified, nextMilestone, ofKind, summariseWeek, type ActivityKind } from '@jump/shared/progress';
import type { Activity, Profile, Unit } from '@jump/shared/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActivityRow } from '@/components/ActivityRow';
import { ChallengeSomeone, GoBar, MiniRing, MyCompetitions, RaceHero, SUMMARY } from '@/components/CompeteHome';
import { ArrowRightIcon, ChevronDownIcon, RunIcon } from '@/components/icons';
import { DivisionBadge, ZoneTag } from '@/components/league';
import { MilestoneBadge } from '@/components/Milestones';
import { TabScreen } from '@/components/Shell';
import { OptionSheet } from '@/components/Sheet';
import { Button, Card, CountUp, EmptyState, Eyebrow, ErrorNotice, haptic, HardShadow, Meter, Notice, Score, SectionTitle, Segmented, Skeleton, Stat, TextLink, Txt, useNow } from '@/components/ui';
import { patch, post } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { storageKeys, useStored } from '@/lib/local';
import { keys, useActivities, useLeagues, useLeagueStandings, useMyLeagues, useProfile, useUnit } from '@/lib/queries';
import { colors, fontFamily, radius, wideLabel } from '@/lib/theme';

function greeting(hour: number) {
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

export default function DashboardScreen() {
  const user = useUser();
  const profile = useProfile();
  const unit = useUnit();
  const activities = useActivities();
  const now = useNow(60_000);

  const [kind, setKind] = useStored<ActivityKind>(storageKeys.activityKind(user.id), 'all');
  const all = useMemo(() => activities.data ?? [], [activities.data]);
  const list = useMemo(() => ofKind(all, kind), [all, kind]);
  const footActivities = useMemo(() => list.filter((activity) => activity.activityType !== 'cycle'), [list]);
  const week = useMemo(() => summariseWeek(footActivities, new Date(now)), [footActivities, now]);
  // Any walk, run or ride keeps the streak, whatever the filter above shows.
  const streak = useMemo(() => computeStreaks(all, new Date(now)), [all, now]);
  // The summary tile counts every walk and run, whatever the training filter below shows.
  const summaryWeek = useMemo(() => summariseWeek(all.filter((activity) => activity.activityType !== 'cycle'), new Date(now)), [all, now]);
  const milestones = useMemo(() => computeMilestones(all.filter((activity) => activity.activityType !== 'cycle'), new Date(now)), [all, now]);
  const next = nextMilestone(milestones);
  const earned = milestones.filter((m) => m.earned).length;
  const name = profile.data?.displayName ?? user.displayName ?? 'runner';
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries();

  return <TabScreen refreshing={activities.isRefetching} onRefresh={refresh}>
    <View style={{ marginBottom: 24 }}>
      <Txt size={13} weight="medium" color="ink3">{new Date(now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</Txt>
      <Txt size={26} weight="extrabold" leading={1.2} numberOfLines={1} style={{ marginTop: 2, letterSpacing: -0.4 }}>{greeting(new Date(now).getHours())}, {name.split(' ')[0]}</Txt>
    </View>

    {!user.emailVerified && <VerifyPrompt email={user.email} />}
    <ErrorNotice error={activities.error} onRetry={() => void activities.refetch()} />

    {/* A summary first, like Apple Fitness: your race, your week, your streak. Then your other races and training. */}
    <View style={{ gap: 12 }}>
      <RaceHero unit={unit} now={now} />
      <SummaryTiles week={summaryWeek} streak={streak} unit={unit} loading={activities.isLoading} />
      <GoBar unit={unit} now={now} />
    </View>
    <View style={{ gap: 32, marginTop: 32 }}>
      <MyCompetitions unit={unit} now={now} />
      <ChallengeSomeone />
    </View>

    <View style={styles.trainingHead}>
      <Txt size={15} weight="bold" accessibilityRole="header">Your training</Txt>
      <Segmented<ActivityKind> label="Show runs, walks or both" value={kind} onChange={setKind} size="sm" options={[{ value: 'all', label: 'All' }, { value: 'run', label: 'Runs' }, { value: 'walk', label: 'Walks' }]} />
    </View>

    <View style={{ gap: 16 }}>
      <WeekPanel userId={user.id} unit={unit} week={week} kind={kind} activities={footActivities} now={now} loading={activities.isLoading || profile.isLoading} />

      <Card style={{ padding: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Eyebrow>Next milestone</Eyebrow>
          <Txt size={12} weight="semibold" color="ink2" num>{earned}/{milestones.length}</Txt>
        </View>
        {next ? <View style={{ marginTop: 12 }}>
          <MilestoneBadge milestone={next} unit={unit} compact />
          <View style={{ marginTop: 12 }}><Meter value={next.progress} max={next.target} label={`${next.title} progress`} /></View>
        </View> : <Txt size={14} weight="semibold" style={{ marginTop: 12 }}>Every milestone earned. Legendary.</Txt>}
      </Card>
    </View>

    <View style={{ marginTop: 40 }}>
      <LeagueSummary unit={unit} />
    </View>

    <View style={{ marginTop: 40 }}>
      <SectionTitle aside={<TextLink title="All runs" size={13} onPress={() => router.push('/activities')} />}>
        {kind === 'walk' ? 'Recent walks' : kind === 'run' ? 'Recent runs' : 'Recent activity'}
      </SectionTitle>
      {activities.isLoading
        ? <View style={{ gap: 12, paddingVertical: 8 }}><Skeleton style={{ height: 56 }} /><Skeleton style={{ height: 56 }} /></View>
        : list.length === 0 && kind !== 'all'
          ? <EmptyState title={kind === 'walk' ? 'No walks yet' : 'No runs yet'}>{`Switch to All to see everything, or record a ${kind}. Pick Walk or Run before you start.`}</EmptyState>
          : list.length === 0
            ? <EmptyState mark="0.00" title="No runs yet" action={<Button title="Record your first run" icon={<RunIcon size={16} />} onPress={() => router.navigate('/run')} />}>Your first verified run unlocks your first milestone.</EmptyState>
            : <View>{list.slice(0, 4).map((activity, index, shown) => <ActivityRow key={activity.id} activity={activity} unit={unit} last={index === shown.length - 1} />)}</View>}
    </View>

    <View style={{ marginTop: 40 }}>
      <SectionTitle aside={`${earned} of ${milestones.length} earned`}>Milestones</SectionTitle>
      <View style={{ gap: 8 }}>{milestones.map((milestone) => <MilestoneBadge key={milestone.id} milestone={milestone} unit={unit} />)}</View>
      <Txt size={12} color="ink3" style={{ marginTop: 12 }}>Milestones count verified distance only.</Txt>
    </View>
  </TabScreen>;
}

function VerifyPrompt({ email }: { email: string }) {
  const resend = useMutation({ mutationFn: () => post<{ success: boolean }>('/auth/verify-email/resend') });
  return <Notice tone="info" title="Verify your email" style={{ marginBottom: 24 }} action={<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    <Button variant="secondary" size="sm" title={resend.isPending ? 'Sending…' : resend.isSuccess ? 'Sent' : 'Resend email'} disabled={resend.isPending || resend.isSuccess} onPress={() => resend.mutate()} />
    <Button variant="quiet" size="sm" title="I have a code" onPress={() => router.push('/verify-email')} />
  </View>}>
    <Txt size={14} color="ink2" leading={1.5}>{`Confirm that you own ${email} using the verification link. You’ll need a verified email to enter paid competitions. Free competitions work without it.`}</Txt>
    {resend.error ? <Txt size={14} color="bad" style={{ marginTop: 4 }}>{resend.error.message}</Txt> : null}
  </Notice>;
}

const GOAL_OPTIONS: Record<Unit, number[]> = { km: [10, 20, 30, 50], mi: [5, 10, 20, 30] };

/** The goal lives on the profile, so it follows the runner across devices. */
function useWeeklyGoal() {
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
  return [profile.data?.weeklyGoalMetres ?? null, (metres: number) => save.mutate(Math.round(metres))] as const;
}

type Period = 'week' | 'month' | 'all';

function PeriodPicker({ period, onChange, now }: { period: Period; onChange: (period: Period) => void; now: number }) {
  const [open, setOpen] = useState(false);
  const labels: Record<Period, string> = { week: 'This week', month: new Date(now).toLocaleDateString('en-GB', { month: 'long' }), all: 'All time' };
  return <>
    <Pressable onPress={() => setOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Period: ${labels[period]}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Eyebrow color="ink" style={{ textDecorationLine: 'underline', textDecorationColor: colors.ink3 }}>{labels[period]}</Eyebrow>
      <ChevronDownIcon size={13} />
    </Pressable>
    <OptionSheet open={open} onOpenChange={setOpen} title="Choose a period" value={period} onChange={onChange}
      options={[{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'all', label: 'All time' }]} />
  </>;
}

function WeekPanel({ userId, unit, week, kind, activities, now, loading }: { userId: string; unit: Unit; week: ReturnType<typeof summariseWeek>; kind: ActivityKind; activities: Activity[]; now: number; loading: boolean }) {
  const [period, setPeriod] = useStored<Period>(`jump_dashboard_period:${userId}`, 'week');
  // No goal until the runner picks one — never show an invented target. It covers walks and runs together.
  const [savedGoal, setGoal] = useWeeklyGoal();
  const goal = kind === 'all' ? savedGoal : null;
  const [editingGoal, setEditing] = useState(false);
  const editing = kind === 'all' && !loading && (editingGoal || goal === null);
  const reached = goal !== null && week.verifiedMetres >= goal;
  const remaining = goal === null ? 0 : Math.max(0, goal - week.verifiedMetres);
  const noun = kind === 'run' ? 'runs' : kind === 'walk' ? 'walks' : 'verified';

  if (period !== 'week') return <Card variant="strong" style={{ padding: 20 }}><PeriodTotals period={period} onPeriod={setPeriod} activities={activities} kind={kind} unit={unit} now={now} loading={loading} /></Card>;

  return <Card variant="strong" style={{ padding: 20 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><PeriodPicker period={period} onChange={setPeriod} now={now} /><Eyebrow>· {noun}</Eyebrow></View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
          <Score size={64}>{loading ? '–' : <CountUp value={week.verifiedMetres} format={(m) => formatDistanceNumber(m, unit)} />}</Score>
          <Txt size={15} weight="semibold" color="ink2">{goal === null ? unit : `/ ${formatDistanceNumber(goal, unit).replace(/\.0+$/, '')} ${unit}`}</Txt>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Txt size={13} weight="semibold" num>{`${week.runs} ${kind === 'all' ? (week.runs === 1 ? 'activity' : 'activities') : kind === 'walk' ? (week.runs === 1 ? 'walk' : 'walks') : week.runs === 1 ? 'run' : 'runs'}`}</Txt>
        {goal !== null && <TextLink size={12} color="ink2" title={editingGoal ? 'Done' : 'Change goal'} onPress={() => setEditing(!editingGoal)} />}
      </View>
    </View>

    {editing && goal === null && <Txt size={13} weight="semibold" style={{ marginTop: 12 }}>Set a weekly goal</Txt>}
    {kind !== 'all' && savedGoal !== null && <Txt size={12} color="ink3" style={{ marginTop: 12 }}>Your weekly goal counts walks and runs together. Switch to All to see it.</Txt>}
    {editing && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }} accessibilityRole="radiogroup" accessibilityLabel="Weekly goal">
      {GOAL_OPTIONS[unit].map((option) => {
        const active = goal !== null && Math.abs(distanceValue(goal, unit) - option) < 0.01;
        return <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => { haptic(); setGoal(toMetres(option, unit)); setEditing(false); }}>
          {({ pressed }) => <HardShadow offset={2} radius={radius.md} pressed={pressed || active}>
            <View style={[styles.goal, active && { backgroundColor: colors.ink }]}><Text style={[wideLabel(12, 0), active && { color: colors.paper }]}>{option} {unit}</Text></View>
          </HardShadow>}
        </Pressable>;
      })}
    </View>}

    <View style={{ marginTop: 16 }}>
      {goal !== null && <Meter value={week.verifiedMetres} max={goal} label="Weekly goal progress" tone={reached ? 'ok' : 'track'} />}
      <Txt size={13} color="ink2" style={{ marginTop: 8 }}>
        {goal === null ? null : reached ? <Txt size={13} weight="semibold" color="ok">Weekly goal smashed. Anything more is a bonus.</Txt>
          : <><Txt size={13} weight="semibold">{formatDistance(remaining, unit)}</Txt> to your weekly goal.</>}
        {week.pendingMetres > 0 ? ` ${formatDistance(week.pendingMetres, unit)} still verifying.` : ''}
      </Txt>
    </View>

  </Card>;
}

/** Verified totals for this month or all time: distance, count, time moving, longest and average pace. */
function PeriodTotals({ period, onPeriod, activities, kind, unit, now, loading }: { period: Exclude<Period, 'week'>; onPeriod: (period: Period) => void; activities: Activity[]; kind: ActivityKind; unit: Unit; now: number; loading: boolean }) {
  const totals = useMemo(() => {
    const today = new Date(now);
    const from = period === 'month' ? new Date(today.getFullYear(), today.getMonth(), 1).getTime() : 0;
    const counted = activities.filter((activity) => isVerified(activity) && new Date(activity.startedAt).getTime() >= from);
    return {
      metres: counted.reduce((sum, activity) => sum + creditedMetres(activity), 0),
      seconds: counted.reduce((sum, activity) => sum + (activity.movingSeconds || activity.elapsedSeconds), 0),
      longest: counted.reduce((max, activity) => Math.max(max, creditedMetres(activity)), 0),
      count: counted.length,
      first: counted.reduce<string | null>((earliest, activity) => (!earliest || activity.startedAt < earliest ? activity.startedAt : earliest), null),
    };
  }, [activities, period, now]);
  const noun = kind === 'walk' ? 'walks' : kind === 'run' ? 'runs' : 'activities';
  return <>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><PeriodPicker period={period} onChange={onPeriod} now={now} /><Eyebrow>· {kind === 'all' ? 'verified' : noun}</Eyebrow></View>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
      <Score size={64}>{loading ? '–' : <CountUp value={totals.metres} format={(m) => formatDistanceNumber(m, unit)} />}</Score>
      <Txt size={15} weight="semibold" color="ink2">{unit}</Txt>
    </View>
    {period === 'all' && totals.first ? <Txt size={13} color="ink2">Since {new Date(totals.first).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</Txt> : null}
    <View style={styles.totals}>
      <Stat style={styles.total} label={noun.charAt(0).toUpperCase() + noun.slice(1)} value={totals.count.toLocaleString('en-GB')} />
      <Stat style={styles.total} label="Time moving" value={formatDuration(totals.seconds)} />
      <Stat style={styles.total} label="Longest" value={formatDistanceNumber(totals.longest, unit)} unit={unit} />
      <Stat style={styles.total} label={`Avg pace /${unit}`} value={formatPace(totals.metres, totals.seconds, unit) ?? '–'} />
    </View>
  </>;
}

/** This week's distance with a bar per day, and the streak as a ring: the two tiles under the race. */
function SummaryTiles({ week, streak, unit, loading }: { week: ReturnType<typeof summariseWeek>; streak: ReturnType<typeof computeStreaks>; unit: Unit; loading: boolean }) {
  const max = Math.max(1000, ...week.days.map((day) => day.metres));
  return <View style={{ flexDirection: 'row', gap: 12 }}>
    <Pressable onPress={() => router.push('/activities')} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.9 }]} accessibilityRole="button" accessibilityLabel={`This week, ${formatDistance(week.verifiedMetres, unit)}`}>
      <Txt size={15} weight="bold" style={{ color: SUMMARY.text }}>This week</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 4 }}>
        <Text style={styles.tileValue}>{loading ? '–' : formatDistanceNumber(week.verifiedMetres, unit)}</Text>
        <Txt size={13} weight="bold" style={{ color: SUMMARY.accent }}>{unit.toUpperCase()}</Txt>
      </View>
      <View style={styles.bars}>
        {week.days.map((day, index) => <View key={index} style={[styles.bar, day.isToday && { borderWidth: 1, borderColor: SUMMARY.muted }]}>
          {day.metres > 0 && <View style={{ height: `${Math.max(10, (day.metres / max) * 100)}%`, borderRadius: 4, backgroundColor: SUMMARY.accent }} />}
        </View>)}
      </View>
    </Pressable>
    <View style={styles.tile} accessibilityLabel={`Streak, ${streak.current} ${streak.current === 1 ? 'day' : 'days'}`}>
      <Txt size={15} weight="bold" style={{ color: SUMMARY.text }}>Streak</Txt>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 88, height: 88 }}>
          {/* A full ring is a week in a row. */}
          <MiniRing progress={Math.min(streak.current, 7) / 7} size={88} color={colors.track} />
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={[styles.tileValue, { color: SUMMARY.text, lineHeight: 30 }]}>{loading ? '–' : streak.current}</Text>
            <Txt size={11} style={{ color: SUMMARY.muted }}>{streak.current === 1 ? 'day' : 'days'}</Txt>
          </View>
        </View>
      </View>
      <Txt size={12} weight="semibold" align="center" style={{ color: streak.atRisk && !streak.ranToday ? colors.track : SUMMARY.muted }}>
        {streak.ranToday ? 'Lit for today' : streak.atRisk ? 'Move today to keep it' : 'Move today to start one'}
      </Txt>
    </View>
  </View>;
}

function LeagueSummary({ unit }: { unit: Unit }) {
  const leagues = useLeagues();
  const mine = useMyLeagues();
  const active = leagues.data?.seasons.find((season) => season.status === 'ACTIVE');
  const membership = mine.data?.find((item) => item.seasonId === active?.id);
  const standings = useLeagueStandings(membership ? active?.id : undefined);
  const division = leagues.data?.divisions.find((item) => item.id === membership?.divisionId);
  const position = membership && standings.data ? divisionRank(standings.data, membership) : null;
  const zone = membership && position?.rank ? leagueZone(position.rank, position.size, membership.creditedDistanceMetres, division, leagues.data?.divisions ?? [], leagues.data?.rules) : null;

  return <View>
    <SectionTitle aside={<TextLink title="Leagues" size={13} onPress={() => router.push('/leagues')} />}>League</SectionTitle>
    {leagues.isLoading || mine.isLoading ? <Skeleton style={{ height: 96 }} />
      : !active ? <EmptyState title="No active season">The next league season hasn’t started yet.</EmptyState>
        : !membership ? <EmptyState title={active.name}>You’re not placed in this season’s league yet.</EmptyState>
          : <Pressable onPress={() => router.push(`/leagues/${active.id}`)} style={({ pressed }) => [styles.league, pressed && { borderColor: colors.edge }]} accessibilityRole="button">
            <DivisionBadge division={division} size="lg" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Eyebrow>{active.name}</Eyebrow>
              <Text style={[wideLabel(18, 0), { marginTop: 4 }]}>{division?.name ?? 'Division'} division</Text>
              <Txt size={13} color="ink2" num>{`${position?.rank ? `${ordinal(position.rank)} of ${position.size}` : 'Ranking…'} · ${formatDistance(membership.creditedDistanceMetres, unit)}`}</Txt>
              {zone ? <View style={{ marginTop: 8 }}><ZoneTag zone={zone} /></View> : null}
            </View>
            <ArrowRightIcon size={18} />
          </Pressable>}
    <Txt size={12} color="ink3" style={{ marginTop: 12 }}>Verified walk and run distance this season counts toward your league.</Txt>
  </View>;
}

const styles = StyleSheet.create({
  trainingHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 48, marginBottom: 16 },
  goal: { height: 36, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, paddingHorizontal: 16 },
  totals: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 16, marginTop: 20 },
  total: { width: '50%', paddingRight: 12 },
  tile: { flex: 1, height: 184, borderRadius: 22, borderWidth: 1, borderColor: SUMMARY.edge, backgroundColor: SUMMARY.card, padding: 16 },
  tileValue: { fontFamily: fontFamily('bold'), fontSize: 28, lineHeight: 32, letterSpacing: -0.5, color: SUMMARY.accent },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 14 },
  bar: { width: 10, height: '100%', borderRadius: 4, backgroundColor: SUMMARY.wash, overflow: 'hidden', justifyContent: 'flex-end' },
  league: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, padding: 16 },
});
