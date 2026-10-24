import { formatDistance, formatDistanceNumber, formatDuration, formatPace } from '@jump/shared/format';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckIcon, ChevronDownIcon, CloseIcon, CycleIcon, OfflineIcon, PauseIcon, PlayIcon, RunIcon, SignalIcon, StopIcon, WalkIcon } from '@/components/icons';
import { RunMap, type LivePosition } from '@/components/RunMap';
import { Sheet } from '@/components/Sheet';
import { Button, ErrorNotice, haptic, HardShadow, Loading, Notice, PageHeader, Screen, Txt, useCountUp, useNow } from '@/components/ui';
import { api } from '@/lib/api';
import { usePlaceName } from '@/lib/place';
import { useUnit } from '@/lib/queries';
import { FOREGROUND_ONLY, movingSeconds, useRecorder, type ActivityKind } from '@/lib/recorder';
import { colors, display, GUTTER, radius, score } from '@/lib/theme';
import { toast } from '@/lib/toast';

export default function RunScreen() {
  const recorder = useRecorder();
  switch (recorder.phase) {
    case 'restoring':
      return <Screen><Loading label="Checking for an activity in progress" /></Screen>;
    case 'unavailable':
      return <Screen>
        <PageHeader eyebrow="Activity" title="Couldn’t reach your activity" />
        <ErrorNotice error={new Error(recorder.error ?? 'We couldn’t load your activity in progress.')} />
        <Txt size={14} color="ink2">Your GPS points are safe on this phone. They’ll upload once we can reach Jump again.</Txt>
        <Button title="Try again" style={{ marginTop: 24 }} onPress={recorder.retryRestore} />
      </Screen>;
    case 'recording':
    case 'paused':
    case 'finishing':
      return <Scoreboard />;
    default:
      return <ReadyScreen />;
  }
}

/**
 * Where you are before you start, without asking for location until the runner opts in: if permission
 * is already granted it watches straight away, otherwise `enable()` asks.
 */
function usePreviewPosition() {
  const [position, setPosition] = useState<LivePosition | null>(null);
  const [state, setState] = useState<'idle' | 'locating' | 'ready' | 'denied'>('idle');
  const watch = useRef<Location.LocationSubscription | null>(null);

  const start = useCallback(async () => {
    if (watch.current) return;
    setState('locating');
    watch.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 3000 }, (fix) => {
      setPosition({ latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracy: fix.coords.accuracy ?? null });
      setState('ready');
    });
  }, []);

  const enable = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setState('denied');
      return;
    }
    await start();
  }, [start]);

  useEffect(() => {
    void Location.getForegroundPermissionsAsync().then((permission) => { if (permission.status === 'granted') void start(); }).catch(() => undefined);
    return () => {
      watch.current?.remove();
      watch.current = null;
    };
  }, [start]);

  return { position, state, enable };
}

const ACTIVITY_CHOICES = [
  { value: 'run', label: 'Run', icon: RunIcon },
  { value: 'walk', label: 'Walk', icon: WalkIcon },
  { value: 'cycle', label: 'Ride', icon: CycleIcon },
] as const;

function signalStrength(accuracy: number | null) {
  if (accuracy === null) return 0;
  if (accuracy <= 10) return 4;
  if (accuracy <= 20) return 3;
  if (accuracy <= 50) return 2;
  return 1;
}

