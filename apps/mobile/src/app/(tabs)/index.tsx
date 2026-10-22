import { formatDistance, formatDuration, formatRelative } from '@jump/shared/format';
import { creditedMetres } from '@jump/shared/progress';
import type { Activity } from '@jump/shared/types';
import { useQuery } from '@tanstack/react-query';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

const LABEL = { walk: 'Walk', run: 'Run', cycle: 'Ride' } as const;

export default function HomeScreen() {
  const { user } = useAuth();
  const activities = useQuery({ queryKey: ['activities'], queryFn: () => api<Activity[]>('/activities') });

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={activities.data ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={activities.isRefetching} onRefresh={() => void activities.refetch()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.hello}>Hi {user?.displayName ?? 'there'}</Text>
            <Text style={styles.section}>Recent activity</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>{activities.isPending ? 'Loading…' : activities.error ? activities.error.message : 'No activities yet. Record your first one.'}</Text>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{LABEL[item.activityType]} · {formatDistance(creditedMetres(item) || item.recordedDistanceMetres)}</Text>
              <Text style={styles.rowMeta}>{formatDuration(item.movingSeconds)} · {formatRelative(item.startedAt)}</Text>
            </View>
            <Text style={[styles.badge, item.verificationStatus === 'VERIFIED' && { color: colors.ok }]}>{item.verificationStatus.toLowerCase()}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  hello: { fontSize: 30, fontWeight: '900', color: colors.ink },
  section: { marginTop: 20, fontSize: 13, fontWeight: '700', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 1 },
  empty: { paddingHorizontal: 16, color: colors.ink2 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  rowMeta: { marginTop: 2, fontSize: 14, color: colors.ink2 },
  badge: { fontSize: 12, fontWeight: '700', color: colors.ink3, textTransform: 'capitalize' },
});
