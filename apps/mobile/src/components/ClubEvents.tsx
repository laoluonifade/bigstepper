import { formatDistance } from '@jump/shared/format';
import type { Unit } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ClubLogo } from '@/components/ClubLogo';
import { onAccent } from '@/components/clubs';
import { CalendarIcon, CheckIcon, PinIcon, PlusIcon, RepeatIcon, UsersIcon } from '@/components/icons';
import { Avatar, Button, haptic, HardShadow, SectionTitle, Txt, useNow } from '@/components/ui';
import { api, post } from '@/lib/api';
import { ACTIVITY_WORD, clockLabel, dateLabel, repeatRule, scheduleLabel, type Schedule, clubEventsKey, distanceAway, EVENT_NOUN, eventKey, nextLabel, posterTime, WEEKDAYS, type ClubEvent } from '@/lib/club-events';
import { registerForPush } from '@/lib/push';
import { colors, display, fontFamily, radius, wideLabel } from '@/lib/theme';
import { toast } from '@/lib/toast';

/** The day-and-time block in the club's colour: "SAT / 7:00 am", like a sticker on a noticeboard. */
export function EventStamp({ event, size = 'md' }: { event: Pick<ClubEvent, 'weekday' | 'startTime' | 'club' | 'repeat' | 'startsOn'>; size?: 'md' | 'lg' }) {
  const accent = event.club.accentColor || '#FF5A1F';
  const ink = onAccent(accent);
  const big = size === 'lg';
  return <HardShadow offset={big ? 3 : 2} radius={radius.lg} style={{ transform: [{ rotate: '-3deg' }] }}>
    <View style={[styles.stamp, { backgroundColor: accent, width: big ? 92 : 64, paddingVertical: big ? 12 : 8 }]}>
      <Text style={[wideLabel(big ? 15 : 11), { color: ink }]}>{event.repeat === 'once' ? dateLabel(event.startsOn).slice(4) : WEEKDAYS[event.weekday].slice(0, 3)}</Text>
      <Text style={[display(big ? 22 : 15), { color: ink, marginTop: 2 }]} numberOfLines={1} adjustsFontSizeToFit>{clockLabel(event.startTime).replace(' ', '')}</Text>
    </View>
  </HardShadow>;
}

