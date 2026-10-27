import { activityName, formatDistance, formatDuration, shortAgo } from '@jump/shared/format';
import { reactionEmoji, REACTIONS, type Reaction } from '@jump/shared/reactions';
import type { AvatarStyle, Unit } from '@jump/shared/types';
import { useMutation, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { api, post, WEB_URL } from '@/lib/api';
import { colors, fontFamily, GUTTER, radius, score, wideLabel } from '@/lib/theme';
import { confirm } from '@/lib/dialog';
import { ActionMenu } from './ActionMenu';
import { ActivityBadge } from './ActivityRow';
import { CommentIcon, HeartIcon, SendIcon, ShareIcon, TrashIcon } from './icons';
import { blockRunner, openReport } from './Safety';
import { PhotoViewer, MentionText, ReactionPicker } from './social';
import { Avatar, haptic, Txt, VerifiedTick } from './ui';

export type FeedPost = {
  id: string;
  /** Blue tick from a Jump admin. */
  verified?: boolean;
  body: string;
  createdAt: string;
  userId: string;
  activityId: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarStyle?: AvatarStyle;
  activityType: 'walk' | 'run' | 'cycle' | null;
  startedAt: string | null;
  validatedSteps: number | null;
  distanceMetres: number | null;
  movingSeconds: number | null;
  reactionCount: number;
  myReaction: Reaction | null;
  topReactions?: Reaction[];
  commentCount: number;
  imageUrl?: string | null;
};

export type FeedComment = { id: string; postId: string; userId: string; body: string; createdAt: string; username: string; displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle; pending?: boolean };

/** Applies a change to a post wherever it's cached: the feed pages and its own page. */
export function updatePost(queryClient: QueryClient, id: string, change: (item: FeedPost) => FeedPost) {
  queryClient.setQueryData<InfiniteData<FeedPost[]>>(['feed', 'explore'], (data) => data && { ...data, pages: data.pages.map((page) => page.map((item) => (item.id === id ? change(item) : item))) });
  queryClient.setQueryData<FeedPost>(['feed-post', id], (item) => item && change(item));
}

const openRunner = (username: string) => router.push(`/runners/${username}`);

/** Someone else's Rant: report it, or block them. */
export function PostMenu({ item }: { item: Pick<FeedPost, 'id' | 'username' | 'displayName'> }) {
  const queryClient = useQueryClient();
  return <ActionMenu label="Post options" actions={[
    { label: 'Report this Rant', run: () => openReport({ targetType: 'rant', target: item.id }) },
    { label: `Block @${item.username}`, danger: true, run: () => void blockRunner(queryClient, item.username, item.displayName) },
  ]} />;
}

export function PostCard({ item, unit, viewerId, onDelete }: { item: FeedPost; unit: Unit; viewerId: string; onDelete: () => void }) {
  return <Pressable onPress={() => router.push(`/feed/${item.id}`)} style={({ pressed }) => [styles.post, pressed && { backgroundColor: 'rgba(18,18,18,0.02)' }]} accessibilityLabel={`Post by ${item.displayName}`}>
    <Pressable onPress={() => openRunner(item.username)} accessibilityLabel={`View ${item.displayName}'s profile`}>
      <Avatar name={item.displayName} src={item.avatarUrl} avatarStyle={item.avatarStyle} size={42} round />
    </Pressable>
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text onPress={() => openRunner(item.username)} numberOfLines={1} style={styles.name}>{item.displayName}</Text>
        {item.verified ? <VerifiedTick size={16} /> : null}
        <Txt size={14} color="ink3" numberOfLines={1} style={{ flexShrink: 1 }}>@{item.username}</Txt>
        <Txt size={14} color="ink3">· {shortAgo(item.createdAt)}</Txt>
        {item.userId === viewerId ? <Pressable onPress={() => void confirm({ title: 'Delete this post?', cancelLabel: 'Keep', confirmLabel: 'Delete', destructive: true }).then((ok) => { if (ok) onDelete(); })}
          hitSlop={8} style={{ marginLeft: 'auto', padding: 4 }} accessibilityLabel="Delete post"><TrashIcon size={15} color={colors.ink3} /></Pressable>
          : <View style={{ marginLeft: 'auto' }}><PostMenu item={item} /></View>}
      </View>
      {item.body ? <View style={{ marginTop: 4 }}><MentionText text={item.body} /></View> : null}
      {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.image} contentFit="cover" transition={150} /> : null}
      {item.activityId && item.activityType ? <ActivityAttachment item={item} unit={unit} /> : null}
      <ActionBar item={item} viewerId={viewerId} />
    </View>
  </Pressable>;
}

/** React, comment, message and share, each a quiet round button. */
export function ActionBar({ item, viewerId, onComment }: { item: FeedPost; viewerId: string; onComment?: () => void }) {
  return <View style={styles.actions}>
    <ReactButton item={item} />
    <Pressable onPress={onComment ?? (() => router.push({ pathname: '/feed/[id]', params: { id: item.id, reply: '1' } }))} style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      accessibilityLabel={`${item.commentCount} comments. Write a comment`}>
      <CommentIcon size={18} color={colors.ink2} />
      <Txt size={13} weight="semibold" color="ink2" num>{item.commentCount > 0 ? item.commentCount : 'Comment'}</Txt>
    </Pressable>
    {item.userId !== viewerId && <Pressable onPress={() => router.push(`/messages/${item.username}`)} style={({ pressed }) => [styles.action, pressed && styles.actionPressed]} accessibilityLabel={`Message ${item.displayName}`}>
      <SendIcon size={16} color={colors.ink2} />
    </Pressable>}
    <Pressable onPress={() => void Share.share({ url: `${WEB_URL}/feed/${item.id}`, message: `${item.displayName} on Jump: ${WEB_URL}/feed/${item.id}` })} style={({ pressed }) => [styles.action, { marginLeft: 'auto' }, pressed && styles.actionPressed]} accessibilityLabel="Share post">
      <ShareIcon size={16} color={colors.ink2} />
    </Pressable>
  </View>;
}

