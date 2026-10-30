import { formatDistance } from '@jump/shared/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { EventCover, EventStamp } from '@/components/ClubEvents';
import { EventPass, PassSheet } from '@/components/EventPass';
import { ClubLogo } from '@/components/ClubLogo';
import { onAccent } from '@/components/clubs';
import { ArrowRightIcon, CameraIcon, ClockIcon, PinIcon, RepeatIcon, ShareIcon, TicketIcon, UsersIcon } from '@/components/icons';
import { Avatar, Button, EmptyState, ErrorNotice, Footer, haptic, HardShadow, Loading, Notice, Screen, Txt, useNow, VerifiedTick } from '@/components/ui';
import { api, isApiError, post, WEB_URL } from '@/lib/api';
import { clockLabel, distanceAway, durationLabel, EVENT_NOUN, eventKey, nextLabel, openDirections, scheduleLabel, type ClubEvent } from '@/lib/club-events';
import { confirm } from '@/lib/dialog';
import { registerForPush } from '@/lib/push';
import { useProfile, useUnit } from '@/lib/queries';
import { colors, display, radius, wideLabel } from '@/lib/theme';
import { toast } from '@/lib/toast';

/** One club event: when and where, who's coming, and your pass once you've got one. */
export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const unit = useUnit();
  const now = useNow(60_000);
  const event = useQuery({ queryKey: eventKey(id), queryFn: () => api<ClubEvent>(`/events/${id}`) });
  const profile = useProfile().data;
  const [passOpen, setPassOpen] = useState(false);

  const settle = async (next: ClubEvent) => {
    queryClient.setQueryData(eventKey(id), next);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['club-events'] }),
      queryClient.invalidateQueries({ queryKey: ['club', next.club.slug, 'events'] }),
    ]);
  };
  const join = useMutation({
    mutationFn: () => post<ClubEvent>(`/events/${event.data!.id}/join`),
    async onSuccess(next) {
      haptic('success');
      await settle(next);
      void registerForPush();
      setPassOpen(true);
    },
  });
  const leave = useMutation({
    mutationFn: () => api<ClubEvent>(`/events/${event.data!.id}/join`, { method: 'DELETE' }),
    async onSuccess(next) { haptic(); await settle(next); toast({ tone: 'ok', message: 'Pass given up. You won’t get reminders for this one.' }); },
  });
  const publish = useMutation({
    mutationFn: () => post<ClubEvent>(`/events/${id}/publish`),
    async onSuccess(next) {
      haptic('success');
      await settle(next);
      toast({ tone: 'ok', title: 'Your event is live', message: 'Members and followers just heard about it.' });
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/events/${id}`, { method: 'DELETE' }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: ['club-events'] });
      if (event.data) await queryClient.invalidateQueries({ queryKey: ['club', event.data.club.slug, 'events'] });
      toast({ tone: 'ok', message: 'Event removed.' });
      router.back();
    },
  });

  if (event.isLoading) return <Screen><Stack.Screen options={{ title: '' }} /><Loading /></Screen>;
  if (!event.data) {
    return <Screen>
      <Stack.Screen options={{ title: 'Event' }} />
      {isApiError(event.error, 404) ? <EmptyState title="This event isn’t on any more">The club may have changed its schedule.</EmptyState> : <ErrorNotice error={event.error} onRetry={() => void event.refetch()} />}
    </Screen>;
  }

  const e = event.data;
  const accent = e.club.accentColor || '#FF5A1F';
  const ink = onAccent(accent);
  const next = nextLabel(e, now);
  const away = distanceAway(e.distanceKm);
  const share = () => void Share.share({
    message: `${e.title} with ${e.club.name}: ${scheduleLabel(e)} at ${e.venue}. Join on Jump: ${WEB_URL}/events/${e.slug ?? e.id}`,
    url: `${WEB_URL}/events/${e.slug ?? e.id}`,
  });

  return <Screen refreshing={event.isRefetching} onRefresh={() => void event.refetch()} padded={false}
    footer={<Footer style={{ flexDirection: 'row', gap: 8 }}>
      {e.draft
        ? <Button style={{ flex: 1 }} full variant="primary" title="Publish now" loading={publish.isPending} onPress={() => publish.mutate()} />
        : e.isHost
        ? <Button style={{ flex: 1 }} full variant="volt" title="Check in" icon={<CameraIcon size={16} color={colors.onAccent} />} onPress={() => router.push({ pathname: '/events/scan', params: { id: e.id } })} />
        : e.pass
        ? <Button style={{ flex: 1 }} full variant="dark" icon={<TicketIcon size={16} color={colors.paper} />} title="Show my pass" onPress={() => setPassOpen(true)} />
        : e.nextAt ? <Button style={{ flex: 1 }} full variant="primary" icon={<TicketIcon size={16} color={colors.onAccent} />} title="Get your pass" loading={join.isPending} onPress={() => join.mutate()} />
          : <Button style={{ flex: 1 }} full variant="secondary" title="This event has finished" disabled />}
      <Button variant="secondary" title="Share" accessibilityLabel="Share this event" icon={<ShareIcon size={16} />} onPress={share} />
    </Footer>}>
    <Stack.Screen options={{ title: e.club.name }} />
    {e.coverUrl ? <EventCover event={e} /> : null}
    <View style={[styles.hero, { backgroundColor: accent }]}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 400 220" opacity={0.18}>
        {[0, 1, 2, 3, 4, 5].map((lane) => <Path key={lane} d={`M-20 ${240 - lane * 26}C120 ${210 - lane * 30} 260 ${140 - lane * 22} 420 ${90 - lane * 18}`} fill="none" stroke={ink} strokeWidth="3" />)}
      </Svg>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
        <EventStamp event={e} size="lg" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={[styles.when, { borderColor: ink }]}>
            {next.live ? <View style={[styles.dot, { backgroundColor: ink }]} /> : null}
            <Text style={[wideLabel(11), { color: ink }]}>{next.label}</Text>
          </View>
          <Text style={[display(28), { color: ink, marginTop: 8 }]} numberOfLines={3}>{e.title}</Text>
        </View>
      </View>
    </View>

    <View style={{ padding: 16, gap: 16 }}>
      <ErrorNotice error={join.error ?? leave.error ?? remove.error ?? publish.error} />
      {e.draft ? <Notice tone="warn" title="Draft · not posted yet">Only {e.club.name}’s managers can see it, and nobody has been told. Publish it and members and followers get a push.</Notice> : null}
      {e.pass && !e.isHost ? <Pressable onPress={() => setPassOpen(true)} accessibilityRole="button" accessibilityLabel="Open your pass"><EventPass event={e} holder={profile?.displayName ?? 'You'} behind={colors.paper} /></Pressable> : null}
      <Pressable onPress={() => router.push(`/clubs/${e.club.slug}`)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.inkWash }]} accessibilityRole="link">
        <ClubLogo club={e.club} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={12} color="ink3">Hosted by</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Txt size={15} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{e.club.name}</Txt>
            {e.club.verified ? <VerifiedTick size={16} /> : null}
          </View>
        </View>
        <ArrowRightIcon size={16} />
      </Pressable>

      <HardShadow offset={3} radius={radius['2xl']}>
        <View style={styles.panel}>
          <View style={styles.fact}>
            <RepeatIcon size={18} />
            <View style={{ flex: 1 }}>
              <Txt size={15} weight="bold">{scheduleLabel(e)}</Txt>
              <Txt size={13} color="ink2">{`${EVENT_NOUN[e.activity]} · about ${durationLabel(e.durationMinutes)}${e.distanceMetres ? ` · ${formatDistance(e.distanceMetres, unit)}` : ''}`}</Txt>
            </View>
          </View>
          <View style={styles.fact}>
            <ClockIcon size={18} />
            <View style={{ flex: 1 }}>
              <Txt size={15} weight="bold">{next.live ? 'On right now' : e.nextAt ? `Next: ${next.label}, ${clockLabel(e.startTime)}` : 'This event has finished'}</Txt>
              <Txt size={13} color="ink2">Times are local to the meeting point.</Txt>
            </View>
          </View>
          <View style={[styles.fact, { borderBottomWidth: 0 }]}>
            <PinIcon size={18} />
            <View style={{ flex: 1 }}>
              <Txt size={15} weight="bold">{e.venue ?? 'No meeting point yet'}</Txt>
              {e.address || away ? <Txt size={13} color="ink2">{[e.address, away].filter(Boolean).join(' · ')}</Txt> : null}
            </View>
          </View>
          {e.latitude != null ? <Button full variant="dark" title="Get directions" icon={<PinIcon size={16} color={colors.paper} />} onPress={() => openDirections(e)} />
            : <Button full variant="dark" title="Add the meeting point" onPress={() => router.push({ pathname: '/events/edit', params: { id: e.id } })} />}
        </View>
      </HardShadow>

      {e.notes ? <View>
        <Text style={[wideLabel(12), { marginBottom: 6 }]}>From the club</Text>
        <Txt size={15} leading={1.55}>{e.notes}</Txt>
      </View> : null}

      <View>
        <Text style={[wideLabel(12), { marginBottom: 8 }]}>{e.attendeeCount ? `${e.attendeeCount} going` : 'Who’s going'}</Text>
        {e.faces.length ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row' }}>
            {e.faces.map((face, index) => <View key={index} style={{ marginLeft: index ? -10 : 0, borderRadius: 20, borderWidth: 2, borderColor: colors.paper }}>
              <Avatar name={face.displayName} src={face.avatarUrl} avatarStyle={face.avatarStyle} size={36} round />
            </View>)}
          </View>
          {e.attendeeCount > e.faces.length ? <Txt size={13} color="ink2">{`+${e.attendeeCount - e.faces.length} more`}</Txt> : null}
        </View> : <Txt size={14} color="ink2">{e.isHost ? 'Nobody yet. Share it to get people coming.' : 'Nobody yet. Get a pass and be the first.'}</Txt>}
      </View>

      {e.pass && !e.canManage ? <Pressable hitSlop={8} style={{ alignSelf: 'center' }} disabled={leave.isPending}
        onPress={() => void confirm({ title: 'Give up your pass?', message: 'You’ll stop getting reminders for this event. You can get a new pass any time.', cancelLabel: 'Keep it', confirmLabel: 'Give it up' }).then((ok) => { if (ok) leave.mutate(); })}>
        <Txt size={13} weight="semibold" color="ink3">Can’t make it? Give up your pass</Txt>
      </Pressable> : null}

      {e.canManage && !e.draft && <Button full variant="volt" title={`Guest list · ${e.attendeeCount}`} icon={<UsersIcon size={16} color={colors.onAccent} />} onPress={() => router.push({ pathname: '/events/guests', params: { id: e.id } })} />}
      {e.canManage && <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button style={{ flex: 1 }} full variant="secondary" title="Edit" onPress={() => router.push({ pathname: '/events/edit', params: { id: e.id } })} />
        <Button style={{ flex: 1 }} full variant="danger" title="Remove" loading={remove.isPending}
          onPress={() => void confirm({ title: 'Remove this event?', message: 'It comes off the map and everyone going stops getting reminders.', cancelLabel: 'Keep it', confirmLabel: 'Remove', destructive: true }).then((ok) => { if (ok) remove.mutate(); })} />
      </View>}
    </View>
    <PassSheet open={passOpen && Boolean(e.pass)} onOpenChange={setPassOpen} event={e} holder={profile?.displayName ?? 'You'} />
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 24, overflow: 'hidden' },
  when: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card },
  panel: { gap: 14, borderRadius: radius['2xl'], borderWidth: 2, borderColor: colors.edge, backgroundColor: colors.card, padding: 16 },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});