/** One weekly club event in a list: when, what, where, who's coming. */
export function EventCard({ event, showClub = true }: { event: ClubEvent; showClub?: boolean }) {
  const now = useNow(60_000);
  const next = nextLabel(event, now);
  const away = distanceAway(event.distanceKm);
  return <Pressable onPress={() => router.push(`/events/${event.id}`)} accessibilityRole="link" accessibilityLabel={`${event.title}, ${scheduleLabel(event)} at ${event.venue}`}>
    {({ pressed }) => <HardShadow offset={3} radius={radius['2xl']} pressed={pressed}>
      <View style={styles.card}>
        <EventStamp event={event} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {next.live ? <View style={styles.liveDot} /> : null}
            <Txt size={11.5} weight="bold" color={next.live ? 'track' : 'ink2'} upper width="wide">{`${next.label} · ${EVENT_NOUN[event.activity]}`}</Txt>
          </View>
          <Txt size={16} weight="extrabold" numberOfLines={1}>{event.title}</Txt>
          {showClub ? <Txt size={13} weight="semibold" color="ink2" numberOfLines={1}>{event.club.name}</Txt> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <PinIcon size={13} color={colors.ink3} />
            <Txt size={12.5} color="ink3" numberOfLines={1} style={{ flexShrink: 1 }}>{away ? `${event.venue} · ${away}` : event.venue}</Txt>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {event.faces.length ? <View style={{ flexDirection: 'row' }}>
              {event.faces.slice(0, 4).map((face, index) => <View key={index} style={{ marginLeft: index ? -7 : 0, borderRadius: 13, borderWidth: 2, borderColor: colors.card }}>
                <Avatar name={face.displayName} src={face.avatarUrl} avatarStyle={face.avatarStyle} size={22} round />
              </View>)}
            </View> : null}
            <Txt size={12} color="ink2" num style={{ flex: 1 }}>{event.attendeeCount ? `${event.attendeeCount} going` : 'Be the first to join'}</Txt>
            {event.going && !event.isHost ? <View style={styles.going}><RepeatIcon size={11} color={colors.onAccent} /><Text style={[wideLabel(10), { color: colors.onAccent }]}>Going</Text></View> : null}
          </View>
        </View>
      </View>
    </HardShadow>}
  </Pressable>;
}

/** The event's photo, or the club's colour with running lanes and the day when there isn't one. */
export function EventCover({ event, style }: { event: Pick<ClubEvent, 'coverUrl' | 'club' | 'startTime' | 'startsOn'> & Schedule; style?: object }) {
  const accent = event.club.accentColor || '#FF5A1F';
  const ink = onAccent(accent);
  if (event.coverUrl) return <Image source={{ uri: event.coverUrl }} style={[styles.cover, style]} contentFit="cover" transition={150} accessible={false} />;
  return <View style={[styles.cover, { backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }, style]}>
    <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 400 220" opacity={0.18}>
      {[0, 1, 2, 3, 4, 5].map((lane) => <Path key={lane} d={`M-20 ${240 - lane * 26}C120 ${210 - lane * 30} 260 ${140 - lane * 22} 420 ${90 - lane * 18}`} fill="none" stroke={ink} strokeWidth="3" />)}
    </Svg>
    <Text style={[wideLabel(13), { color: ink, opacity: 0.8 }]}>{repeatRule(event)}</Text>
    <Text style={[display(40), { color: ink, marginTop: 2 }]}>{clockLabel(event.startTime).replace(' ', '').toUpperCase()}</Text>
  </View>;
}

/** Getting a pass to an event from wherever it's listed: one tap in, with reminders before each session. */
export function useEventRsvp(event: ClubEvent) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => post<ClubEvent>(`/events/${event.id}/join`),
    async onSuccess(next) {
      haptic('success');
      queryClient.setQueryData(eventKey(next.id), next);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['club-events'] }), queryClient.invalidateQueries({ queryKey: clubEventsKey(next.club.slug) })]);
      void registerForPush();
      toast({ tone: 'ok', title: 'You’ve got a pass', message: 'It’s on the event page. Jump reminds you the day before and an hour before.' });
    },
    onError: (error) => toast({ tone: 'bad', message: error.message }),
  });
}

/**
 * An event in Explore, built on the same frame as a competition card so the two sit together: an optional
 * cover strip, what it is, who's hosting, when and where, who's coming, and RSVP.
 */
export function ExploreEventCard({ event, unit }: { event: ClubEvent; unit: Unit }) {
  const now = useNow(60_000);
  const next = nextLabel(event, now);
  const rsvp = useEventRsvp(event);
  const away = distanceAway(event.distanceKm);
  const when = next.live ? `Happening now · ${posterTime(event, now)}` : posterTime(event, now);
  const where = [event.venue, event.distanceMetres ? `${formatDistance(event.distanceMetres, unit)} ${EVENT_NOUN[event.activity].toLowerCase()}` : away].filter(Boolean).join(' · ');
  const going = event.going || rsvp.isSuccess;
  return <Pressable onPress={() => router.push(`/events/${event.id}`)} accessibilityRole="button" accessibilityLabel={`Event: ${event.title}`}
    style={({ pressed }) => [styles.poster, pressed && { opacity: 0.85 }]}>
    {event.coverUrl ? <Image source={{ uri: event.coverUrl }} style={styles.posterBanner} contentFit="cover" transition={150} accessible={false} /> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <View style={styles.eventTag}><Text style={[wideLabel(10.5), { color: '#4DA3FF' }]}>Event</Text></View>
      <Txt size={13} color="ink3" numberOfLines={1} style={{ flexShrink: 1 }}>{`${ACTIVITY_WORD[event.activity]} · In person`}</Txt>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <ClubLogo club={event.club} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={16} weight="bold" numberOfLines={1}>{event.title}</Txt>
        <Txt size={13} color={next.live ? 'track' : 'ink3'} weight={next.live ? 'semibold' : 'regular'} numberOfLines={1} style={{ marginTop: 2 }}>{when}</Txt>
      </View>
      <Txt size={13} weight="semibold" color="ink3">Free</Txt>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.line}><PinIcon size={13} color={colors.ink3} /><Txt size={13} color="ink2" numberOfLines={1} style={{ flexShrink: 1 }}>{where}</Txt></View>
        <View style={[styles.line, { marginTop: 2 }]}>
          <UsersIcon size={12} color={colors.ink3} />
          <Txt size={12} color="ink3" num>{`${event.attendeeCount + (rsvp.isSuccess && !event.going ? 1 : 0)} attending · ${event.club.name}`}</Txt>
        </View>
      </View>
      {event.isHost ? <View style={styles.inPill}><Txt size={12} weight="bold">Hosting</Txt></View>
        : going ? <View style={[styles.inPill, { backgroundColor: colors.volt, borderColor: colors.volt }]}><Txt size={12} weight="bold" style={{ color: colors.onAccent }}>Going</Txt></View>
          : <Pressable onPress={() => rsvp.mutate()} disabled={rsvp.isPending} hitSlop={6} accessibilityRole="button" accessibilityLabel={`RSVP to ${event.title}`}
            style={({ pressed }) => [styles.rsvp, (pressed || rsvp.isPending) && { opacity: 0.7, transform: [{ scale: 0.96 }] }]}>
            <Txt size={13} weight="bold" color="paper">{rsvp.isPending ? 'Joining…' : 'RSVP'}</Txt>
          </Pressable>}
    </View>
  </Pressable>;
}