function ReadyScreen() {
  const recorder = useRecorder();
  const insets = useSafeAreaInsets();
  const locating = recorder.phase === 'locating';
  const [activityType, setActivityType] = useState<ActivityKind>('run');
  const [showStartInfo, setShowStartInfo] = useState(false);
  const [showHowItCounts, setShowHowItCounts] = useState(false);
  const [backgroundDenied, setBackgroundDenied] = useState(false);
  const preview = usePreviewPosition();
  const eligible = useQuery({
    queryKey: ['tables', 'eligible', activityType],
    queryFn: () => api<Array<{ id: string; code: string; title: string; challengeType: string; type: string }>>(`/tables/eligible?activity=${activityType}`),
    enabled: showStartInfo,
  });
  const gpsError = recorder.gpsError;
  useEffect(() => { if (gpsError) toast({ tone: 'warn', title: 'No location yet', message: gpsError }); }, [gpsError]);
  const placeName = usePlaceName(preview.position);

  if (recorder.phase === 'blocked') {
    return <Screen>
      <PageHeader eyebrow="Activity" title="An activity is already going" />
      <Notice tone="warn" title="You have an activity in progress somewhere else">
        It was probably started on another device. Finish it on the device that started it, then come back. Recovering an interrupted activity from here isn’t supported yet.
      </Notice>
      <Button variant="secondary" title="See your activities" style={{ marginTop: 24 }} onPress={() => router.push('/activities')} />
    </Screen>;
  }

  const accuracy = preview.position?.accuracy ?? null;
  const strength = signalStrength(accuracy);
  const gpsLabel = preview.state === 'ready' ? (strength >= 3 ? 'GPS ready' : strength === 2 ? 'GPS fair' : 'GPS weak')
    : preview.state === 'locating' ? 'Finding you…' : preview.state === 'denied' ? 'Location blocked' : 'Show my location';
  const noun = activityType === 'cycle' ? 'ride' : activityType;

  async function start() {
    setShowStartInfo(false);
    haptic('success');
    const problem = await recorder.start(activityType);
    if (problem === 'background-denied') setBackgroundDenied(true);
  }

  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <RunMap route={[]} position={preview.position} zoom={14} style={{ height: '50%' }} />
    <Pressable onPress={() => (preview.state === 'denied' ? void Linking.openSettings() : void preview.enable())} disabled={preview.state === 'ready' || preview.state === 'locating'}
      style={[styles.pill, { position: 'absolute', left: GUTTER, top: insets.top + 12 }]} accessibilityRole="button" accessibilityLabel={gpsLabel}>
      <View style={[styles.signalDot, { backgroundColor: preview.state === 'ready' ? (strength >= 3 ? colors.ok : colors.warn) : preview.state === 'locating' ? '#0A84FF' : colors.ink3 }]} />
      <Txt size={13} weight="semibold" numberOfLines={1} style={{ maxWidth: 220 }}>{preview.state === 'ready' && placeName ? placeName : gpsLabel}</Txt>
      {accuracy !== null && preview.state === 'ready' ? <Txt size={13} color="ink3" num>±{Math.round(accuracy)} m</Txt> : null}
    </Pressable>

    <View style={styles.readySheet}>
      <View style={styles.handle} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <Text style={display(30)} accessibilityRole="header">Ready?</Text>
        <Pressable onPress={() => setShowHowItCounts(true)} hitSlop={8}><Txt size={15} weight="semibold" style={{ color: '#0A84FF' }}>How it counts</Txt></Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }} accessibilityRole="radiogroup" accessibilityLabel="Activity type">
        {ACTIVITY_CHOICES.map(({ value, label, icon: Icon }) => {
          const active = activityType === value;
          return <Pressable key={value} style={{ flex: 1 }} onPress={() => { haptic(); setActivityType(value); }} accessibilityRole="radio" accessibilityState={{ checked: active }}>
            {({ pressed }) => <HardShadow radius={20} pressed={active || pressed}>
              <View style={[styles.choice, active && { backgroundColor: colors.ink }]}>
                <View style={[styles.choiceIcon, active && { borderColor: colors.track, backgroundColor: colors.track }]}><Icon size={22} /></View>
                <Txt size={15} weight="semibold" color={active ? 'paper' : 'ink'}>{label}</Txt>
              </View>
            </HardShadow>}
          </Pressable>;
        })}
      </View>
      <Pressable onPress={() => { haptic(); setShowStartInfo(true); }} disabled={locating} accessibilityRole="button" accessibilityLabel={`Start ${noun}`} style={{ marginTop: 20 }}>
        {({ pressed }) => <HardShadow radius={radius.full} pressed={pressed || locating}>
          <View style={styles.start}>
            {locating ? <Txt size={16} weight="bold">Finding GPS signal…</Txt> : <><PlayIcon size={18} /><Txt size={16} weight="bold">Start {noun}</Txt></>}
          </View>
        </HardShadow>}
      </Pressable>
      <Txt size={12} color="ink3" align="center" style={{ marginTop: 10 }}>{FOREGROUND_ONLY ? 'In Expo Go, distance only counts while Jump is open on screen.' : 'Location is only recorded during an activity, even with your screen locked.'}</Txt>
      {backgroundDenied && <Notice tone="warn" title="Keep Jump open while you move" style={{ marginTop: 16 }} action={<Button size="sm" variant="secondary" title="Open Settings" onPress={() => void Linking.openSettings()} />}>
        Without “Always” location access, Jump only measures while it’s on screen. Allow it in Settings to keep counting with the screen locked.
      </Notice>}
      <ErrorNotice error={recorder.error ? new Error(recorder.error) : null} />
    </View>

    <Sheet open={showHowItCounts} onOpenChange={setShowHowItCounts} title="How it counts">
      <View style={{ gap: 16 }}>
        {[
          ['Lock your phone if you like', 'Jump keeps measuring in the background until you finish. You’ll see it in the status bar while it records.'],
          ['Head outdoors', 'Open sky gives the cleanest signal. Points less accurate than 50 m don’t count.'],
          ['Verified after you finish', activityType === 'cycle' ? 'Jump checks your GPS route. Cycling distance counts only in cycling competitions.' : 'Jump checks your route and steps. Competitions use the verified values.'],
        ].map(([title, body]) => <View key={title} style={{ flexDirection: 'row', gap: 12 }}>
          <View style={styles.check}><CheckIcon size={14} color={colors.volt} /></View>
          <View style={{ flex: 1 }}><Txt size={15} weight="semibold">{title}</Txt><Txt size={14} color="ink2" leading={1.5} style={{ marginTop: 2 }}>{body}</Txt></View>
        </View>)}
      </View>
    </Sheet>

    <Sheet open={showStartInfo} onOpenChange={setShowStartInfo} title={`Before your ${noun}`} footer={<View style={{ flexDirection: 'row', gap: 12 }}>
      <Button variant="secondary" full style={{ flex: 1 }} title="Not yet" onPress={() => setShowStartInfo(false)} />
      <Button full style={{ flex: 1 }} title="Start" disabled={locating} onPress={() => void start()} />
    </View>}>
      <Txt size={14} color="ink2" leading={1.55}>
        {activityType === 'cycle' ? 'After GPS verification, this ride counts in cycling competitions you’ve joined. Cycling doesn’t add to run, walk, step or league standings.'
          : `After verification, this ${activityType} counts in ${activityType} competitions you’ve joined, plus distance, step and timed ones, and your league.`}
      </Txt>
      <View style={styles.counting}>
        <Txt size={13} weight="semibold">Counting toward</Txt>
        {eligible.isLoading ? <Txt size={13} color="ink3" style={{ marginTop: 4 }}>Checking…</Txt>
          : eligible.data?.length ? <View style={{ marginTop: 6, gap: 4 }}>{eligible.data.map((table) => <View key={table.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.track }} /><Txt size={14} numberOfLines={1}>{table.title}</Txt>
          </View>)}</View>
            : <Txt size={13} color="ink3" style={{ marginTop: 4 }}>{`No competitions yet.${activityType === 'cycle' ? '' : ' It still counts for your league.'}`}</Txt>}
        <ErrorNotice error={eligible.error} onRetry={() => void eligible.refetch()} />
      </View>
    </Sheet>
  </View>;
}

