import { formatRelative } from '@jump/shared/format';
import { Stack } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { BellIcon } from '@/components/icons';
import { Button, EmptyState, ErrorNotice, PageHeader, Screen, Skeleton, Txt } from '@/components/ui';
import { useNotifications, useOpenNotification } from '@/lib/queries';
import { colors } from '@/lib/theme';

export default function NotificationsScreen() {
  const notifications = useNotifications();
  const { markRead, open } = useOpenNotification();
  const list = notifications.data ?? [];
  const unread = list.filter((item) => !item.readAt);
  return <Screen refreshing={notifications.isRefetching} onRefresh={() => void notifications.refetch()}>
    <Stack.Screen options={{ title: 'Notifications' }} />
    <PageHeader eyebrow="You" title="Notifications" actions={unread.length > 0 ? <Button size="sm" variant="quiet" title="Mark all read" onPress={() => unread.forEach((item) => markRead.mutate(item.id))} /> : undefined} />
    <ErrorNotice error={notifications.error} onRetry={() => void notifications.refetch()} />
    {notifications.isLoading ? <Skeleton style={{ height: 160 }} />
      : !list.length ? <EmptyState mark={<BellIcon size={40} color={colors.ink3} />} title="All quiet">Updates about your runs and competitions will land here.</EmptyState>
        : <View style={styles.list}>{list.map((item, index) => <Pressable key={item.id} onPress={() => open(item)} style={({ pressed }) => [styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, !item.readAt && { backgroundColor: colors.card }, pressed && { backgroundColor: colors.inkWash }]} accessibilityRole="button" accessibilityLabel={`${item.readAt ? '' : 'Unread. '}${item.title}`}>
          <View style={[styles.dot, { backgroundColor: item.readAt ? 'transparent' : colors.track }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt size={15} weight={item.readAt ? 'medium' : 'bold'} color={item.readAt ? 'ink2' : 'ink'}>{item.title}</Txt>
            <Txt size={14} color="ink2" leading={1.5} style={{ marginTop: 2 }}>{item.body}</Txt>
            <Txt size={12} color="ink3" style={{ marginTop: 4 }}>{formatRelative(item.createdAt)}</Txt>
          </View>
        </Pressable>)}</View>}
  </Screen>;
}

const styles = StyleSheet.create({
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, marginHorizontal: -16 },
  row: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingVertical: 16 },
  dot: { width: 10, height: 10, borderRadius: 2, marginTop: 6 },
});
