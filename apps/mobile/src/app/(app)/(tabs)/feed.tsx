import { avatarStyleForGender } from '@jump/shared/avatars';
import { activityName, formatDistance } from '@jump/shared/format';
import { shownMetres } from '@jump/shared/progress';
import type { Unit } from '@jump/shared/types';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { ActivityBadge, ActivityPicker } from '@/components/ActivityRow';
import { PostCard, type FeedPost } from '@/components/feed';
import { ActivityIcon, CameraIcon, CloseIcon, FeedIcon } from '@/components/icons';
import { TabScreen } from '@/components/Shell';
import { MentionInput, RantTabs } from '@/components/social';
import { Avatar, Button, EmptyState, ErrorNotice, Eyebrow, haptic, Skeleton, Txt } from '@/components/ui';
import { api, post } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { useActivities, useProfile, useUnit, useUnreadMessages } from '@/lib/queries';
import { colors, display, fontFamily, GUTTER, radius } from '@/lib/theme';
import { pickPhoto, uploadPhoto, type PickedPhoto } from '@/lib/upload';

/**
 * Keeps Rant live while you're on it: every 10 seconds the newest page is fetched and merged in at the
 * top, with fresh reaction and comment counts for what's already there. Older pages aren't refetched.
 */
function useLiveRants(ready: boolean) {
  const queryClient = useQueryClient();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  const latest = useQuery({
    queryKey: ['feed', 'explore', 'latest'],
    queryFn: () => api<FeedPost[]>('/feed?scope=explore&page=0'),
    enabled: ready && focused,
    refetchInterval: 10_000,
  });
  useEffect(() => {
    const head = latest.data;
    if (!head) return;
    queryClient.setQueryData<InfiniteData<FeedPost[], number>>(['feed', 'explore'], (current) => {
      if (!current?.pages.length) return current;
      const fresh = new Set(head.map((item) => item.id));
      const [first, ...rest] = current.pages;
      return { ...current, pages: [[...head, ...first.filter((item) => !fresh.has(item.id))], ...rest] };
    });
  }, [latest.data, queryClient]);
}

export default function FeedScreen() {
  const user = useUser();
  const unit = useUnit();
  const unreadMessages = useUnreadMessages().data?.count ?? 0;
  const queryClient = useQueryClient();
  const feed = useInfiniteQuery({
    queryKey: ['feed', 'explore'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<FeedPost[]>(`/feed?scope=explore&page=${pageParam}`),
    getNextPageParam: (lastPage, pages) => (lastPage.length === 20 ? pages.length : undefined),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/feed/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['feed'] }),
  });
  useLiveRants(feed.isSuccess);
  // New posts slide pages along, so a post can turn up on two pages; show it once.
  const posts = useMemo(() => {
    const seen = new Set<string>();
    return (feed.data?.pages.flat() ?? []).filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));
  }, [feed.data]);

  return <TabScreen refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()}>
    <View style={{ marginBottom: 16 }}>
      <Eyebrow>Community</Eyebrow>
      <Text style={[display(30), { marginTop: 4 }]}>Rant</Text>
    </View>
    <View style={{ marginHorizontal: -GUTTER }}>
      <RantTabs active="explore" unread={unreadMessages} />
      <Composer unit={unit} />
      <ErrorNotice error={feed.error} onRetry={() => void feed.refetch()} />
      {feed.isLoading ? <View style={{ gap: 12, padding: GUTTER }}>{[0, 1, 2].map((key) => <Skeleton key={key} style={{ height: 112 }} />)}</View>
        : !posts.length ? <View style={{ padding: GUTTER }}>
          <EmptyState mark={<FeedIcon size={30} color={colors.ink3} />} title="No rants yet" action={<Button variant="secondary" title="Find runners" onPress={() => router.push('/runners')} />}>Be the first: share how your last walk, run or ride went.</EmptyState>
        </View>
          : <View>
            {posts.map((item) => <Animated.View key={item.id} entering={FadeIn.duration(260)} layout={LinearTransition.duration(260)}>
              <PostCard item={item} unit={unit} viewerId={user.id} onDelete={() => remove.mutate(item.id)} />
            </Animated.View>)}
            <ErrorNotice error={remove.error} />
            {feed.hasNextPage && <View style={{ padding: 12 }}><Button full variant="quiet" loading={feed.isFetchingNextPage} title={feed.isFetchingNextPage ? 'Loading…' : 'Show older posts'} onPress={() => void feed.fetchNextPage()} /></View>}
          </View>}
    </View>
  </TabScreen>;
}

