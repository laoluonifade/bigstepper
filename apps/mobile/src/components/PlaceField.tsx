import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { CloseIcon, PinIcon, SearchIcon } from '@/components/icons';
import { Button, FieldLabel, haptic, Hint, TextField, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import type { Place } from '@/lib/club-events';
import { colors, radius } from '@/lib/theme';

/**
 * Where something happens: search a park, street or landmark as you type, or drop the pin where you're
 * standing. Once picked, the spot can be named ("Main gate") and changed. Used by events and competitions.
 */
export function PlaceField({ label, optional, place, venue, onPlace, onVenue, hint, venuePlaceholder = 'e.g. Main gate, Muri Okunola Park' }: {
  label: string;
  optional?: boolean;
  place: Place | null;
  venue: string;
  onPlace: (place: Place | null) => void;
  onVenue: (venue: string) => void;
  hint: string;
  venuePlaceholder?: string;
}) {
  const [search, setSearch] = useState('');
  // Once a place is picked, the search and "I'm there now" step aside until Change is tapped.
  const [changing, setChanging] = useState(false);
  const [results, setResults] = useState<Place[] | null>(null);
  const [finding, setFinding] = useState<'search' | 'here' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Places load as you type: a short pause after the last key, and only the newest search counts.
  useEffect(() => {
    const query = search.trim();
    if (query.length < 3) { setResults(null); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setFinding('search'); setError(null);
      api<Place[]>(`/geo/search?q=${encodeURIComponent(query)}${place ? `&lat=${place.latitude}&lon=${place.longitude}` : ''}`, { signal: controller.signal })
        .then((found) => {
          setResults(found);
          if (!found.length) setError('Nothing found yet. Try the park, street or landmark name with the town.');
        })
        .catch(() => { if (!controller.signal.aborted) setError('Couldn’t search right now. Keep typing, or use where you are.'); })
        .finally(() => { if (!controller.signal.aborted) setFinding(null); });
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
    // The pin only biases results; moving it shouldn't search again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function choose(next: Place) {
    haptic();
    setChanging(false);
    onPlace(next);
    if (next.name) onVenue(next.name);
    setResults(null);
    setSearch('');
  }

  async function pinHere() {
    setFinding('here'); setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { setError('Allow location to drop the pin where you’re standing.'); return; }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = position.coords;
      const named = await api<{ name: string | null }>(`/geo/place?lat=${latitude.toFixed(5)}&lon=${longitude.toFixed(5)}`).catch(() => ({ name: null }));
      choose({ name: venue || '', address: named.name ?? '', latitude, longitude });
    } catch {
      setError('Couldn’t get your location. Try again outside, or search instead.');
    } finally { setFinding(null); }
  }

  return <View>
    <FieldLabel label={label} optional={optional} />
    {place ? <View style={styles.pinned}>
      <View style={styles.pin}><PinIcon size={18} color={colors.onAccent} /></View>
      <View style={{ flex: 1, gap: 8 }}>
        <TextField placeholder={venuePlaceholder} value={venue} onChangeText={onVenue} maxLength={120} />
        {place.address ? <Txt size={12.5} color="ink2">{place.address}</Txt> : null}
        {!changing && <View style={{ flexDirection: 'row', gap: 18 }}>
          <Pressable onPress={() => { haptic(); setChanging(true); }} hitSlop={8} accessibilityRole="button">
            <Txt size={13} weight="bold" style={{ textDecorationLine: 'underline' }}>Change</Txt>
          </Pressable>
          {optional && <Pressable onPress={() => { haptic(); onPlace(null); onVenue(''); }} hitSlop={8} accessibilityRole="button">
            <Txt size={13} weight="semibold" color="ink3">Remove</Txt>
          </Pressable>}
        </View>}
      </View>
    </View> : null}
    {(!place || changing) && <View style={{ marginTop: place ? 12 : 0, gap: 10 }}>
      <TextField autoFocus={changing} placeholder={place ? 'Search a different place' : 'Search a park, street or landmark'} value={search} onChangeText={(value) => { setSearch(value); setError(null); }}
        returnKeyType="search" autoCorrect={false} left={<SearchIcon size={16} color={colors.ink3} />}
        right={finding === 'search' ? <ActivityIndicator size="small" color={colors.ink3} /> : search ? <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search"><CloseIcon size={16} color={colors.ink3} /></Pressable> : undefined}
        error={error ?? undefined} />
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
        : <Hint>{hint}</Hint>}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  pinned: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: radius['2xl'], borderWidth: 2, borderColor: colors.edge, backgroundColor: colors.card },
  pin: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.volt, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  results: { borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, overflow: 'hidden' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