/** Tap to ❤️ (instantly); press and hold for other reactions. */
function ReactButton({ item }: { item: FeedPost }) {
  const queryClient = useQueryClient();
  const [picker, setPicker] = useState<number | null>(null);
  const [burst, setBurst] = useState(0);
  const react = useMutation({
    mutationFn: (reaction: Reaction | null) => (reaction ? post(`/feed/${item.id}/reaction`, { reaction }) : api(`/feed/${item.id}/reaction`, { method: 'DELETE' })),
    onMutate(reaction) {
      const previous = item;
      updatePost(queryClient, item.id, (current) => ({
        ...current,
        myReaction: reaction,
        reactionCount: current.reactionCount + (reaction && !current.myReaction ? 1 : !reaction && current.myReaction ? -1 : 0),
        topReactions: reaction && !(current.topReactions ?? []).includes(reaction) ? [reaction, ...(current.topReactions ?? [])].slice(0, 3) : current.topReactions,
      }));
      return { previous };
    },
    onError(_error, _reaction, context) {
      if (context) updatePost(queryClient, item.id, () => context.previous);
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['feed-post', item.id] });
    },
  });
  function choose(reaction: Reaction | null) {
    setPicker(null);
    if (reaction) { setBurst((value) => value + 1); haptic(); }
    react.mutate(reaction);
  }
  const mine = item.myReaction;
  return <>
    <Pressable onPress={() => choose(mine ? null : 'HEART')} onLongPress={(event) => { haptic(); setPicker(event.nativeEvent.pageY); }} delayLongPress={350}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]} accessibilityRole="button" accessibilityState={{ selected: Boolean(mine) }}
      accessibilityLabel={mine ? `Remove your ${REACTIONS.find((choice) => choice.value === mine)?.label ?? ''} reaction` : 'Love this post'} accessibilityHint="Press and hold for more reactions">
      <Animated.View key={burst} entering={burst ? ZoomIn.springify() : undefined}>
        {mine && mine !== 'HEART' ? <Text style={{ fontSize: 17 }}>{reactionEmoji(mine)}</Text> : <HeartIcon size={18} filled={mine === 'HEART'} color={mine ? colors.bad : colors.ink2} />}
      </Animated.View>
      {item.reactionCount > 0 ? <Txt size={13} weight="semibold" color={mine ? 'bad' : 'ink2'} num>{item.reactionCount}</Txt> : null}
    </Pressable>
    <ReactionPicker open={picker !== null} y={picker ?? undefined} current={mine} onPick={choose} onClose={() => setPicker(null)} />
  </>;
}

/** The activity a post shares: what it was, its steps and time, and its distance. */
export function ActivityAttachment({ item, unit }: { item: FeedPost; unit: Unit }) {
  return <Pressable onPress={() => router.push(`/activities/${item.activityId}`)} style={styles.attachment} accessibilityRole="button">
    {item.activityType && <View style={styles.attachmentBadge}><ActivityBadge type={item.activityType} size={40} /></View>}
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[wideLabel(10.5, 0.1), { color: colors.ink2 }]} numberOfLines={1}>{item.startedAt ? activityName(item.startedAt, item.activityType!) : item.activityType}</Text>
        <Txt size={12} color="ink2" num numberOfLines={1}>{`${item.activityType === 'cycle' ? 'GPS distance' : `${(item.validatedSteps ?? 0).toLocaleString('en-GB')} steps`} · ${formatDuration(item.movingSeconds ?? 0)}`}</Txt>
      </View>
      <Text style={score(24)}>{formatDistance(item.distanceMetres ?? 0, unit)}</Text>
    </View>
  </Pressable>;
}

/** A post photo; tap to see it full size. */
export function PostImage({ uri }: { uri: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <Pressable onPress={() => setOpen(true)} accessibilityRole="imagebutton" accessibilityLabel="View photo">
      <Image source={{ uri }} style={[styles.image, { height: 360 }]} contentFit="cover" transition={150} />
    </Pressable>
    <PhotoViewer uri={open ? uri : null} onClose={() => setOpen(false)} />
  </>;
}

const styles = StyleSheet.create({
  post: { flexDirection: 'row', gap: 12, paddingHorizontal: GUTTER, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  name: { fontFamily: fontFamily('bold'), fontSize: 14, color: colors.ink, flexShrink: 1 },
  image: { marginTop: 10, width: '100%', height: 280, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.line, backgroundColor: 'rgba(18,18,18,0.03)' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, marginLeft: -10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: radius.full, paddingHorizontal: 10 },
  actionPressed: { backgroundColor: 'rgba(18,18,18,0.05)' },
  attachment: { flexDirection: 'row', marginTop: 10, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, overflow: 'hidden' },
  attachmentBadge: { paddingLeft: 10, alignItems: 'center', justifyContent: 'center' },
});
