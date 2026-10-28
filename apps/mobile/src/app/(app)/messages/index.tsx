import type { AvatarStyle } from '@jump/shared/types';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ticks, UnreadBadge, type Thread } from '@/components/chat';
import { Sheet } from '@/components/Sheet';
import { ClubLogo } from '@/components/ClubLogo';
import { FeedIcon } from '@/components/icons';
import { RantTabs } from '@/components/social';
import { Avatar, Button, EmptyState, ErrorNotice, haptic, Screen, Skeleton, Txt, VerifiedTick } from '@/components/ui';
import { api } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { useUnreadMessages } from '@/lib/queries';
import { colors, fontFamily, GUTTER, radius } from '@/lib/theme';

type DirectRow = { type: 'direct'; username: string; displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle; verified?: boolean; body: string; kind?: 'text' | 'voice' | 'activity' | 'duel'; createdAt: string; senderId: string; unreadCount: number; readAt?: string | null };
type ClubRow = { type: 'club'; clubSlug: string; clubName: string; logoUrl: string | null; accentColor: string; verified?: boolean; memberCount?: number; senderName: string; senderId: string; body: string; kind?: 'text' | 'voice' | 'activity' | 'duel'; createdAt: string; unreadCount: number };
type InboxRow = DirectRow | ClubRow;

const preview = (row: InboxRow) => (row.kind === 'voice' ? 'Voice note' : row.kind === 'duel' ? 'Duel challenge' : row.body || 'Shared an activity');
const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function MessagesScreen() {
  const user = useUser();
  const unread = useUnreadMessages().data?.count ?? 0;
  const inbox = useQuery({ queryKey: ['messages', 'inbox'], queryFn: () => api<InboxRow[]>('/messages'), refetchInterval: 30_000 });
  const [peeking, setPeeking] = useState<DirectRow | null>(null);
  return <Screen padded={false} refreshing={inbox.isRefetching} onRefresh={() => void inbox.refetch()}>
    <Stack.Screen options={{ title: 'Messages' }} />
    <RantTabs active="dms" unread={unread} />
    <ErrorNotice error={inbox.error} onRetry={() => void inbox.refetch()} />
    {inbox.isLoading ? <View style={{ padding: GUTTER }}><Skeleton style={{ height: 128 }} /></View>
      : !inbox.data?.length ? <View style={{ padding: GUTTER }}><EmptyState mark={<FeedIcon size={30} color={colors.ink3} />} title="No messages yet" action={<Button variant="secondary" title="Find runners" onPress={() => router.push('/runners')} />}>Open a runner’s profile and tap Message to say hello.</EmptyState></View>
        : inbox.data.map((row) => <Pressable key={row.type === 'club' ? `club:${row.clubSlug}` : row.username} onPress={() => router.push(row.type === 'club' ? `/clubs/${row.clubSlug}/chat` : `/messages/${row.username}`)}
          onLongPress={row.type === 'direct' ? () => { haptic('medium'); setPeeking(row); } : undefined} delayLongPress={350}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.card }]}>
          {row.type === 'club' ? <ClubLogo club={{ name: row.clubName, logoUrl: row.logoUrl }} size={48} /> : <Avatar name={row.displayName} src={row.avatarUrl} avatarStyle={row.avatarStyle} size={48} round />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text numberOfLines={1} style={styles.name}>{row.type === 'club' ? row.clubName : row.displayName}</Text>
                {row.verified ? <VerifiedTick /> : null}
                {row.type === 'club' ? <View style={styles.clubTag}><Txt size={10} weight="bold" upper tracking={0.06}>{row.memberCount ? `Club · ${row.memberCount}` : 'Club'}</Txt></View>
                  : <Txt size={13} color="ink3" numberOfLines={1} style={{ flexShrink: 1 }}>{`@${row.username}`}</Txt>}
              </View>
              <Txt size={12} weight={row.unreadCount ? 'semibold' : 'regular'} color={row.unreadCount ? 'ink' : 'ink3'}>{when(row.createdAt)}</Txt>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              {/* Your message last: whether they've read it yet. */}
              {row.type === 'direct' && row.senderId === user.id ? <Ticks read={Boolean(row.readAt)} /> : null}
              <Txt size={13} numberOfLines={1} weight={row.unreadCount ? 'semibold' : 'regular'} color={row.unreadCount ? 'ink' : 'ink2'} style={{ flex: 1 }}>
                {row.type === 'club' ? `${row.senderId === user.id ? 'You' : row.senderName.split(' ')[0]}: ${preview(row)}` : preview(row)}
              </Txt>
              <UnreadBadge count={row.unreadCount} />
            </View>
          </View>
        </Pressable>)}
    {peeking ? <Peek row={peeking} viewerId={user.id} onClose={() => setPeeking(null)} /> : null}
  </Screen>;
}

const peekText = (message: Thread['messages'][number]) => message.audioUrl ? 'Voice note' : message.duel ? 'Duel challenge' : message.activity ? 'Shared an activity'
  : message.tableTitle && message.invitationId ? `Competition invite: ${message.tableTitle}` : message.body;

/**
 * Long-press a chat to read the latest messages without opening it. Only opening the chat tells the
 * other person you've seen them, so a peek leaves them unread.
 */
function Peek({ row, viewerId, onClose }: { row: DirectRow; viewerId: string; onClose: () => void }) {
  const thread = useQuery({ queryKey: ['messages', row.username, 'peek'], queryFn: () => api<Thread>(`/messages/${encodeURIComponent(row.username)}`), staleTime: 0, gcTime: 0 });
  const latest = (thread.data?.messages ?? []).slice(-12);
  return <Sheet open onOpenChange={(open) => !open && onClose()} title={row.displayName} description="Peeking. They won’t see that you’ve read these."
    footer={<Button full variant="dark" title="Open chat" onPress={() => { onClose(); router.push(`/messages/${row.username}`); }} />}>
    {thread.isLoading ? <Skeleton style={{ height: 160, borderRadius: radius.xl }} />
      : <View style={{ gap: 6 }}>
        <ErrorNotice error={thread.error} />
        {latest.map((message) => {
          const mine = message.senderId === viewerId;
          return <View key={message.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
            <Txt size={14} leading={1.4} style={mine ? { color: colors.paper } : undefined}>{peekText(message)}</Txt>
          </View>;
        })}
      </View>}
  </Sheet>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  name: { fontFamily: fontFamily('bold'), fontSize: 15, color: colors.ink, flexShrink: 1 },
  bubble: { maxWidth: '82%', borderRadius: radius.xl, paddingHorizontal: 12, paddingVertical: 8 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.ink, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 4 },
  clubTag: { borderRadius: 999, backgroundColor: colors.inkWash, paddingHorizontal: 7, paddingVertical: 2 },
});