function Composer({ unit }: { unit: Unit }) {
  const user = useUser();
  const profile = useProfile();
  const activities = useActivities();
  const params = useLocalSearchParams<{ activity?: string }>();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [activityId, setActivityId] = useState(params.activity ?? '');
  const [pickingActivity, setPickingActivity] = useState(false);
  const [photo, setPhoto] = useState<{ local: PickedPhoto; url: string | null } | null>(null);
  // "Post" on an activity lands here with it attached.
  useEffect(() => { if (params.activity) setActivityId(params.activity); }, [params.activity]);
  const upload = useMutation({
    mutationFn: (picked: PickedPhoto) => uploadPhoto<{ url: string }>('/feed/images', picked, { name: 'rant.jpg' }),
    onSuccess: ({ url }) => setPhoto((current) => current && { ...current, url }),
    onError: () => setPhoto(null),
  });
  async function choosePhoto() {
    const picked = await pickPhoto({ maxSide: 1600 });
    if (!picked) return;
    setPhoto({ local: picked, url: null });
    upload.mutate(picked);
  }
  const create = useMutation({
    mutationFn: () => post('/feed', { body: body.trim(), ...(activityId ? { activityId } : {}), ...(photo?.url ? { imageUrl: photo.url } : {}) }),
    onSuccess() {
      haptic('success');
      setBody('');
      setActivityId('');
      setPhoto(null);
      upload.reset();
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
  const verified = (activities.data ?? []).filter((activity) => activity.verificationStatus === 'VERIFIED');
  const attached = verified.find((activity) => activity.id === activityId);
  const canPost = Boolean(body.trim() || activityId || photo?.url) && !create.isPending && !upload.isPending;

  return <View style={styles.composer}>
    <Avatar name={profile.data?.displayName ?? user.displayName ?? 'You'} src={profile.data?.avatarUrl} avatarStyle={avatarStyleForGender(profile.data?.gender)} size={40} round />
    <View style={{ flex: 1, minWidth: 0 }}>
      <MentionInput value={body} onValueChange={setBody} multiline maxLength={500} placeholder="How did your walk, run or ride go? Tag friends with @" accessibilityLabel="Post to Rant"
        style={{ fontSize: 17, lineHeight: 23, paddingVertical: 8, maxHeight: 240 }} />
      {photo && <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
        <Image source={{ uri: photo.local.uri }} style={[styles.photo, { aspectRatio: photo.local.width / photo.local.height }, upload.isPending && { opacity: 0.6 }]} contentFit="cover" />
        {upload.isPending && <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.paper} /></View>}
        <Pressable onPress={() => { setPhoto(null); upload.reset(); }} style={styles.removePhoto} accessibilityLabel="Remove photo"><CloseIcon size={16} color={colors.paper} /></Pressable>
      </View>}
      {attached && <View style={styles.attached}>
        <ActivityBadge type={attached.activityType} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={14} weight="semibold" numberOfLines={1}>{activityName(attached.startedAt, attached.activityType)}</Txt>
          <Txt size={12} color="ink3" num>{`${formatDistance(shownMetres(attached), unit)} · ${new Date(attached.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}</Txt>
        </View>
        <Pressable onPress={() => setActivityId('')} hitSlop={8} accessibilityLabel="Remove activity"><CloseIcon size={15} color={colors.ink3} /></Pressable>
      </View>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <View style={{ flexDirection: 'row', marginLeft: -8, marginRight: 'auto' }}>
          <Pressable onPress={() => void choosePhoto()} style={({ pressed }) => [styles.tool, pressed && { backgroundColor: colors.trackWash }]} accessibilityLabel="Add a photo"><CameraIcon size={19} color={colors.trackDeep} /></Pressable>
          <Pressable onPress={() => setPickingActivity(true)} style={({ pressed }) => [styles.tool, (pressed || attached) && { backgroundColor: colors.trackWash }]} accessibilityLabel="Attach an activity"><ActivityIcon size={19} color={colors.trackDeep} /></Pressable>
        </View>
        {body.length > 400 ? <Txt size={12} num color={body.length >= 500 ? 'bad' : 'ink3'}>{500 - body.length}</Txt> : null}
        <Pressable onPress={() => canPost && create.mutate()} disabled={!canPost} style={[styles.postButton, !canPost && { backgroundColor: 'rgba(18,18,18,0.15)' }]} accessibilityRole="button" accessibilityLabel="Post">
          <Text style={[styles.postText, !canPost && { color: colors.ink3 }]}>{create.isPending ? 'Posting…' : 'Post'}</Text>
        </Pressable>
      </View>
      <ErrorNotice error={create.error ?? upload.error} />
    </View>
    <ActivityPicker open={pickingActivity} onOpenChange={setPickingActivity} unit={unit} activities={verified} selectedId={activityId} title="Attach a verified activity"
      onPick={(activity) => setActivityId((current) => (current === activity.id ? '' : activity.id))} />
  </View>;
}

const styles = StyleSheet.create({
  composer: { flexDirection: 'row', gap: 12, paddingHorizontal: GUTTER, paddingTop: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  photo: { width: 240, maxHeight: 288, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.line },
  removePhoto: { position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(18,18,18,0.75)', alignItems: 'center', justifyContent: 'center' },
  attached: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, padding: 8, paddingRight: 10 },
  tool: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  postButton: { height: 36, borderRadius: radius.full, backgroundColor: colors.track, paddingHorizontal: 20, justifyContent: 'center' },
  postText: { fontFamily: fontFamily('bold'), fontSize: 14, color: colors.paper },
});
