import { formatRelative } from '@jump/shared/format';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BellIcon } from '@/components/icons';
import { EmptyState, ErrorNotice, PageHeader, Screen, Skeleton, Txt } from '@/components/ui';
import { post } from '@/lib/api';
import { keys, useNotifications, useOpenNotification } from '@/lib/queries';
import { colors } from '@/lib/theme';

export default function NotificationsScreen() {
  const notifications = useNotifications();
  const { open } = useOpenNotification();
  const queryClient = useQueryClient();
  const list = notifications.data ?? [];
  // Looking at the list reads it: the bell and app badge clear straight away. What was new when you
  // arrived stays highlighted while you're here, so you can still see it.
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    const unread = list.filter((item) => !item.readAt).map((item) => item.id);
    if (unread.length) setFresh((current) => new Set([...current, ...unread]));
  }, [list]);
  const readAll = useMutation({
    mutationFn: () => post('/notifications/read-all'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.notifications }),
  });
  const hasUnread = list.some((item) => !item.readAt);
  useFocusEffect(useCallback(() => {
    if (hasUnread && !readAll.isPending) readAll.mutate();
    // Only when the screen comes into view or new ones arrive while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnread]));
  const isNew = (item: { id: string; readAt: string | null }) => !item.readAt || fresh.has(item.id);
  return <Screen refreshing={notifications.isRefetching} onRefresh={() => void notifications.refetch()}>
    <Stack.Screen options={{ title: 'Notifications' }} />
    <PageHeader eyebrow="You" title="Notifications" />
    <ErrorNotice error={notifications.error} onRetry={() => void notifications.refetch()} />
    {notifications.isLoading ? <Skeleton style={{ height: 160 }} />
      : !list.length ? <EmptyState mark={<BellIcon size={40} color={colors.ink3} />} title="All quiet">Updates about your runs and competitions will land here.</EmptyState>
        : <View style={styles.list}>{list.map((item, index) => <Pressable key={item.id} onPress={() => open(item)} style={({ pressed }) => [styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, isNew(item) && { backgroundColor: colors.card }, pressed && { backgroundColor: colors.inkWash }]} accessibilityRole="button" accessibilityLabel={`${isNew(item) ? 'New. ' : ''}${item.title}`}>
          <View style={[styles.dot, { backgroundColor: isNew(item) ? colors.track : 'transparent' }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt size={15} weight={isNew(item) ? 'bold' : 'medium'} color={isNew(item) ? 'ink' : 'ink2'}>{item.title}</Txt>
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
