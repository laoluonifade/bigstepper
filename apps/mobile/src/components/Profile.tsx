import { avatarStyleForGender } from '@jump/shared/avatars';
import { formatDistanceNumber, formatDuration } from '@jump/shared/format';
import type { Connection, Profile, PublicProfile, PublicStats, Unit } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { api, WEB_URL } from '@/lib/api';
import { keys } from '@/lib/queries';
import { colors, display, radius, score, wideLabel } from '@/lib/theme';
import { pickPhoto, uploadPhoto } from '@/lib/upload';
import { ask, confirm } from '@/lib/dialog';
import { CameraIcon, CheckIcon, PlusIcon, ShareIcon } from './icons';
import { Avatar, Button, EmptyState, ErrorNotice, haptic, HardShadow, Skeleton, Txt, VerifiedTick } from './ui';

export function useAvatar() {
  const queryClient = useQueryClient();
  const done = (updated: Profile) => {
    queryClient.setQueryData(keys.profile, updated);
    // Leaderboards and member lists carry the photo too.
    void queryClient.invalidateQueries({ predicate: (query) => ['standings', 'result', 'leagues', 'club', 'runner'].includes(String(query.queryKey[0])) });
  };
  const upload = useMutation({
    mutationFn: async (camera: boolean) => {
      const photo = await pickPhoto({ camera, square: true });
      return photo ? uploadPhoto<Profile>('/me/avatar', photo, { name: 'avatar.jpg' }) : null;
    },
    onSuccess: (updated) => updated && done(updated),
  });
  const remove = useMutation({ mutationFn: () => api<Profile>('/me/avatar', { method: 'DELETE' }), onSuccess: done });
  return { upload, remove };
}

/** Avatar with a camera button: take a photo, choose one, or remove it. */
export function AvatarEditor({ profile, size = 84 }: { profile: Profile; size?: number }) {
  const { upload, remove } = useAvatar();
  const busy = upload.isPending || remove.isPending;
  const error = upload.error ?? remove.error;
  function change() {
    haptic();
    void ask({
      title: profile.avatarUrl ? 'Change profile photo' : 'Add a profile photo',
      actions: [{ label: 'Take photo' }, { label: 'Choose from library' }, ...(profile.avatarUrl ? [{ label: 'Remove photo', style: 'destructive' as const }] : [])],
    }).then((picked) => {
      if (picked === 0) upload.mutate(true);
      else if (picked === 1) upload.mutate(false);
      else if (picked === 2) remove.mutate();
    });
  }
  return <View>
    <Pressable onPress={change} disabled={busy} accessibilityRole="button" accessibilityLabel={profile.avatarUrl ? 'Change profile photo' : 'Add a profile photo'}>
      <View style={{ opacity: busy ? 0.6 : 1 }}><Avatar name={profile.displayName} src={profile.avatarUrl} avatarStyle={avatarStyleForGender(profile.gender)} size={size} style={{ borderRadius: radius.lg }} /></View>
      {busy && <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.ink} /></View>}
      <View style={styles.camera}><CameraIcon size={15} color={colors.onAccent} /></View>
    </Pressable>
    {error ? <Txt size={12} weight="semibold" color="bad" style={{ marginTop: 8, maxWidth: 200 }}>{error.message}</Txt> : null}
  </View>;
}

export interface HeroCounts {
  /** Omitted when the runner's activity isn't visible. */
  activities?: number;
  followers: number;
  following: number;
}

/** Header shared by your own profile and other runners': photo with counts beside it, then name, handle, bio and actions. */
export function ProfileHero({ avatar, displayName, verified, username, meta, bio, counts, actions, children }: {
  avatar: ReactNode; displayName: string; verified?: boolean; username: string; meta: string; bio?: ReactNode; counts: HeroCounts; actions?: ReactNode; children?: ReactNode;
}) {
  const cell = (value: number, label: string, tab?: 'followers' | 'following') => {
    const body = <><Text style={score(24)}>{value.toLocaleString('en-GB')}</Text><Txt size={11} weight="semibold" color="ink2" style={{ marginTop: 2 }}>{label}</Txt></>;
    return tab
      ? <Pressable key={label} onPress={() => router.push({ pathname: '/runners/[username]', params: { username, tab } })} style={({ pressed }) => [styles.count, pressed && { backgroundColor: colors.inkWash }]} accessibilityRole="link">{body}</Pressable>
      : <View key={label} style={styles.count}>{body}</View>;
  };
  return <View style={styles.hero}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
      {avatar}
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {counts.activities !== undefined && cell(counts.activities, counts.activities === 1 ? 'Activity' : 'Activities')}
        {cell(counts.followers, counts.followers === 1 ? 'Follower' : 'Followers', 'followers')}
        {cell(counts.following, 'Following', 'following')}
      </View>
    </View>
    {/* The tick sits inline after the last word, so a long name that wraps keeps it beside the name. */}
    <Text style={[display(displayName.length > 18 ? 22 : 26), { marginTop: 12 }]}>
      {displayName}
      {verified ? <>{' '}<View style={{ transform: [{ translateY: 3 }] }}><VerifiedTick size={displayName.length > 18 ? 19 : 22} /></View></> : null}
    </Text>
    <Txt size={13} color="ink2" style={{ marginTop: 6 }}><Txt size={13} weight="semibold">@{username}</Txt>{` · ${meta}`}</Txt>
    {bio ? typeof bio === 'string' ? <Txt size={14} leading={1.5} style={{ marginTop: 12 }}>{bio}</Txt> : <View style={{ marginTop: 12 }}>{bio}</View> : null}
    {actions ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>{actions}</View> : null}
    {children}
  </View>;
}

