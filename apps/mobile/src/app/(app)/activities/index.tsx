import { formatDistanceNumber, formatDuration } from '@jump/shared/format';
import { lifetimeStats, ofKind, type ActivityKind } from '@jump/shared/progress';
import type { Activity } from '@jump/shared/types';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActivityCalendar } from '@/components/ActivityCalendar';
import { ActivityRow } from '@/components/ActivityRow';
import { RunIcon } from '@/components/icons';
import { Button, Card, EmptyState, ErrorNotice, Eyebrow, Screen, Segmented, Skeleton, Stat, Txt } from '@/components/ui';
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
  const attention = list.filter((a) => a.verificationStatus === 'FLAGGED' || a.verificationStatus === 'REJECTED').length;
  const filtered = list.filter((activity) => filter === 'verified' ? activity.verificationStatus === 'VERIFIED'
    : filter === 'attention' ? activity.verificationStatus === 'FLAGGED' || activity.verificationStatus === 'REJECTED' : true);
  const groups = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const activity of filtered) {
      const label = new Date(activity.startedAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      map.set(label, [...(map.get(label) ?? []), activity]);
    }
    return [...map.entries()];
  }, [filtered]);

  return <Screen refreshing={activities.isRefetching} onRefresh={() => void activities.refetch()}>
    <Stack.Screen options={{ title: 'Your activities' }} />
    <View style={{ marginBottom: 16 }}>
      <Segmented<ActivityKind> label="Show runs, walks or both" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'run', label: 'Runs' }, { value: 'walk', label: 'Walks' }]} />
    </View>
    <Card variant="strong" style={styles.stats}>
      <Stat style={styles.stat} label={kind === 'run' ? 'Run distance' : kind === 'walk' ? 'Walk distance' : 'Verified distance'} value={activities.isLoading ? '–' : formatDistanceNumber(stats.totalMetres, unit)} unit={unit} />
      <Stat style={styles.stat} label={kind === 'run' ? 'Verified runs' : kind === 'walk' ? 'Verified walks' : 'Verified activities'} value={activities.isLoading ? '–' : stats.verifiedRuns} />
      <Stat style={styles.stat} label="Longest" value={activities.isLoading ? '–' : formatDistanceNumber(stats.longestMetres, unit)} unit={unit} />
      <Stat style={styles.stat} label="Moving time" value={activities.isLoading ? '–' : formatDuration(stats.movingSeconds)} />
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
      : filtered.length === 0 ? <EmptyState title={filter === 'all' && kind === 'all' ? 'No activities yet' : 'Nothing here'}
        action={filter === 'all' && kind === 'all' ? <Button title="Start an activity" icon={<RunIcon size={16} />} onPress={() => router.navigate('/run')} /> : undefined}>
        {filter === 'attention' ? 'None of these need attention.' : filter === 'verified' ? 'Verified activities will appear here.' : kind !== 'all' ? `No ${kind}s recorded yet.` : 'Record a walk, run or ride and it’ll show up here.'}
      </EmptyState>
        : groups.map(([month, items]) => <View key={month} style={{ marginBottom: 24 }}>
          <View style={styles.month}>
            <Eyebrow>{month}</Eyebrow>
            <Txt size={11} color="ink3" num>{items.length} {items.length === 1 ? 'activity' : 'activities'}</Txt>
          </View>
          {items.map((activity, index) => <ActivityRow key={activity.id} activity={activity} unit={unit} last={index === items.length - 1} />)}
        </View>)}
  </Screen>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 20, padding: 20, marginBottom: 24 },
  stat: { width: '50%', paddingRight: 12 },
  month: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: colors.ink, paddingBottom: 8, marginBottom: 4 },
});