function Scoreboard() {
  const recorder = useRecorder();
  const insets = useSafeAreaInsets();
  const unit = useUnit();
  const now = useNow(1000);
  const [confirming, setConfirming] = useState<'finish' | 'discard' | null>(null);
  const [sheetHeight, setSheetHeight] = useState(360);
  const recording = recorder.phase === 'recording';
  const finishing = recorder.phase === 'finishing';
  const seconds = movingSeconds(recorder.session, now);
  const pace = formatPace(recorder.distanceMetres, seconds, unit);
  const speed = seconds > 0 && recorder.distanceMetres > 0 ? (recorder.distanceMetres / (unit === 'km' ? 1000 : 1609.344) / (seconds / 3600)).toFixed(1) : null;
  const strength = signalStrength(recorder.accuracy);
  const stale = recorder.lastFixAt !== null && now - recorder.lastFixAt > 20_000;
  const activityName = recorder.session?.activityType ?? 'run';
  const noun = activityName === 'cycle' ? 'ride' : activityName;
  const shownMetres = useCountUp(recorder.distanceMetres, 900);
  const split = useSplitBanner(recorder.distanceMetres, unit, seconds);
  const placeName = usePlaceName(recorder.position);

  async function finish() {
    const activity = await recorder.finish();
    if (activity) {
      haptic('success');
      router.push({ pathname: '/activities/[id]', params: { id: activity.id, fresh: '1' } });
    }
    setConfirming(null);
  }

  async function discard() {
    await recorder.discard();
    setConfirming(null);
  }

  // Recording with a good fix but nothing counted yet: say why, so 0.00 doesn't look broken.
  const startedAt = recorder.session ? new Date(recorder.session.startedAt).getTime() : now;
  const showStillHint = recording && recorder.distanceMetres < 1 && !recorder.steps && now - startedAt > 20_000 && strength >= 2 && !stale;
  const warning = recorder.error ?? recorder.gpsError ?? (stale ? 'GPS signal lost. Stay outdoors with a clear view of the sky.' : null);

  return <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1, backgroundColor: colors.paper }}>
    <RunMap route={recorder.route} position={recorder.position} style={StyleSheet.absoluteFill} bottomInset={sheetHeight} topInset={insets.top + 52} />

    {/* Floating status over the map. */}
    <View style={[styles.status, { top: insets.top + 10 }]}>
      <View style={styles.pill}>
        {finishing ? <Txt size={13} weight="semibold">Saving…</Txt> : <>
          <View style={[styles.signalDot, { width: 10, height: 10, borderRadius: 5, backgroundColor: recording ? colors.track : colors.warn }]} />
          <Txt size={13} weight="semibold">{recording ? 'Recording' : 'Paused'}</Txt>
        </>}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={styles.pill} accessibilityLabel="GPS accuracy">
          <View style={{ opacity: stale ? 0.4 : 1 }}><SignalIcon size={15} color={strength >= 3 ? colors.ok : strength === 2 ? colors.warn : colors.bad} /></View>
          <Txt size={13} weight="semibold" num>{recorder.accuracy !== null ? `±${Math.round(recorder.accuracy)} m` : 'GPS'}</Txt>
          {recorder.connection === 'offline' ? <OfflineIcon size={15} color={colors.track} /> : recorder.pendingCount > 0 ? <Txt size={13} color="ink3" num>{recorder.pendingCount}↑</Txt> : null}
        </View>
        <Pressable onPress={() => router.navigate('/dashboard')} style={[styles.pill, { width: 36, paddingHorizontal: 0, justifyContent: 'center' }]} accessibilityRole="button" accessibilityLabel="Minimise, keep recording">
          <ChevronDownIcon size={18} />
        </Pressable>
      </View>
    </View>

    {split && <View style={[styles.splitWrap, { top: insets.top + 60 }]} pointerEvents="none">
      <Animated.View key={split.count} entering={ZoomIn.springify()} style={styles.split} accessibilityLiveRegion="polite">
        <Txt size={15} weight="semibold" color="paper" num>{`${split.count} ${unit} · ${formatDuration(split.seconds)}`}</Txt>
      </Animated.View>
    </View>}

    {/* Metrics and controls in a sheet, Fitness-style. */}
    <View style={[styles.liveSheet, { paddingBottom: Math.max(insets.bottom, 12) }]} onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}>
      <View style={styles.handle} />
      <Txt size={14} weight="semibold" color="ink3" numberOfLines={1}>{`${noun.charAt(0).toUpperCase() + noun.slice(1)}${placeName ? ` in ${placeName}` : ''} · Distance${recorder.distanceFromSteps ? ' from steps' : ''}`}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={[score(96), { lineHeight: 92, color: recording ? colors.ink : colors.ink3 }]} numberOfLines={1} adjustsFontSizeToFit>{formatDistanceNumber(shownMetres, unit)}</Text>
        <Txt size={20} weight="semibold" color="ink3">{unit}</Txt>
      </View>
      <View style={styles.metrics}>
        <Metric label="Time" value={formatDuration(seconds)} />
        <Metric label={activityName === 'cycle' ? `Speed ${unit}/h` : `Pace /${unit}`} value={activityName === 'cycle' ? speed ?? '–' : pace ?? '–:––'} divider />
        {recorder.steps !== null && <Metric label="Steps" value={Math.round(recorder.steps).toLocaleString('en-GB')} divider />}
      </View>
      {(warning || showStillHint) && <Txt size={13} leading={1.35} style={{ marginTop: 12, color: colors.trackDeep }}>
        {warning ?? (activityName === 'cycle' ? 'No distance yet. Cycling needs a good outdoor GPS signal.' : 'No distance yet. Outdoors it counts once you’ve moved a few metres; indoors, steps count if you allowed motion.')}
      </Txt>}

      {confirming
        ? <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: 20 }}>
          <Txt size={19} weight="bold">{confirming === 'finish' ? `Finish this ${noun}?` : `Discard this ${noun}?`}</Txt>
          <Txt size={14} color="ink2" style={{ marginTop: 4 }}>{confirming === 'finish' ? `${formatDistance(recorder.distanceMetres, unit)} will be submitted for verification.` : 'Nothing is saved or counted. This can’t be undone.'}</Txt>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16, paddingBottom: 8 }}>
            <Button variant="secondary" size="lg" full style={{ flex: 1 }} title={confirming === 'finish' ? 'Keep going' : 'Keep it'} disabled={finishing} onPress={() => setConfirming(null)} />
            <Button variant={confirming === 'finish' ? 'dark' : 'danger'} size="lg" full style={{ flex: 1 }} loading={finishing} title={finishing ? 'Saving…' : confirming === 'finish' ? 'Finish' : 'Discard'} onPress={() => void (confirming === 'finish' ? finish() : discard())} />
          </View>
        </Animated.View>
        : <View style={styles.controls}>
          <RoundControl label="Discard" size={56} disabled={finishing} onPress={() => setConfirming('discard')} background={colors.card} icon={<CloseIcon size={22} />} />
          {recording
            ? <RoundControl label="Pause" size={80} onPress={() => void recorder.pause()} background={colors.track} icon={<PauseIcon size={30} />} />
            : <RoundControl label="Resume" size={80} disabled={finishing} onPress={() => void recorder.resume()} background={colors.track} icon={<PlayIcon size={30} />} />}
          <RoundControl label="Finish" size={56} disabled={finishing} onPress={() => setConfirming('finish')} background={colors.ink} icon={<StopIcon size={20} color={colors.paper} />} />
        </View>}
    </View>
  </Animated.View>;
}

