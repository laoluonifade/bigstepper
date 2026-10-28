import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { EventCover } from '@/components/ClubEvents';
import { DateTimePicker } from '@/components/DateTimePicker';
import { RepeatEditor, scheduleFor } from '@/components/RepeatEditor';
import { CameraIcon, CloseIcon, PinIcon, SearchIcon } from '@/components/icons';
import { SelectField } from '@/components/pickers';
import { Button, ErrorNotice, FieldLabel, Footer, haptic, Hint, Loading, Screen, TextField, Txt } from '@/components/ui';
import { api, patch, post } from '@/lib/api';
import { ACTIVITY_OPTIONS, deviceTimeZone, todayIso, type Schedule, durationLabel, eventKey, MAX_DURATION, MIN_DURATION, type ClubEvent, type EventActivity, type EventInput, type Place } from '@/lib/club-events';
import { useUnit } from '@/lib/queries';
import { colors, radius } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { pickPhoto, uploadPhoto, type PickedPhoto } from '@/lib/upload';

const MILE = 1609.344;

/** Add or edit a club's event: what, when (once or on repeat), and where to meet. */
export default function EditEventScreen() {
  const { club, id } = useLocalSearchParams<{ club?: string; id?: string }>();
  const queryClient = useQueryClient();
  const unit = useUnit();
  const existing = useQuery({ queryKey: eventKey(id ?? 'new'), queryFn: () => api<ClubEvent>(`/events/${id}`), enabled: Boolean(id) });

  const [title, setTitle] = useState('');
  const [activity, setActivity] = useState<EventActivity>('run');
  const [startsOn, setStartsOn] = useState(todayIso());
  const [schedule, setSchedule] = useState<Schedule>(() => scheduleFor('once', todayIso()));
  const [time, setTime] = useState('07:00');
  const [hours, setHours] = useState('1');
  const [minutes, setMinutes] = useState('0');
  const [distance, setDistance] = useState('');
  const [notes, setNotes] = useState('');
  const [timeZone, setTimeZone] = useState(deviceTimeZone());
  const [place, setPlace] = useState<Place | null>(null);
  const [venue, setVenue] = useState('');
  const [search, setSearch] = useState('');
  // Once a place is picked, the search and "I'm there now" step aside until Change is tapped.
  const [changing, setChanging] = useState(false);
  const [results, setResults] = useState<Place[] | null>(null);
  const [finding, setFinding] = useState<'search' | 'here' | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!id);
  const [cover, setCover] = useState<PickedPhoto | null>(null);

  useEffect(() => {
    const e = existing.data;
    if (!e || loaded) return;
    setTitle(e.title); setActivity(e.activity); setStartsOn(e.startsOn); setSchedule({ repeat: e.repeat, repeatEvery: e.repeatEvery, weekdays: e.weekdays, monthMode: e.monthMode, monthWeek: e.monthWeek, endsOn: e.endsOn }); setTime(e.startTime);
    setHours(String(Math.floor(e.durationMinutes / 60))); setMinutes(String(e.durationMinutes % 60));
    setDistance(e.distanceMetres ? String(+(e.distanceMetres / (unit === 'mi' ? MILE : 1000)).toFixed(1)) : '');
    setNotes(e.notes ?? ''); setTimeZone(e.timeZone); setVenue(e.venue);
    setPlace({ name: e.venue, address: e.address ?? '', latitude: e.latitude, longitude: e.longitude });
    setLoaded(true);
  }, [existing.data, loaded, unit]);

  // Places load as you type: a short pause after the last key, and only the newest search counts.
  useEffect(() => {
    const query = search.trim();
    if (query.length < 3) { setResults(null); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setFinding('search'); setPlaceError(null);
      api<Place[]>(`/geo/search?q=${encodeURIComponent(query)}${place ? `&lat=${place.latitude}&lon=${place.longitude}` : ''}`, { signal: controller.signal })
        .then((found) => {
          setResults(found);
          if (!found.length) setPlaceError('Nothing found yet. Try the park, street or landmark name with the town.');
        })
        .catch(() => { if (!controller.signal.aborted) setPlaceError('Couldn’t search right now. Keep typing, or use where you are.'); })
        .finally(() => { if (!controller.signal.aborted) setFinding(null); });
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
    // The pin only biases results; moving it shouldn't search again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

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
    setChanging(false);
    setPlace(next);
    if (next.name) setVenue(next.name);
    setResults(null);
    setSearch('');
  }

  const durationMinutes = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  const km = Number(distance.replace(',', '.'));
  const distanceMetres = distance.trim() && Number.isFinite(km) && km > 0 ? Math.round(km * (unit === 'mi' ? MILE : 1000)) : null;
  const problem = title.trim().length < 2 ? 'Add a name'
    : !place ? 'Set the meeting point'
      : venue.trim().length < 2 ? 'Name the meeting point'
        : durationMinutes < MIN_DURATION || durationMinutes > MAX_DURATION ? 'Set how long it lasts'
          : distance.trim() && (!distanceMetres || distanceMetres < 500 || distanceMetres > 200_000) ? 'Fix the distance'
          : null;

  const save = useMutation({
    mutationFn: async () => {
      const input: EventInput = {
        title: title.trim(), activity, ...schedule, startsOn, startTime: time, timeZone, durationMinutes, distanceMetres,
        venue: venue.trim(), address: place?.address.trim() || null, latitude: place!.latitude, longitude: place!.longitude, notes: notes.trim() || null,
      };
      const saved = await (id ? patch<ClubEvent>(`/events/${id}`, input) : post<ClubEvent>(`/clubs/${club}/events`, input));
      if (!cover) return saved;
      // The event is saved either way; a photo that fails to upload can be added again from Edit.
      return uploadPhoto<ClubEvent>(`/events/${saved.id}/cover`, cover, { name: 'cover.jpg' }).catch(() => {
        toast({ tone: 'warn', message: 'Saved, but the cover photo didn’t upload. Try it again from Edit.' });
        return saved;
      });
    },
    async onSuccess(saved) {
      haptic('success');
      queryClient.setQueryData(eventKey(saved.id), saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['club', saved.club.slug, 'events'] }),
        queryClient.invalidateQueries({ queryKey: ['club-events'] }),
      ]);
      toast({ tone: 'ok', title: id ? 'Saved' : 'Your event is live', message: id ? 'Everyone going sees the update.' : 'Members and followers just heard about it. Share it to bring more people.' });
      if (id) router.back(); else router.replace(`/events/${saved.id}`);
    },
  });

  if (id && !loaded) return <Screen><Stack.Screen options={{ title: 'Edit event' }} />{existing.error ? <ErrorNotice error={existing.error} onRetry={() => void existing.refetch()} /> : <Loading />}</Screen>;

  const submit = () => {
    if (problem) { haptic('warning'); toast({ tone: 'warn', message: `${problem} first.` }); return; }
    save.mutate();
  };

  return <Screen footer={<Footer>
    {problem ? <Txt size={12.5} color="ink2" align="center" style={{ marginBottom: 8 }}>{`${problem} to post it.`}</Txt> : null}
    <Button full size="lg" variant="primary" title={id ? 'Save changes' : 'Post event'} loading={save.isPending} onPress={submit} />
  </Footer>}>
    <Stack.Screen options={{ title: id ? 'Edit event' : 'New event' }} />
    <View style={{ gap: 20 }}>
      <Pressable onPress={() => void pickPhoto({ maxSide: 1600 }).then((photo) => { if (photo) setCover(photo); })} accessibilityRole="button" accessibilityLabel="Add a cover photo" style={styles.coverPick}>
        {cover ? <Image source={{ uri: cover.uri }} style={{ width: '100%', aspectRatio: 16 / 9 }} contentFit="cover" />
          : existing.data ? <EventCover event={existing.data} />
            : <View style={[styles.coverEmpty]}><CameraIcon size={26} color={colors.ink2} /><Txt size={14} weight="bold">Add a cover photo</Txt><Txt size={12.5} color="ink3">A crowd shot from your last run works best.</Txt></View>}
        {(cover || existing.data) ? <View style={styles.coverChange}><CameraIcon size={14} color="#F2EFE8" /><Txt size={12.5} weight="bold" style={{ color: '#F2EFE8' }}>{cover || existing.data?.coverUrl ? 'Change photo' : 'Add a photo'}</Txt></View> : null}
      </Pressable>
      <TextField label="Name" placeholder="Saturday Social 5K" value={title} onChangeText={setTitle} maxLength={80} />

      <SelectField label="What kind of session is it?" value={activity} onChange={setActivity} options={ACTIVITY_OPTIONS} />
      <DateTimePicker label={schedule.repeat === 'once' ? 'When is it?' : 'When is the first one?'} value={`${startsOn}T${time}`} min={id ? undefined : `${todayIso()}T00:00`}
        onChange={(value) => {
          const day = value.slice(0, 10);
          setTime(value.slice(11, 16));
          if (day === startsOn) return;
          setStartsOn(day);
          // A new first date carries the schedule with it: its weekday, its week of the month.
          setSchedule((now) => scheduleFor(now.repeat, day, { ...now, weekdays: now.weekdays.length > 1 ? now.weekdays : [] }));
        }}
        hint={timeZone === deviceTimeZone() ? undefined : `In the meeting point’s time zone (${timeZone}).`} />
      <RepeatEditor value={schedule} startsOn={startsOn} startTime={time} onChange={setSchedule} />

      <View>
        <FieldLabel label="How long does it usually last?" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextField containerStyle={{ flex: 1 }} accessibilityLabel="Hours" keyboardType="number-pad" maxLength={2} value={hours} onChangeText={(value) => setHours(value.replace(/\D/g, ''))} right={<Txt size={14} color="ink2">h</Txt>} />
          <TextField containerStyle={{ flex: 1 }} accessibilityLabel="Minutes" keyboardType="number-pad" maxLength={2} value={minutes} onChangeText={(value) => setMinutes(value.replace(/\D/g, ''))} right={<Txt size={14} color="ink2">min</Txt>} />
        </View>
        <Hint>{durationMinutes >= MIN_DURATION && durationMinutes <= MAX_DURATION ? `About ${durationLabel(durationMinutes)}, including any warm-up or social time after.` : 'Anything from 15 minutes to 24 hours.'}</Hint>
      </View>

      <TextField label="Distance" optional placeholder="5" keyboardType="decimal-pad" value={distance} onChangeText={setDistance} right={<Txt size={14} color="ink2">{unit}</Txt>} />

      <View>
        <FieldLabel label="Meeting point" />
        {place ? <View style={styles.pinned}>
          <View style={styles.pin}><PinIcon size={18} color={colors.onAccent} /></View>
          <View style={{ flex: 1, gap: 8 }}>
            <TextField placeholder="e.g. Main gate, Muri Okunola Park" value={venue} onChangeText={setVenue} maxLength={120} />
            {place.address ? <Txt size={12.5} color="ink2">{place.address}</Txt> : null}
            {!changing && <Pressable onPress={() => { haptic(); setChanging(true); }} hitSlop={8} style={{ alignSelf: 'flex-start' }} accessibilityRole="button">
              <Txt size={13} weight="bold" style={{ textDecorationLine: 'underline' }}>Change</Txt>
            </Pressable>}
          </View>
        </View> : null}
        {(!place || changing) && <View style={{ marginTop: place ? 12 : 0, gap: 10 }}>
          <TextField autoFocus={changing} placeholder={place ? 'Search a different place' : 'Search a park, street or landmark'} value={search} onChangeText={(value) => { setSearch(value); setPlaceError(null); }}
            returnKeyType="search" autoCorrect={false} left={<SearchIcon size={16} color={colors.ink3} />}
            right={finding === 'search' ? <ActivityIndicator size="small" color={colors.ink3} /> : search ? <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search"><CloseIcon size={16} color={colors.ink3} /></Pressable> : undefined}
            error={placeError ?? undefined} />
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
          {changing ? <Pressable onPress={() => { setChanging(false); setSearch(''); }} hitSlop={8} style={{ alignSelf: 'center' }}><Txt size={13} weight="semibold" color="ink3">Keep {venue || 'this place'}</Txt></Pressable>
            : <Hint>Runners nearby find your event by this spot, and Directions takes them straight to it.</Hint>}
        </View>}
      </View>

      <TextField label="Notes" optional multiline placeholder="Pace groups, where to leave bags, what happens after…" value={notes} onChangeText={setNotes} maxLength={600} style={{ minHeight: 96 }} />
      <ErrorNotice error={save.error} />
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  coverPick: { borderRadius: radius['2xl'], overflow: 'hidden', borderWidth: 1.5, borderColor: colors.line },
  coverEmpty: { aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.inkWash },
  coverChange: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.full, backgroundColor: 'rgba(18,18,18,0.72)', paddingHorizontal: 12, paddingVertical: 6 },
  pinned: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: radius['2xl'], borderWidth: 2, borderColor: colors.edge, backgroundColor: colors.card },
  pin: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.volt, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  results: { borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, overflow: 'hidden' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