/** On a club's page: its upcoming events, and for managers a way to add one. */
export function ClubEventsSection({ club, manager }: { club: { slug: string; name: string; myRole?: string | null; privacy?: string }; manager: boolean }) {
  const events = useQuery({ queryKey: clubEventsKey(club.slug), queryFn: () => api<ClubEvent[]>(`/clubs/${club.slug}/events`) });
  const list = events.data ?? [];
  const add = () => router.push({ pathname: '/events/edit', params: { club: club.slug } });
  if (!list.length && !manager) return null;
  if (!list.length) {
    return <Pressable onPress={add} style={({ pressed }) => [styles.prompt, pressed && { backgroundColor: colors.inkWash }]} accessibilityRole="button">
      <View style={styles.promptIcon}><RepeatIcon size={18} color={colors.onAccent} /></View>
      <View style={{ flex: 1 }}>
        <Txt size={14} weight="bold">Add an event</Txt>
        <Txt size={12.5} color="ink2">Your weekly run, a monthly long run or a one-off race day. Runners nearby find it, get a pass and a reminder.</Txt>
      </View>
      <PlusIcon size={16} />
    </Pressable>;
  }
  return <View style={{ marginTop: 24 }}>
    <SectionTitle aside={manager ? <Button size="sm" variant="quiet" title="Add" icon={<PlusIcon size={14} />} onPress={add} /> : `${list.length}`}>Events</SectionTitle>
    {list.length === 1
      ? <EventCard event={list[0]} showClub={false} />
      : <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
        {list.map((event) => <View key={event.id} style={{ width: 300 }}><EventCard event={event} showClub={false} /></View>)}
      </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  cover: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.inkWash, overflow: 'hidden' },
  poster: { borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, overflow: 'hidden' },
  posterBanner: { marginHorizontal: -16, marginTop: -16, marginBottom: 14, aspectRatio: 3, backgroundColor: colors.inkWash },
  inPill: { borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.edge, paddingHorizontal: 12, paddingVertical: 4 },
  clubChip: { position: 'absolute', left: 12, bottom: 12, maxWidth: '70%', borderRadius: radius.full, backgroundColor: 'rgba(18,18,18,0.72)', paddingHorizontal: 12, paddingVertical: 6 },
  clubChipText: { fontFamily: fontFamily('semibold'), fontSize: 13, color: '#F2EFE8' },
  eventTag: { borderRadius: radius.base, backgroundColor: 'rgba(77,163,255,0.16)', paddingHorizontal: 8, paddingVertical: 3 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rsvp: { height: 36, borderRadius: radius.full, backgroundColor: colors.ink, paddingHorizontal: 20, justifyContent: 'center' },
  goingPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.full, backgroundColor: colors.volt, paddingHorizontal: 16, paddingVertical: 10 },
  stamp: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, borderWidth: 2, borderColor: colors.edge, paddingHorizontal: 6 },
  card: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', borderRadius: radius['2xl'], borderWidth: 2, borderColor: colors.edge, backgroundColor: colors.card, padding: 14 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.track },
  going: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.volt },
  prompt: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, padding: 14, borderRadius: radius['2xl'], borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.ink3 },
  promptIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.volt, alignItems: 'center', justifyContent: 'center' },
});
