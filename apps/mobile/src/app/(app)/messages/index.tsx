import type { AvatarStyle } from '@jump/shared/types';
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { UnreadBadge } from '@/components/chat';
import { ClubLogo } from '@/components/ClubLogo';
import { FeedIcon } from '@/components/icons';
import { RantTabs } from '@/components/social';
import { Avatar, Button, EmptyState, ErrorNotice, Screen, Skeleton, Txt, VerifiedTick } from '@/components/ui';
import { api } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { useUnreadMessages } from '@/lib/queries';
import { colors, fontFamily, GUTTER } from '@/lib/theme';

type DirectRow = { type: 'direct'; username: string; displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle; verified?: boolean; body: string; kind?: 'text' | 'voice' | 'activity'; createdAt: string; senderId: string; unreadCount: number };
type ClubRow = { type: 'club'; clubSlug: string; clubName: string; logoUrl: string | null; accentColor: string; senderName: string; senderId: string; body: string; kind?: 'text' | 'voice' | 'activity'; createdAt: string; unreadCount: number };
type InboxRow = DirectRow | ClubRow;

const preview = (row: InboxRow) => (row.kind === 'voice' ? '🎤 Voice note' : row.body || 'Shared an activity');
const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function MessagesScreen() {
  const user = useUser();
  const unread = useUnreadMessages().data?.count ?? 0;
  const inbox = useQuery({ queryKey: ['messages', 'inbox'], queryFn: () => api<InboxRow[]>('/messages'), refetchInterval: 30_000 });
  return <Screen padded={false} refreshing={inbox.isRefetching} onRefresh={() => void inbox.refetch()}>
    <Stack.Screen options={{ title: 'Messages' }} />
    <RantTabs active="dms" unread={unread} />
    <ErrorNotice error={inbox.error} onRetry={() => void inbox.refetch()} />
    {inbox.isLoading ? <View style={{ padding: GUTTER }}><Skeleton style={{ height: 128 }} /></View>
      : !inbox.data?.length ? <View style={{ padding: GUTTER }}><EmptyState mark={<FeedIcon size={30} color={colors.ink3} />} title="No messages yet" action={<Button variant="secondary" title="Find runners" onPress={() => router.push('/runners')} />}>Open a runner’s profile and tap Message to say hello.</EmptyState></View>
        : inbox.data.map((row) => <Pressable key={row.type === 'club' ? `club:${row.clubSlug}` : row.username} onPress={() => router.push(row.type === 'club' ? `/clubs/${row.clubSlug}/chat` : `/messages/${row.username}`)}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.card }]}>
          {row.type === 'club' ? <ClubLogo club={{ name: row.clubName, logoUrl: row.logoUrl }} size={48} /> : <Avatar name={row.displayName} src={row.avatarUrl} avatarStyle={row.avatarStyle} size={48} round />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text numberOfLines={1} style={styles.name}>{row.type === 'club' ? row.clubName : row.displayName}</Text>
                {row.type === 'direct' && row.verified ? <VerifiedTick /> : null}
                <Txt size={13} color="ink3" numberOfLines={1} style={{ flexShrink: 1 }}>{row.type === 'club' ? 'club' : `@${row.username}`}</Txt>
              </View>
              <Txt size={12} weight={row.unreadCount ? 'semibold' : 'regular'} color={row.unreadCount ? 'ink' : 'ink3'}>{when(row.createdAt)}</Txt>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <Txt size={13} numberOfLines={1} weight={row.unreadCount ? 'semibold' : 'regular'} color={row.unreadCount ? 'ink' : 'ink2'} style={{ flex: 1 }}>
                {row.type === 'club' ? `${row.senderId === user.id ? 'You' : row.senderName.split(' ')[0]}: ${preview(row)}` : preview(row)}
              </Txt>
              <UnreadBadge count={row.unreadCount} />
            </View>
          </View>
        </Pressable>)}
  </Screen>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  name: { fontFamily: fontFamily('bold'), fontSize: 15, color: colors.ink, flexShrink: 1 },
});
