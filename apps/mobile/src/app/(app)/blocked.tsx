import type { AvatarStyle } from '@jump/shared/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { unblockRunner } from '@/components/Safety';
import { Avatar, Button, EmptyState, ErrorNotice, Loading, Screen, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { colors } from '@/lib/theme';

type Blocked = { username: string; displayName: string; avatarUrl: string | null; avatarStyle: AvatarStyle; blockedAt: string };

/** Who you've blocked, newest first, with Unblock beside each. */
export default function BlockedRunnersScreen() {
  const queryClient = useQueryClient();
  const blocks = useQuery({ queryKey: ['blocks'], queryFn: () => api<Blocked[]>('/me/blocks') });
  return <Screen refreshing={blocks.isRefetching} onRefresh={() => void blocks.refetch()}>
    <Stack.Screen options={{ title: 'Blocked runners' }} />
    <Txt size={14} color="ink2" leading={1.5} style={{ marginBottom: 16 }}>
      You don’t see their Rants, comments or messages, and neither of you can message or follow the other. They aren’t told when you block or unblock them.
    </Txt>
    <ErrorNotice error={blocks.error} onRetry={() => void blocks.refetch()} />
    {blocks.isLoading ? <Loading />
      : !blocks.data?.length ? <EmptyState title="Nobody blocked">Block a runner from the ⋯ menu on their profile, a Rant or a comment.</EmptyState>
        : <View>{blocks.data.map((runner, index) => <View key={runner.username} style={[styles.row, index > 0 && styles.line]}>
          <Pressable onPress={() => router.push({ pathname: '/runners/[username]', params: { username: runner.username } })} style={styles.who} accessibilityRole="link">
            <Avatar name={runner.displayName} src={runner.avatarUrl} avatarStyle={runner.avatarStyle} size={40} round />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt size={15} weight="bold" numberOfLines={1}>{runner.displayName}</Txt>
              <Txt size={13} color="ink3" numberOfLines={1}>{`@${runner.username}`}</Txt>
            </View>
          </Pressable>
          <Button size="sm" variant="secondary" title="Unblock" onPress={() => void unblockRunner(queryClient, runner.username, runner.displayName)} />
        </View>)}</View>}
  </Screen>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
});
