import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { onAccent } from '@/components/clubs';
import { PinIcon, PlusIcon, RepeatIcon } from '@/components/icons';
import { Avatar, Button, HardShadow, SectionTitle, Txt, useNow } from '@/components/ui';
import { api } from '@/lib/api';
import { clockLabel, clubEventsKey, distanceAway, EVENT_NOUN, nextLabel, WEEKDAYS, type ClubEvent } from '@/lib/club-events';
import { colors, display, radius, wideLabel } from '@/lib/theme';

/** The day-and-time block in the club's colour: "SAT / 7:00 am", like a sticker on a noticeboard. */
export function EventStamp({ event, size = 'md' }: { event: Pick<ClubEvent, 'weekday' | 'startTime' | 'club'>; size?: 'md' | 'lg' }) {
  const accent = event.club.accentColor || '#FF5A1F';
  const ink = onAccent(accent);
  const big = size === 'lg';
  return <HardShadow offset={big ? 3 : 2} radius={radius.lg} style={{ transform: [{ rotate: '-3deg' }] }}>
    <View style={[styles.stamp, { backgroundColor: accent, width: big ? 92 : 64, paddingVertical: big ? 12 : 8 }]}>
      <Text style={[wideLabel(big ? 15 : 11), { color: ink }]}>{WEEKDAYS[event.weekday].slice(0, 3)}</Text>
      <Text style={[display(big ? 22 : 15), { color: ink, marginTop: 2 }]} numberOfLines={1} adjustsFontSizeToFit>{clockLabel(event.startTime).replace(' ', '')}</Text>
    </View>
  </HardShadow>;
}

/** One weekly club event in a list: when, what, where, who's coming. */
export function EventCard({ event, showClub = true }: { event: ClubEvent; showClub?: boolean }) {
  const now = useNow(60_000);
  const next = nextLabel(event, now);
  const away = distanceAway(event.distanceKm);
  return <Pressable onPress={() => router.push(`/events/${event.id}`)} accessibilityRole="link" accessibilityLabel={`${event.title}, ${WEEKDAYS[event.weekday]} ${clockLabel(event.startTime)} at ${event.venue}`}>
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
            {event.going ? <View style={styles.going}><RepeatIcon size={11} color={colors.onAccent} /><Text style={[wideLabel(10), { color: colors.onAccent }]}>Going</Text></View> : null}
          </View>
        </View>
      </View>
    </HardShadow>}
  </Pressable>;
}

/** On a club's page: its weekly runs, and for managers a way to add one. */
export function ClubEventsSection({ club, manager }: { club: { slug: string; name: string; myRole?: string | null; privacy?: string }; manager: boolean }) {
  const events = useQuery({ queryKey: clubEventsKey(club.slug), queryFn: () => api<ClubEvent[]>(`/clubs/${club.slug}/events`) });
  const list = events.data ?? [];
  const add = () => router.push({ pathname: '/events/edit', params: { club: club.slug } });
  if (!list.length && !manager) return null;
  if (!list.length) {
    return <Pressable onPress={add} style={({ pressed }) => [styles.prompt, pressed && { backgroundColor: colors.inkWash }]} accessibilityRole="button">
      <View style={styles.promptIcon}><RepeatIcon size={18} color={colors.onAccent} /></View>
      <View style={{ flex: 1 }}>
        <Txt size={14} weight="bold">Add your weekly run</Txt>
        <Txt size={12.5} color="ink2">Put your regular meet-ups on the map. Runners nearby can find them and get a reminder every week.</Txt>
      </View>
      <PlusIcon size={16} />
    </Pressable>;
  }
  return <View style={{ marginTop: 24 }}>
    <SectionTitle aside={manager ? <Button size="sm" variant="quiet" title="Add" icon={<PlusIcon size={14} />} onPress={add} /> : `${list.length}`}>Weekly runs</SectionTitle>
    {list.length === 1
      ? <EventCard event={list[0]} showClub={false} />
      : <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
        {list.map((event) => <View key={event.id} style={{ width: 300 }}><EventCard event={event} showClub={false} /></View>)}
      </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  stamp: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, borderWidth: 2, borderColor: colors.edge, paddingHorizontal: 6 },
  card: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', borderRadius: radius['2xl'], borderWidth: 2, borderColor: colors.edge, backgroundColor: colors.card, padding: 14 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.track },
  going: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.volt },
  prompt: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, padding: 14, borderRadius: radius['2xl'], borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.ink3 },
  promptIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.volt, alignItems: 'center', justifyContent: 'center' },
});
