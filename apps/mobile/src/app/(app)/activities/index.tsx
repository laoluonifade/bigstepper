import { formatDistanceNumber, formatDuration } from '@jump/shared/format';
import { lifetimeStats, ofKind, type ActivityKind } from '@jump/shared/progress';
import type { Activity, DailySteps } from '@jump/shared/types';
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActivityCalendar } from '@/components/ActivityCalendar';
import { ActivityRow } from '@/components/ActivityRow';
import { HealthDayRow, useDailySteps } from '@/components/apple-health';
import { RunIcon } from '@/components/icons';
import { Button, Card, EmptyState, ErrorNotice, Eyebrow, Screen, Segmented, Skeleton, Stat, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { storageKeys, useStored } from '@/lib/local';
import { useActivities, useUnit } from '@/lib/queries';
import { colors, wideLabel } from '@/lib/theme';

type Filter = 'all' | 'verified' | 'attention';

export default function ActivitiesScreen() {
  const activities = useActivities();
  const unit = useUnit();
  const user = useUser();
  const [filter, setFilter] = useState<Filter>('all');
  const [kind, setKind] = useStored<ActivityKind>(storageKeys.activityKind(user.id), 'all');
  const list = useMemo(() => ofKind(activities.data ?? [], kind), [activities.data, kind]);
  const stats = useMemo(() => lifetimeStats(list), [list]);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const summary = useQuery({
    queryKey: ['activity-summary', timeZone],
    queryFn: () => api<{ totalSteps: number; activeDays: number }>(`/activities/summary?tz=${encodeURIComponent(timeZone)}`),
  });
  const attention = list.filter((a) => a.verificationStatus === 'REJECTED').length;
  const filtered = list.filter((activity) => filter === 'verified' ? (activity.verificationStatus === 'VERIFIED' || activity.verificationStatus === 'FLAGGED')
    : filter === 'attention' ? activity.verificationStatus === 'REJECTED' : true);
  const healthDays = useDailySteps();
  const groups = useMemo(() => {
    const showHealth = filter === 'all' && kind !== 'run';
    const entries: Array<{ at: number; activity?: Activity; day?: DailySteps }> = [
      ...filtered.map((activity) => ({ at: new Date(activity.startedAt).getTime(), activity })),
      ...(showHealth ? (healthDays.data ?? []).filter((day) => day.steps > 0).map((day) => ({ at: new Date(`${day.day}T23:59:00`).getTime(), day })) : []),
    ].sort((a, b) => b.at - a.at);
    const map = new Map<string, typeof entries>();
    for (const entry of entries) {
      const label = new Date(entry.at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      map.set(label, [...(map.get(label) ?? []), entry]);
    }
    return [...map.entries()];
  }, [filtered, healthDays.data, filter, kind]);

  return <Screen refreshing={activities.isRefetching} onRefresh={() => { void activities.refetch(); void summary.refetch(); }}>
    <Stack.Screen options={{ title: 'Your activities' }} />
    <View style={{ marginBottom: 16 }}>
      <Segmented<ActivityKind> label="Show runs, walks or both" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'run', label: 'Runs' }, { value: 'walk', label: 'Walks' }]} />
    </View>
    <Card variant="strong" style={styles.stats}>
      <Stat style={styles.stat} label={kind === 'run' ? 'Run distance' : kind === 'walk' ? 'Walk distance' : 'Verified distance'} value={activities.isLoading ? '–' : formatDistanceNumber(stats.totalMetres, unit)} unit={unit} />
      <Stat style={styles.stat} label={kind === 'run' ? 'Verified runs' : kind === 'walk' ? 'Verified walks' : 'Verified activities'} value={activities.isLoading ? '–' : stats.verifiedRuns} />
      <Stat style={styles.stat} label="Longest" value={activities.isLoading ? '–' : formatDistanceNumber(stats.longestMetres, unit)} unit={unit} />
      <Stat style={styles.stat} label="Moving time" value={activities.isLoading ? '–' : formatDuration(stats.movingSeconds)} />
      <Stat style={styles.stat} label="Total steps" value={summary.data ? summary.data.totalSteps.toLocaleString('en-GB') : '–'} />
      <Stat style={styles.stat} label="Active days" value={summary.data ? summary.data.activeDays : '–'} />
    </Card>

    <ActivityCalendar unit={unit} />

    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
      <Text style={wideLabel(16, 0)}>History</Text>
      <Txt size={12} color="ink3">Latest {Math.min(list.length, 100)}</Txt>
    </View>
    <View style={{ marginTop: 12, marginBottom: 16 }}>
      <Segmented<Filter> label="Filter activities" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'verified', label: 'Verified' }, { value: 'attention', label: attention ? `Review · ${attention}` : 'Review' }]} />
    </View>

    <ErrorNotice error={activities.error} onRetry={() => void activities.refetch()} />
    {activities.isLoading ? <View style={{ gap: 12 }}>{[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 64 }} />)}</View>
      : groups.length === 0 ? <EmptyState title={filter === 'all' && kind === 'all' ? 'No activities yet' : 'Nothing here'}
        action={filter === 'all' && kind === 'all' ? <Button title="Start an activity" icon={<RunIcon size={16} />} onPress={() => router.navigate('/run')} /> : undefined}>
        {filter === 'attention' ? 'None of these need attention.' : filter === 'verified' ? 'Verified activities will appear here.' : kind !== 'all' ? `No ${kind}s recorded yet.` : 'Record a walk, run or ride and it’ll show up here.'}
      </EmptyState>
        : groups.map(([month, items]) => <View key={month} style={{ marginBottom: 24 }}>
          <View style={styles.month}>
            <Eyebrow>{month}</Eyebrow>
            <Txt size={11} color="ink3" num>{monthCount(items)}</Txt>
          </View>
          {items.map((entry, index) => entry.activity
            ? <ActivityRow key={entry.activity.id} activity={entry.activity} unit={unit} last={index === items.length - 1} />
            : <HealthDayRow key={entry.day!.day} day={entry.day!} unit={unit} last={index === items.length - 1} />)}
        </View>)}
  </Screen>;
}

function monthCount(items: Array<{ activity?: Activity }>) {
  const activities = items.filter((item) => item.activity).length;
  const days = items.length - activities;
  return [activities ? `${activities} ${activities === 1 ? 'activity' : 'activities'}` : null, days ? `${days} Apple Health ${days === 1 ? 'day' : 'days'}` : null].filter(Boolean).join(' · ');
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 20, padding: 20, marginBottom: 24 },
  stat: { width: '50%', paddingRight: 12 },
  month: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: colors.ink, paddingBottom: 8, marginBottom: 4 },
});
