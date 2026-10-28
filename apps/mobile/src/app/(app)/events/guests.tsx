import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraIcon, CheckIcon, SearchIcon, TicketIcon } from '@/components/icons';
import { Avatar, Button, EmptyState, ErrorNotice, haptic, Loading, Screen, TextField, Txt } from '@/components/ui';
import { api, post } from '@/lib/api';
import { clockLabel, eventKey, posterTime, type ClubEvent, type Guest } from '@/lib/club-events';
import { colors, mono, radius, score, wideLabel } from '@/lib/theme';
import { toast } from '@/lib/toast';

/**
 * The host's door list for the next session: everyone holding a pass, checked in by tapping their name
 * or typing the code off their pass. Check-ins count for that session only, so a weekly run starts fresh.
 */
export default function GuestsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const event = useQuery({ queryKey: eventKey(id), queryFn: () => api<ClubEvent>(`/events/${id}`) });
  const list = useQuery({ queryKey: ['club-event', id, 'guests'], queryFn: () => api<{ nextAt: string | null; guests: Guest[] }>(`/events/${id}/guests`), refetchInterval: 15_000 });
  const [code, setCode] = useState('');
  const [search, setSearch] = useState('');

  const set = (userId: string, checkedIn: boolean) => queryClient.setQueryData<{ nextAt: string | null; guests: Guest[] }>(['club-event', id, 'guests'],
    (data) => data && { ...data, guests: data.guests.map((guest) => (guest.userId === userId ? { ...guest, checkedIn } : guest)) });
  const checkIn = useMutation({
    mutationFn: (match: { code?: string; userId?: string }) => post<{ userId: string; checkedIn: boolean }>(`/events/${id}/check-in`, match),
    onSuccess(result) {
      haptic('success');
      set(result.userId, true);
      const guest = list.data?.guests.find((row) => row.userId === result.userId);
      toast({ tone: 'ok', message: `${guest?.displayName ?? 'Runner'} is checked in.` });
      setCode('');
    },
    onError: (error) => { haptic('warning'); toast({ tone: 'bad', message: error.message }); },
  });
  const undo = useMutation({
    mutationFn: (userId: string) => api<{ userId: string }>(`/events/${id}/check-in/${userId}`, { method: 'DELETE' }),
    onSuccess(result) { haptic(); set(result.userId, false); },
    onError: (error) => toast({ tone: 'bad', message: error.message }),
  });

  if (list.isLoading || event.isLoading) return <Screen><Stack.Screen options={{ title: 'Guest list' }} /><Loading /></Screen>;
  if (!list.data || !event.data) return <Screen><ErrorNotice error={list.error ?? event.error} onRetry={() => void list.refetch()} /></Screen>;

  const guests = list.data.guests;
  const inCount = guests.filter((guest) => guest.checkedIn).length;
  const query = search.trim().toLowerCase();
  const shown = guests.filter((guest) => !query || `${guest.displayName ?? ''} ${guest.username ?? ''} ${guest.passCode}`.toLowerCase().includes(query));
  const typed = code.trim().toUpperCase();

  return <Screen refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
    <Stack.Screen options={{ title: 'Guest list' }} />
    <View style={styles.tally}>
      <View style={{ flex: 1 }}>
        <Text style={[wideLabel(11), { color: colors.ink2 }]}>{list.data.nextAt ? `${posterTime(event.data)}` : 'Finished'}</Text>
        <Txt size={16} weight="bold" numberOfLines={1} style={{ marginTop: 2 }}>{event.data.title}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={score(36)}>{`${inCount}/${guests.length}`}</Text>
        <Text style={[wideLabel(10), { color: colors.ink2 }]}>Checked in</Text>
      </View>
    </View>
    <View style={styles.meter}><View style={[styles.meterFill, { flex: inCount || 0.0001 }]} /><View style={{ flex: Math.max(guests.length - inCount, 0.0001) }} /></View>

    <Button full size="lg" variant="dark" style={{ marginTop: 20 }} title="Scan passes" icon={<CameraIcon size={18} color={colors.paper} />} onPress={() => router.push({ pathname: '/events/scan', params: { id } })} />
    <Txt size={12.5} color="ink3" align="center" style={{ marginTop: 14 }}>Or type the code from their pass</Txt>
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
      <TextField containerStyle={{ flex: 1 }} placeholder="Pass code, e.g. JMP-7K2Q9X" autoCapitalize="characters" autoCorrect={false} value={code} onChangeText={setCode}
        left={<TicketIcon size={16} color={colors.ink3} />} returnKeyType="done" onSubmitEditing={() => typed.length >= 4 && checkIn.mutate({ code: typed.startsWith('JMP-') ? typed : `JMP-${typed}` })} />
      <Button variant="dark" title="Check in" disabled={typed.length < 4} loading={checkIn.isPending && Boolean(code)} onPress={() => checkIn.mutate({ code: typed.startsWith('JMP-') ? typed : `JMP-${typed}` })} />
    </View>
    <Txt size={12} color="ink3" style={{ marginTop: 6 }}>{`Opens 12 hours before it starts at ${clockLabel(event.data.startTime)}. Each session starts a fresh list.`}</Txt>

    {guests.length > 6 ? <TextField containerStyle={{ marginTop: 16 }} placeholder="Find a name" value={search} onChangeText={setSearch} left={<SearchIcon size={16} color={colors.ink3} />} /> : null}

    <View style={{ marginTop: 16 }}>
      {!guests.length ? <EmptyState title="No passes yet">Share the event so people can get a pass. They’ll show up here.</EmptyState>
        : <View style={styles.list}>{shown.map((guest, index) => <View key={guest.userId} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
          <Avatar name={guest.displayName} src={guest.avatarUrl} avatarStyle={guest.avatarStyle} size={40} round />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt size={15} weight="bold" numberOfLines={1}>{guest.displayName ?? 'Runner'}</Txt>
            <Text style={{ fontFamily: mono, fontSize: 12.5, color: colors.ink3, marginTop: 1 }}>{guest.passCode}</Text>
          </View>
          {guest.checkedIn
            ? <Pressable onPress={() => undo.mutate(guest.userId)} accessibilityRole="button" accessibilityLabel={`Undo check-in for ${guest.displayName ?? 'runner'}`} style={[styles.toggle, styles.toggleOn]}>
              <CheckIcon size={14} color={colors.onAccent} /><Txt size={13} weight="bold" style={{ color: colors.onAccent }}>In</Txt>
            </Pressable>
            : <Pressable onPress={() => checkIn.mutate({ userId: guest.userId })} accessibilityRole="button" accessibilityLabel={`Check in ${guest.displayName ?? 'runner'}`} style={styles.toggle}>
              <Txt size={13} weight="bold">Check in</Txt>
            </Pressable>}
        </View>)}</View>}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  tally: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  meter: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 12, backgroundColor: colors.inkWash },
  meterFill: { backgroundColor: colors.volt },
  list: { borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.edge, paddingHorizontal: 14, paddingVertical: 8 },
  toggleOn: { backgroundColor: colors.volt, borderColor: colors.volt },
});