/** Distance totals plus a run/walk/ride split bar. */
export function ProfileStats({ stats, unit }: { stats: PublicStats; unit: Unit }) {
  const split = stats.runMetres + stats.walkMetres + (stats.cycleMetres ?? 0);
  const share = (metres: number) => (split > 0 ? metres / split : 0);
  const cells = [{ label: 'Distance', value: stats.totalMetres }, { label: 'This month', value: stats.monthMetres }, { label: 'Longest', value: stats.longestMetres }];
  return <View style={styles.stats}>
    <View style={{ flexDirection: 'row' }}>
      {cells.map((cell, index) => <View key={cell.label} style={[{ flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 12 }, index > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.line }]}>
        <Txt size={10.5} weight="bold" upper tracking={0.08} color="ink2">{cell.label}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
          <Text style={score(22)} numberOfLines={1}>{formatDistanceNumber(cell.value, unit)}</Text>
          <Txt size={11} weight="semibold" color="ink2">{unit}</Txt>
        </View>
      </View>)}
    </View>
    {split > 0 && <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, padding: 12 }}>
      <View style={styles.split} accessibilityLabel={`${Math.round(share(stats.runMetres) * 100)}% running, ${Math.round(share(stats.walkMetres) * 100)}% walking, ${Math.round(share(stats.cycleMetres ?? 0) * 100)}% cycling`}>
        <View style={{ width: `${share(stats.runMetres) * 100}%`, backgroundColor: colors.track }} />
        <View style={{ width: `${share(stats.walkMetres) * 100}%`, backgroundColor: colors.ink }} />
        <View style={{ width: `${share(stats.cycleMetres ?? 0) * 100}%`, backgroundColor: colors.volt }} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
        <Legend dot={colors.track} text={`${stats.runs} ${stats.runs === 1 ? 'run' : 'runs'} · ${formatDistanceNumber(stats.runMetres, unit)} ${unit}`} />
        <Legend dot={colors.ink} text={`${stats.walks} ${stats.walks === 1 ? 'walk' : 'walks'} · ${formatDistanceNumber(stats.walkMetres, unit)} ${unit}`} />
        {(stats.cycles ?? 0) > 0 && <Legend dot={colors.volt} text={`${stats.cycles} ${stats.cycles === 1 ? 'ride' : 'rides'} · ${formatDistanceNumber(stats.cycleMetres, unit)} ${unit}`} />}
      </View>
      {stats.movingSeconds > 0 && <Txt size={12} color="ink3" style={{ marginTop: 4 }}>{`${formatDuration(stats.movingSeconds)} moving in total`}</Txt>}
    </View>}
  </View>;
}

function Legend({ dot, text }: { dot: string; text: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /><Txt size={12} weight="semibold" num>{text}</Txt></View>;
}

/** Underline tabs that stay on one line at phone width. */
export function ProfileTabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (value: T) => void; tabs: Array<{ value: T; label: string }> }) {
  return <View style={styles.tabs} accessibilityRole="tablist">
    {tabs.map((tab) => {
      const active = tab.value === value;
      return <Pressable key={tab.value} onPress={() => { haptic(); onChange(tab.value); }} accessibilityRole="tab" accessibilityState={{ selected: active }} style={[styles.tab, active && { borderBottomColor: colors.track }]}>
        <Text style={[wideLabel(12, 0), { color: active ? colors.ink : colors.ink3 }]}>{tab.label}</Text>
      </Pressable>;
    })}
  </View>;
}

/** Shares the profile link through the phone's share sheet. */
/** `md` matches a full-size button's height, for when it sits beside one. */
export function ShareProfileButton({ username, displayName, size = 'sm' }: { username: string; displayName: string; size?: 'sm' | 'md' }) {
  const url = `${WEB_URL}/runners/${username}`;
  return <Pressable onPress={() => void Share.share({ title: `${displayName} on Jump`, message: `Follow ${displayName}’s walks and runs on Jump: ${url}`, url })} accessibilityRole="button" accessibilityLabel="Share profile">
    {({ pressed }) => <HardShadow radius={radius.base} pressed={pressed}><View style={[styles.square, size === 'md' && { width: 50, height: 46 }]}><ShareIcon size={size === 'md' ? 18 : 16} /></View></HardShadow>}
  </Pressable>;
}

