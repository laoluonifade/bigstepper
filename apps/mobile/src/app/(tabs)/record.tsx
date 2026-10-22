import { formatDistance, formatDuration } from '@jump/shared/format';
import { measureTrack } from '@jump/shared/track';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/lib/theme';
import { FOREGROUND_ONLY, startTracking, stopTracking, subscribe, type TrackerState } from '@/lib/tracker';

type Kind = 'walk' | 'run' | 'cycle';
const KINDS: { value: Kind; label: string }[] = [
  { value: 'walk', label: 'Walk' },
  { value: 'run', label: 'Run' },
  { value: 'cycle', label: 'Ride' },
];

/** Proof of background GPS: measures with the same algorithm the API verifies with. Saving to the API comes next. */
export default function RecordScreen() {
  const [kind, setKind] = useState<Kind>('run');
  const [tracker, setTracker] = useState<TrackerState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => subscribe(setTracker), []);
  useEffect(() => {
    if (tracker?.status !== 'tracking') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [tracker?.status]);

  const tracking = tracker?.status === 'tracking';
  const measure = measureTrack(tracker?.points ?? [], { trailing: tracking, activityType: kind });
  const elapsed = tracker?.startedAt ? Math.round(((tracking ? now : tracker.points.at(-1)?.recordedAt.getTime() ?? now) - tracker.startedAt.getTime()) / 1000) : 0;

  async function toggle() {
    setProblem(null);
    if (tracking) {
      await stopTracking();
      return;
    }
    const result = await startTracking(kind);
    if (result === 'foreground-denied') setProblem('Jump needs your location to measure distance.');
    if (result === 'background-denied') setProblem('Choose “Allow all the time” / “Always” so tracking continues with the screen off.');
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.kinds}>
        {KINDS.map((option) => (
          <Pressable
            key={option.value}
            disabled={tracking}
            onPress={() => setKind(option.value)}
            style={[styles.kind, kind === option.value && styles.kindActive]}>
            <Text style={[styles.kindText, kind === option.value && { color: colors.paper }]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.stats}>
        <Text style={styles.distance}>{formatDistance(measure.distanceMetres)}</Text>
        <Text style={styles.meta}>{formatDuration(elapsed)} · {tracker?.points.length ?? 0} GPS fixes · {Math.round(measure.confidence * 100)}% usable</Text>
      </View>

      {FOREGROUND_ONLY && <Text style={styles.note}>Expo Go: distance only counts while Jump is open on screen.</Text>}

      {problem && (
        <Pressable onPress={() => void Linking.openSettings()}>
          <Text style={styles.problem}>{problem} Tap to open Settings.</Text>
        </Pressable>
      )}

      <Pressable style={[styles.button, tracking && { backgroundColor: colors.bad }]} onPress={() => void toggle()}>
        <Text style={styles.buttonText}>{tracking ? 'Finish' : 'Start'}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: 16 },
  kinds: { flexDirection: 'row', gap: 8, marginTop: 16 },
  kind: { flex: 1, borderWidth: 1, borderColor: colors.ink, borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  kindActive: { backgroundColor: colors.ink },
  kindText: { fontWeight: '700', color: colors.ink },
  stats: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  distance: { fontSize: 64, fontWeight: '900', color: colors.ink, fontVariant: ['tabular-nums'] },
  meta: { marginTop: 8, fontSize: 15, color: colors.ink2 },
  note: { color: colors.ink3, fontSize: 13, textAlign: 'center', marginBottom: 12 },
  problem: { backgroundColor: colors.badWash, color: colors.bad, padding: 12, borderRadius: 8, marginBottom: 12 },
  button: { backgroundColor: colors.track, borderRadius: 999, paddingVertical: 20, alignItems: 'center', marginBottom: 24 },
  buttonText: { color: colors.paper, fontSize: 20, fontWeight: '800' },
});
