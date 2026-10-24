import { countryName } from '@jump/shared/countries';
import { activityName, formatDate, formatDistanceNumber, formatDuration, formatPace, formatRelative, formatSpeed } from '@jump/shared/format';
import type { PublicProfile } from '@jump/shared/types';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LockIcon, RunIcon } from '@/components/icons';
import { OptionSheet } from '@/components/Sheet';
import { ConnectionList, FollowButton, ProfileHero, ProfileStats, ProfileTabs, ShareProfileButton } from '@/components/Profile';
import { Avatar, Button, EmptyState, ErrorNotice, Loading, Screen, Txt } from '@/components/ui';
import { api, isApiError, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useUnit } from '@/lib/queries';
import { colors, radius, score } from '@/lib/theme';
import { toast } from '@/lib/toast';

type Tab = 'activity' | 'followers' | 'following';

export default function RunnerScreen() {
  const params = useLocalSearchParams<{ username: string; tab?: Tab }>();
  const username = params.username;
  const { user } = useAuth();
  const unit = useUnit();
  const [tab, setTab] = useState<Tab>(params.tab === 'followers' || params.tab === 'following' ? params.tab : 'activity');
  const runner = useQuery({ queryKey: ['runner', username.toLowerCase()], queryFn: () => api<PublicProfile>(`/users/${encodeURIComponent(username)}`) });
  if (runner.isLoading) return <Screen><Stack.Screen options={{ title: `@${username}` }} /><Loading /></Screen>;
  if (runner.error || !runner.data) {
    return <Screen>
      <Stack.Screen options={{ title: `@${username}` }} />
      {isApiError(runner.error, 404) ? <EmptyState title="Runner not found">{`There’s no runner called @${username}.`}</EmptyState> : <ErrorNotice error={runner.error} onRetry={() => void runner.refetch()} />}
    </Screen>;
  }
  const data = runner.data;
  const isMe = data.isMe;
  return <Screen refreshing={runner.isRefetching} onRefresh={() => void runner.refetch()}>
    <Stack.Screen options={{ title: `@${data.username}` }} />
    {isMe && <View style={styles.preview}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.volt }} />
      <Txt size={13} weight="semibold" color="paper" style={{ flex: 1 }}>Preview: how other runners see you</Txt>
      <Pressable onPress={() => router.back()} hitSlop={8}><Txt size={12} weight="bold" upper tracking={0.06} color="volt">Done</Txt></Pressable>
    </View>}
    <ProfileHero
      avatar={<Avatar name={data.displayName} src={data.avatarUrl} avatarStyle={data.avatarStyle} size={84} style={{ borderRadius: radius.lg }} />}
      displayName={data.displayName}
      verified={data.verified}
      username={data.username}
      meta={`${countryName(data.countryCode)} · Joined ${formatDate(data.memberSince, { month: 'short', year: 'numeric' })}`}
      bio={data.bio}
      counts={{ activities: data.stats.activities, followers: data.followers, following: data.following }}
      actions={<>
        <FollowButton username={data.username} following={data.followedByMe} size="sm" preview={isMe} style={{ flex: 1 }} />
        {!isMe && user && <Button size="sm" variant="secondary" full style={{ flex: 1 }} title="Message" onPress={() => router.push(`/messages/${data.username}`)} />}
        {!isMe && <InviteButton username={data.username} />}
        <ShareProfileButton username={data.username} displayName={data.displayName} />
      </>}
    >
      {data.followsMe && !isMe ? <Txt size={12} weight="semibold" color="ink2" style={{ marginTop: 12 }}>Follows you</Txt> : null}
      <ProfileStats stats={data.stats} unit={unit} />
    </ProfileHero>

    <View style={{ marginTop: 24, marginBottom: 20 }}>
      <ProfileTabs<Tab> value={tab} onChange={setTab} tabs={[{ value: 'activity', label: 'Activity' }, { value: 'followers', label: 'Followers' }, { value: 'following', label: 'Following' }]} />
    </View>

    {tab !== 'activity' ? <ConnectionList key={tab} username={data.username} direction={tab} />
      : !data.runsVisible ? <EmptyState mark={<LockIcon size={36} color={colors.ink3} />} title="Activity is private">
        {data.followedByMe ? `${data.displayName.split(' ')[0]} hasn’t shared individual walks and runs.` : 'Their verified totals are public, but individual walks and runs are not shared with you.'}
      </EmptyState>
        : data.recent && (data.recent.length === 0 ? <EmptyState title="No verified activity yet">Verified walks and runs will show here.</EmptyState>
          : <View style={styles.list}>{data.recent.map((item, index) => {
            const pace = item.activityType === 'cycle' ? formatSpeed(item.metres, item.movingSeconds, unit) : formatPace(item.metres, item.movingSeconds, unit);
            return <View key={index} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
              <View style={[styles.badge, { backgroundColor: item.activityType === 'run' ? colors.track : colors.ink }]}><RunIcon size={18} color={item.activityType === 'run' ? colors.paper : colors.volt} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={14} weight="bold" numberOfLines={1}>{activityName(item.startedAt, item.activityType)}</Txt>
                <Txt size={12} color="ink2" num>{`${formatRelative(item.startedAt)} · ${formatDuration(item.movingSeconds)}${pace ? ` · ${pace}${item.activityType === 'cycle' ? '' : ` /${unit}`}` : ''}`}</Txt>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Text style={score(24)}>{formatDistanceNumber(item.metres, unit)}</Text>
                <Txt size={12} weight="semibold" color="ink2">{unit}</Txt>
              </View>
            </View>;
          })}</View>)}
  </Screen>;
}

/** Invite this runner to one of the open competitions you host. */
function InviteButton({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const tables = useQuery({ queryKey: ['tables', 'mine'], queryFn: () => api<Array<{ id: string; title: string; status: string; hosting: boolean }>>('/tables/mine'), enabled: open });
  const hosted = tables.data?.filter((table) => table.hosting && table.status === 'OPEN_FOR_ENTRY') ?? [];
  const invite = useMutation({
    mutationFn: (tableId: string) => post(`/tables/${tableId}/invitations`, { username }),
    onSuccess: () => toast({ tone: 'ok', message: `Invited @${username}.` }),
    onError: (error) => toast({ tone: 'bad', message: error.message }),
  });
  return <>
    <Button size="sm" variant="secondary" full style={{ flex: 1 }} title="Invite" onPress={() => setOpen(true)} />
    <OptionSheet open={open} onOpenChange={setOpen} title={`Invite @${username}`} value={null} onChange={(tableId) => invite.mutate(tableId)}
      description={tables.isLoading ? 'Loading competitions…' : hosted.length ? 'Pick one of your open competitions.' : 'You have no open competitions to invite them to.'}
      options={hosted.map((table) => ({ value: table.id, label: table.title }))} />
  </>;
}

const styles = StyleSheet.create({
  preview: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, backgroundColor: colors.ink, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 12 },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 4, paddingVertical: 14 },
  badge: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