/** Follow / unfollow, updating counts straight away and rolling back if the API refuses. */
export function useFollow(username: string) {
  const queryClient = useQueryClient();
  const key = ['runner', username.toLowerCase()];
  return useMutation({
    mutationFn: (follow: boolean) => api<{ following: boolean }>(`/users/${encodeURIComponent(username)}/follow`, { method: follow ? 'POST' : 'DELETE' }),
    onMutate(follow) {
      haptic();
      const previous = queryClient.getQueryData<PublicProfile>(key);
      if (previous && previous.followedByMe !== follow) queryClient.setQueryData<PublicProfile>(key, { ...previous, followedByMe: follow, followers: previous.followers + (follow ? 1 : -1) });
      // Any visible list row for this runner flips too.
      queryClient.setQueriesData<Connection[]>({ queryKey: ['connections'] }, (rows) => rows?.map((row) => (row.username === username ? { ...row, followedByMe: follow } : row)));
      return { previous };
    },
    onError(_error, _follow, context) {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ['connections'] });
      void queryClient.invalidateQueries({ queryKey: ['runner-search'] });
    },
  });
}

export function FollowButton({ username, following, size = 'md', preview, style }: { username: string; following: boolean; size?: 'sm' | 'md'; preview?: boolean; style?: object }) {
  const follow = useFollow(username);
  if (preview) return <View style={[{ opacity: 0.9 }, style]} pointerEvents="none"><Button size={size} title="Follow" icon={<PlusIcon size={15} />} full /></View>;
  return <View style={style}>
    <Button full size={size} variant={following ? 'secondary' : 'primary'} disabled={follow.isPending} icon={following ? <CheckIcon size={15} /> : <PlusIcon size={15} />} title={following ? 'Following' : 'Follow'}
      onPress={() => (following
        ? void confirm({ title: `Unfollow @${username}?`, confirmLabel: 'Unfollow', destructive: true }).then((ok) => { if (ok) follow.mutate(false); })
        : follow.mutate(true))} />
    {follow.error ? <Txt size={11} color="bad" style={{ marginTop: 4 }}>{follow.error.message}</Txt> : null}
  </View>;
}

/** Followers or following, each with their own follow button. */
export function ConnectionList({ username, direction }: { username: string; direction: 'followers' | 'following' }) {
  const list = useQuery({ queryKey: ['connections', username.toLowerCase(), direction], queryFn: () => api<Connection[]>(`/users/${encodeURIComponent(username)}/${direction}`) });
  if (list.isLoading) return <Skeleton style={{ height: 160 }} />;
  if (list.error) return <ErrorNotice error={list.error} onRetry={() => void list.refetch()} />;
  const rows = list.data ?? [];
  if (!rows.length) return <EmptyState title={direction === 'followers' ? 'No followers yet' : 'Not following anyone yet'}>{direction === 'followers' ? 'Share the profile link to get the first one.' : 'Follow runners from leaderboards and their profiles.'}</EmptyState>;
  return <View>
    {rows.map((row, index) => <View key={row.username} style={[styles.connection, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <Pressable onPress={() => router.push(`/runners/${row.username}`)} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={row.displayName} src={row.avatarUrl} avatarStyle={row.avatarStyle} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={15} weight="bold" numberOfLines={1}>{row.displayName}</Txt>
          <Txt size={12} color="ink2" numberOfLines={1}>{`@${row.username}${row.bio ? ` · ${row.bio}` : ''}`}</Txt>
        </View>
      </Pressable>
      {!row.isMe && <FollowButton username={row.username} following={row.followedByMe} size="sm" />}
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  // Volt with a dark icon in both themes, ringed in the page colour so it lifts off the photo.
  camera: { position: 'absolute', right: -6, bottom: -6, width: 32, height: 32, borderRadius: 16, borderWidth: 2.5, borderColor: colors.paper, backgroundColor: colors.volt, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: radius.md, borderWidth: 2, borderColor: colors.edge, backgroundColor: colors.card, padding: 20 },
  count: { flex: 1, alignItems: 'center', borderRadius: radius.md, paddingVertical: 4 },
  stats: { marginTop: 20, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  split: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.inkFaint },
  tabs: { flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: colors.line },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: 'transparent', marginBottom: -1.5 },
  square: { width: 44, height: 36, borderRadius: radius.base, borderWidth: 2, borderColor: colors.edge, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, paddingVertical: 12 },
});