function Metric({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return <View style={[{ flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 12 }, divider && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.line }]}>
    <Txt size={12} weight="semibold" color="ink3" numberOfLines={1}>{label}</Txt>
    <Text style={[score(30), { marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
  </View>;
}

function RoundControl({ label, icon, onPress, disabled, size, background }: { label: string; icon: ReactNode; onPress: () => void; disabled?: boolean; size: number; background: string }) {
  return <View style={{ alignItems: 'center', gap: 6, marginTop: size < 80 ? 12 : 0 }}>
    <Pressable onPress={() => { haptic(); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={{ opacity: disabled ? 0.5 : 1 }}>
      {({ pressed }) => <HardShadow radius={size} pressed={pressed}>
        <View style={[styles.round, { width: size, height: size, borderRadius: size / 2, backgroundColor: background }]}>{icon}</View>
      </HardShadow>}
    </Pressable>
    <Txt size={13} weight="semibold" color="ink2">{label}</Txt>
  </View>;
}

/**
 * Each time the runner passes another whole km/mile, briefly shows "3 km · 18:42".
 * Starts from the distance already covered, so restoring an activity mid-way doesn't replay old splits.
 */
function useSplitBanner(metres: number, unit: 'km' | 'mi', seconds: number) {
  const unitMetres = unit === 'km' ? 1000 : 1609.344;
  const count = Math.floor(metres / unitMetres);
  const last = useRef(count);
  const [banner, setBanner] = useState<{ count: number; seconds: number } | null>(null);
  useEffect(() => {
    if (count > last.current) {
      last.current = count;
      haptic('success');
      setBanner({ count, seconds });
      const timer = setTimeout(() => setBanner(null), 4000);
      return () => clearTimeout(timer);
    }
    last.current = Math.max(last.current, count);
    // Only `count` triggers this; `seconds` is just read at the moment a split happens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);
  return banner;
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: 'rgba(251,250,246,0.92)', paddingHorizontal: 14 },
  signalDot: { width: 8, height: 8, borderRadius: 4 },
  readySheet: { flex: 1, marginTop: -24, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 2, borderColor: colors.ink, backgroundColor: colors.card, paddingHorizontal: 20, paddingTop: 12 },
  handle: { alignSelf: 'center', width: 40, height: 6, borderRadius: 3, backgroundColor: 'rgba(18,18,18,0.2)', marginBottom: 14 },
  choice: { alignItems: 'center', gap: 8, borderRadius: 20, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.card, paddingVertical: 16 },
  choiceIcon: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  start: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 60, borderRadius: radius.full, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.track },
  check: { width: 24, height: 24, borderRadius: 4, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  counting: { marginTop: 16, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.paper, padding: 16 },
  status: { position: 'absolute', left: GUTTER, right: GUTTER, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  splitWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  split: { borderRadius: radius.full, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.ink, paddingHorizontal: 16, paddingVertical: 8 },
  liveSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderTopWidth: 2, borderColor: colors.ink, backgroundColor: 'rgba(251,250,246,0.97)', paddingHorizontal: 24, paddingTop: 12 },
  metrics: { flexDirection: 'row', marginTop: 12, borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.ink, backgroundColor: 'rgba(242,239,232,0.6)' },
  controls: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 40, marginTop: 20, paddingBottom: 8 },
  round: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.ink },
});
