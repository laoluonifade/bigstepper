import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { EventCard } from '@/components/ClubEvents';
import { PinIcon, SearchIcon } from '@/components/icons';
import { Button, Chips, EmptyState, ErrorNotice, PageHeader, Screen, SectionTitle, Skeleton, TextField, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import type { ClubEvent, Place } from '@/lib/club-events';
import { usePlaceName } from '@/lib/place';
import { colors, radius } from '@/lib/theme';

type Spot = { latitude: number; longitude: number };
type Area = Spot & { name?: string };
const RADII = ['5', '10', '25', '50'] as const;

/** Club events near you (or anywhere you search), and the ones you've got passes for. */
export default function EventsScreen() {
  const [area, setArea] = useState<Area | null>(null);
  const [locating, setLocating] = useState(true);
  const [denied, setDenied] = useState(false);
  const [km, setKm] = useState<(typeof RADII)[number]>('25');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const placeName = usePlaceName(area && !area.name ? area : null);

  async function locate() {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { setDenied(true); return; }
      setDenied(false);
      const position = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 })
        ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (position) setArea({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch {
      setDenied(true);
    } finally {
      setLocating(false);
    }
  }
  useEffect(() => { void locate(); }, []);

  async function findArea() {
    const query = search.trim();
    if (query.length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      const [first] = await api<Place[]>(`/geo/search?q=${encodeURIComponent(query)}`);
      if (!first) setSearchError('Couldn’t find that place. Try a town or neighbourhood.');
      else { setArea({ latitude: first.latitude, longitude: first.longitude, name: first.name }); setSearch(''); }
    } catch {
      setSearchError('Couldn’t search right now. Try again.');
    } finally {
      setSearching(false);
    }
  }

  const events = useQuery({
    queryKey: ['club-events', area?.latitude.toFixed(3) ?? 'none', area?.longitude.toFixed(3) ?? 'none', km],
    queryFn: () => api<{ nearby: ClubEvent[]; going: ClubEvent[] }>(area ? `/events?lat=${area.latitude.toFixed(5)}&lon=${area.longitude.toFixed(5)}&km=${km}` : '/events'),
    enabled: !locating,
  });
  const going = events.data?.going ?? [];
  const goingIds = new Set(going.map((event) => event.id));
  const nearby = (events.data?.nearby ?? []).filter((event) => !goingIds.has(event.id));
  const where = area?.name ?? placeName;

  return <Screen refreshing={events.isRefetching} onRefresh={() => void events.refetch()}>
    <Stack.Screen options={{ title: 'Events' }} />
    <PageHeader eyebrow="Run together" title="Events near you" description="Runs, rides and race days that clubs host in person. Get a pass and Jump reminds you the day before and an hour before." />

    {going.length > 0 && <View style={{ marginBottom: 28 }}>
      <SectionTitle aside={`${going.length}`}>Your passes</SectionTitle>
      <View style={{ gap: 12 }}>{going.map((event) => <EventCard key={event.id} event={event} />)}</View>
    </View>}

    <SectionTitle aside={where ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 200 }}><PinIcon size={13} color={colors.ink2} /><Txt size={13} color="ink2" numberOfLines={1}>{where}</Txt></View> : undefined}>Near you</SectionTitle>
    <TextField placeholder="Search another town or area" value={search} onChangeText={(value) => { setSearch(value); setSearchError(null); }} returnKeyType="search" onSubmitEditing={() => void findArea()}
      left={<SearchIcon size={16} color={colors.ink3} />} error={searchError ?? undefined}
      right={search.trim().length >= 2 ? <Button size="sm" variant="dark" title="Go" loading={searching} onPress={() => void findArea()} /> : area?.name ? <Pressable onPress={() => void locate()} hitSlop={8}><Txt size={13} weight="semibold">Near me</Txt></Pressable> : undefined} />
    <View style={{ marginTop: 12, marginBottom: 16 }}>
      <Chips label="How far" value={km} onChange={setKm} options={RADII.map((value) => ({ value, label: `Within ${value} km` }))} />
    </View>

    <ErrorNotice error={events.error} onRetry={() => void events.refetch()} />
    {locating || events.isLoading ? <View style={{ gap: 12 }}><Skeleton style={{ height: 132, borderRadius: radius['2xl'] }} /><Skeleton style={{ height: 132, borderRadius: radius['2xl'] }} /></View>
      : !area ? <EmptyState title={denied ? 'Where are you running?' : 'Finding you…'} action={denied ? <Button size="sm" title="Use my location" onPress={() => void locate()} /> : undefined}>
        {denied ? 'Allow location to see events around you, or search a town above.' : 'Getting your location to show events nearby.'}
      </EmptyState>
        : !nearby.length ? <EmptyState title="No events here yet">
          {`Nothing within ${km} km yet. Try a wider area, or if you run a club, add an event from your club’s page so people nearby can find it.`}
        </EmptyState>
          : <View style={{ gap: 12 }}>{nearby.map((event) => <EventCard key={event.id} event={event} />)}</View>}
  </Screen>;
}
