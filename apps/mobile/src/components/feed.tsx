import { activityName, formatDistance, formatDuration, shortAgo } from '@jump/shared/format';
import Svg, { Path } from 'react-native-svg';
import { reactionEmoji, REACTIONS, type Reaction } from '@jump/shared/reactions';
import type { AvatarStyle, Unit } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
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
import { DuelCard } from './Duel';
import type { Duel } from '@/lib/duels';
import { CommentIcon, HeartIcon, SendIcon, ShareIcon, TrashIcon } from './icons';
import { blockRunner, openReport } from './Safety';
import { competitionLink, PhotoViewer, MentionText, ReactionPicker } from './social';
import { CompetitionCard } from './competition';
import { keys } from '@/lib/queries';
import type { CompetitionTable } from '@jump/shared/types';
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
  /** A day of Apple Health steps this post shares, posted by Jump at 9pm, with that day's latest totals. */
  stepsDay?: string | null;
  daySteps?: number | null;
  dayMetres?: number | null;
  reactionCount: number;
  myReaction: Reaction | null;
  topReactions?: Reaction[];
  commentCount: number;
  imageUrl?: string | null;
  /** A duel this post follows, live and then with its result. */
  duel?: Duel | null;
};

export type FeedComment = { id: string; postId: string; userId: string; body: string; createdAt: string; username: string; displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle; pending?: boolean };

/** Applies a change to a post wherever it's cached: the feed pages and its own page. */
export function updatePost(queryClient: QueryClient, id: string, change: (item: FeedPost) => FeedPost) {
  queryClient.setQueriesData<InfiniteData<FeedPost[]>>({ queryKey: ['feed'] }, (data) => data && 'pages' in data ? { ...data, pages: data.pages.map((page) => page.map((item) => (item.id === id ? change(item) : item))) } : data);
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
  const linked = useLinkedCompetition(item);
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
      {item.body ? <View style={{ marginTop: 4 }}><MentionText text={item.body} hide={linked?.url} /></View> : null}
      {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.image} contentFit="cover" transition={150} /> : null}
      {linked ? <LinkPreview table={linked.table} unit={unit} /> : null}
      {item.activityId && item.activityType ? <ActivityAttachment item={item} unit={unit} /> : null}
      {item.stepsDay && item.daySteps != null ? <StepsAttachment item={item} unit={unit} /> : null}
      {item.duel ? <View style={{ marginTop: 8 }}><DuelCard duel={item.duel} viewerId={viewerId} unit={unit} actions={false} /></View> : null}
      <ActionBar item={item} viewerId={viewerId} />
    </View>
  </Pressable>;
}

/**
 * A Jump competition linked in a post with nothing else attached: its table, to show as a card in place
 * of the bare URL. Nothing changes if it can't be opened (a private one, say).
 */
export function useLinkedCompetition(item: FeedPost | undefined) {
  const link = !item || item.activityId || item.stepsDay || item.duel || item.imageUrl ? null : competitionLink(item.body);
  const table = useQuery({
    queryKey: keys.table(link?.code ?? ''),
    queryFn: () => api<CompetitionTable>(`/tables/${encodeURIComponent(link!.code)}`),
    enabled: Boolean(link),
    staleTime: 60_000,
    retry: false,
  });
  return link && table.data ? { url: link.url, table: table.data } : null;
}

export function LinkPreview({ table, unit }: { table: CompetitionTable; unit: Unit }) {
  return <View style={{ marginTop: 10 }}><CompetitionCard table={table} unit={unit} now={Date.now()} /></View>;
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

/** A day of steps from Apple Health, shared once in the evening instead of a post for every walk. */
export function StepsAttachment({ item, unit }: { item: FeedPost; unit: Unit }) {
  const day = new Date(`${item.stepsDay}T12:00:00`);
  return <View style={styles.attachment}>
    <View style={[styles.attachmentBadge, { paddingLeft: 0, width: 52, backgroundColor: '#FF2D55' }]}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="#FFFFFF"><Path d="M12 21.4 10.6 20.1C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.6L12 21.4Z" /></Svg>
    </View>
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[wideLabel(10.5, 0.1), { color: colors.ink2 }]} numberOfLines={1}>{`${day.toLocaleDateString('en-GB', { weekday: 'long' })}'s steps`}</Text>
        <Txt size={12} color="ink2" num numberOfLines={1}>{`${item.dayMetres != null ? `${formatDistance(item.dayMetres, unit)} walked · ` : ''}Apple Health`}</Txt>
      </View>
      <Text style={score(24)}>{(item.daySteps ?? 0).toLocaleString('en-GB')}</Text>
    </View>
  </View>;
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
