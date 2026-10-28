import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { DateTimePicker } from '@/components/DateTimePicker';
import { PinIcon, SearchIcon } from '@/components/icons';
import { Button, Chips, ErrorNotice, FieldLabel, Footer, haptic, Hint, Loading, Screen, Segmented, TextField, Txt } from '@/components/ui';
import { api, patch, post } from '@/lib/api';
import { deviceTimeZone, eventKey, WEEK_ORDER, WEEKDAYS, type ClubEvent, type EventActivity, type EventInput, type Place } from '@/lib/club-events';
import { useUnit } from '@/lib/queries';
import { colors, radius } from '@/lib/theme';
import { toast } from '@/lib/toast';

const DURATIONS = ['30', '45', '60', '90', '120', '180'] as const;
const MILE = 1609.344;

/** Add or edit a club's weekly event: what, which day and time, and where to meet. */
export default function EditEventScreen() {
  const { club, id } = useLocalSearchParams<{ club?: string; id?: string }>();
  const queryClient = useQueryClient();
  const unit = useUnit();
  const existing = useQuery({ queryKey: eventKey(id ?? 'new'), queryFn: () => api<ClubEvent>(`/events/${id}`), enabled: Boolean(id) });

  const [title, setTitle] = useState('');
  const [activity, setActivity] = useState<EventActivity>('run');
  const [weekday, setWeekday] = useState(6);
  const [time, setTime] = useState('07:00');
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>('60');
  const [distance, setDistance] = useState('');
  const [notes, setNotes] = useState('');
  const [timeZone, setTimeZone] = useState(deviceTimeZone());
  const [place, setPlace] = useState<Place | null>(null);
  const [venue, setVenue] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [finding, setFinding] = useState<'search' | 'here' | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    const e = existing.data;
    if (!e || loaded) return;
    setTitle(e.title); setActivity(e.activity); setWeekday(e.weekday); setTime(e.startTime);
    setDuration((DURATIONS as readonly string[]).includes(String(e.durationMinutes)) ? String(e.durationMinutes) as (typeof DURATIONS)[number] : '60');
    setDistance(e.distanceMetres ? String(+(e.distanceMetres / (unit === 'mi' ? MILE : 1000)).toFixed(1)) : '');
    setNotes(e.notes ?? ''); setTimeZone(e.timeZone); setVenue(e.venue);
    setPlace({ name: e.venue, address: e.address ?? '', latitude: e.latitude, longitude: e.longitude });
    setLoaded(true);
  }, [existing.data, loaded, unit]);

  async function findPlaces() {
    const query = search.trim();
    if (query.length < 2) return;
    setFinding('search'); setPlaceError(null);
    try {
      const found = await api<Place[]>(`/geo/search?q=${encodeURIComponent(query)}${place ? `&lat=${place.latitude}&lon=${place.longitude}` : ''}`);
      setResults(found);
      if (!found.length) setPlaceError('Nothing found. Try the park, street or landmark name with the town.');
    } catch {
      setPlaceError('Couldn’t search right now. Try again, or use where you are.');
    } finally { setFinding(null); }
  }

  async function pinHere() {
    setFinding('here'); setPlaceError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { setPlaceError('Allow location to drop the pin where you’re standing.'); return; }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = position.coords;
      const named = await api<{ name: string | null }>(`/geo/place?lat=${latitude.toFixed(5)}&lon=${longitude.toFixed(5)}`).catch(() => ({ name: null }));
      choose({ name: venue || '', address: named.name ?? '', latitude, longitude });
    } catch {
      setPlaceError('Couldn’t get your location. Try again outside, or search instead.');
    } finally { setFinding(null); }
  }

  function choose(next: Place) {
    haptic();
    setPlace(next);
    if (next.name) setVenue(next.name);
    setResults(null);
    setSearch('');
  }

  const km = Number(distance.replace(',', '.'));
  const distanceMetres = distance.trim() && Number.isFinite(km) && km > 0 ? Math.round(km * (unit === 'mi' ? MILE : 1000)) : null;
  const problem = title.trim().length < 2 ? 'Add a name'
    : !place ? 'Set the meeting point'
      : venue.trim().length < 2 ? 'Name the meeting point'
        : distance.trim() && (!distanceMetres || distanceMetres < 500 || distanceMetres > 200_000) ? 'Fix the distance'
          : null;

  const save = useMutation({
    mutationFn: () => {
      const input: EventInput = {
        title: title.trim(), activity, weekday, startTime: time, timeZone, durationMinutes: Number(duration), distanceMetres,
        venue: venue.trim(), address: place?.address.trim() || null, latitude: place!.latitude, longitude: place!.longitude, notes: notes.trim() || null,
      };
      return id ? patch<ClubEvent>(`/events/${id}`, input) : post<ClubEvent>(`/clubs/${club}/events`, input);
    },
    async onSuccess(saved) {
      haptic('success');
      queryClient.setQueryData(eventKey(saved.id), saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['club', saved.club.slug, 'events'] }),
        queryClient.invalidateQueries({ queryKey: ['club-events'] }),
      ]);
      toast({ tone: 'ok', title: id ? 'Saved' : 'Your weekly run is live', message: id ? 'Everyone going sees the update.' : 'Members and followers just heard about it. Share it to bring more people.' });
      if (id) router.back(); else router.replace(`/events/${saved.id}`);
    },
  });

  if (id && !loaded) return <Screen><Stack.Screen options={{ title: 'Edit run' }} />{existing.error ? <ErrorNotice error={existing.error} onRetry={() => void existing.refetch()} /> : <Loading />}</Screen>;

  const submit = () => {
    if (problem) { haptic('warning'); toast({ tone: 'warn', message: `${problem} first.` }); return; }
    save.mutate();
  };

  return <Screen footer={<Footer>
    {problem ? <Txt size={12.5} color="ink2" align="center" style={{ marginBottom: 8 }}>{`${problem} to post it.`}</Txt> : null}
    <Button full size="lg" variant="primary" title={id ? 'Save changes' : 'Post weekly run'} loading={save.isPending} onPress={submit} />
  </Footer>}>
    <Stack.Screen options={{ title: id ? 'Edit weekly run' : 'New weekly run' }} />
    <View style={{ gap: 20 }}>
      <TextField label="Name" placeholder="Saturday Social 5K" value={title} onChangeText={setTitle} maxLength={80} />

      <View>
        <FieldLabel label="What" />
        <Segmented label="Activity" value={activity} onChange={setActivity} options={[{ value: 'run', label: 'Run' }, { value: 'walk', label: 'Walk' }, { value: 'cycle', label: 'Ride' }, { value: 'any', label: 'Any' }]} />
      </View>

      <View>
        <FieldLabel label="Every" />
        <View style={styles.days} accessibilityRole="radiogroup" accessibilityLabel="Day of the week">
          {WEEK_ORDER.map((day) => {
            const active = day === weekday;
            return <Pressable key={day} onPress={() => { haptic(); setWeekday(day); }} accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={WEEKDAYS[day]}
              style={[styles.day, active && { backgroundColor: colors.ink, borderColor: colors.ink }]}>
              <Txt size={13} weight="bold" color={active ? 'paper' : 'ink'}>{WEEKDAYS[day].slice(0, 3)}</Txt>
            </Pressable>;
          })}
        </View>
      </View>

      <DateTimePicker label="Starts at" timeOnly value={`2000-01-01T${time}`} onChange={(value) => setTime(value.slice(11, 16))}
        hint={timeZone === deviceTimeZone() ? undefined : `In the meeting point’s time zone (${timeZone}).`} />

      <View>
        <FieldLabel label="Lasts about" />
        <Chips label="Duration" value={duration} onChange={setDuration} options={DURATIONS.map((value) => ({ value, label: Number(value) < 60 ? `${value} min` : `${Number(value) / 60} h`.replace('.5 h', ' h 30') }))} />
      </View>

      <TextField label="Distance" optional placeholder="5" keyboardType="decimal-pad" value={distance} onChangeText={setDistance} right={<Txt size={14} color="ink2">{unit}</Txt>} />

      <View>
        <FieldLabel label="Meeting point" />
        {place ? <View style={styles.pinned}>
          <View style={styles.pin}><PinIcon size={18} color={colors.onAccent} /></View>
          <View style={{ flex: 1, gap: 8 }}>
            <TextField placeholder="e.g. Main gate, Muri Okunola Park" value={venue} onChangeText={setVenue} maxLength={120} />
            {place.address ? <Txt size={12.5} color="ink2">{place.address}</Txt> : null}
            <Txt size={12} color="ink3" num>{`${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`}</Txt>
          </View>
        </View> : null}
        <View style={{ marginTop: place ? 12 : 0, gap: 10 }}>
          <TextField placeholder={place ? 'Search to move the pin' : 'Search a park, street or landmark'} value={search} onChangeText={(value) => { setSearch(value); setPlaceError(null); }}
            returnKeyType="search" onSubmitEditing={() => void findPlaces()} left={<SearchIcon size={16} color={colors.ink3} />}
            right={search.trim().length >= 2 ? <Button size="sm" variant="dark" title="Find" loading={finding === 'search'} onPress={() => void findPlaces()} /> : undefined} error={placeError ?? undefined} />
          {results?.length ? <View style={styles.results}>
            {results.map((result, index) => <Pressable key={`${result.latitude},${result.longitude}`} onPress={() => choose(result)}
              style={({ pressed }) => [styles.result, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, pressed && { backgroundColor: colors.inkWash }]}>
              <PinIcon size={16} color={colors.ink3} />
              <View style={{ flex: 1 }}>
                <Txt size={14} weight="semibold" numberOfLines={1}>{result.name}</Txt>
                <Txt size={12} color="ink3" numberOfLines={1}>{result.address}</Txt>
              </View>
            </Pressable>)}
          </View> : null}
          <Button variant="secondary" size="sm" title="I’m there now: use my location" icon={<PinIcon size={14} />} loading={finding === 'here'} onPress={() => void pinHere()} />
          <Hint>Runners nearby find your run by this pin, and the Directions button takes them straight to it.</Hint>
        </View>
      </View>

      <TextField label="Notes" optional multiline placeholder="Pace groups, where to leave bags, what happens after…" value={notes} onChangeText={setNotes} maxLength={600} style={{ minHeight: 96 }} />
      <ErrorNotice error={save.error} />
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.base, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white },
  pinned: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: radius['2xl'], borderWidth: 2, borderColor: colors.edge, backgroundColor: colors.card },
  pin: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.volt, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  results: { borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, overflow: 'hidden' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
