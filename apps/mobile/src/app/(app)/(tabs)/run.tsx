import { formatDistance, formatDistanceNumber, formatDuration, formatPace } from '@jump/shared/format';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextStyle, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, Extrapolation, FadeInUp, FadeOutUp, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StartCountdown } from '@/components/Countdown';
import { DragSheet } from '@/components/DragSheet';
import { Glass, LIQUID_GLASS } from '@/components/Glass';
import { CheckIcon, ChevronDownIcon, CloseIcon, CycleIcon, PauseIcon, PlayIcon, RunIcon, StopIcon, WalkIcon } from '@/components/icons';
import { RunMap, type LivePosition } from '@/components/RunMap';
import { Sheet } from '@/components/Sheet';
import { onStartPressed } from '@/components/TabBar';
import { BottomBarInset, Button, ErrorNotice, haptic, Loading, Notice, PageHeader, Screen, Txt, useCountUp, useNow } from '@/components/ui';
import { api } from '@/lib/api';
import { confirm } from '@/lib/dialog';
import { playSound } from '@/lib/sounds';
import { usePlaceName } from '@/lib/place';
import { useUnit } from '@/lib/queries';
import { movingSeconds, useRecorder, type ActivityKind } from '@/lib/recorder';
import { brand, colors, fontFamily, GUTTER, score } from '@/lib/theme';
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
    case 'saved':
      // Finished with no signal: it's on the phone and submits itself once Jump can be reached.
      return <Screen>
        <PageHeader eyebrow="No signal" title="Saved on your phone" description="Your activity is finished and every GPS point is safe here. It submits itself as soon as you’re back in signal; you don’t need to keep Jump open." />
        <Notice tone="neutral" title="Waiting for signal">
          Your time and distance are kept exactly as you recorded them, pauses included.
        </Notice>
        <Button title="Try now" variant="secondary" style={{ marginTop: 24 }} onPress={recorder.syncNow} />
      </Screen>;
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

/** Each activity has its own colour when picked: run orange, walk lemon, ride ink with a volt icon. */
const ACTIVITY_CHOICES = [
  { value: 'run', label: 'Run', icon: RunIcon, fill: colors.track, iconOn: colors.onAccent },
  { value: 'walk', label: 'Walk', icon: WalkIcon, fill: colors.volt, iconOn: colors.onAccent },
  { value: 'cycle', label: 'Ride', icon: CycleIcon, fill: brand.ink, iconOn: colors.volt },
] as const;


const SNAP = { duration: 300, easing: Easing.out(Easing.cubic) };

const nounFor = (kind: ActivityKind) => (kind === 'cycle' ? 'ride' : kind);
const capitalised = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

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
  const [starting, setStarting] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [backgroundDenied, setBackgroundDenied] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(240);
  const preview = usePreviewPosition();
  // Clear of the floating tab bar on iOS.
  const barInset = useContext(BottomBarInset);
  const eligible = useQuery({
    queryKey: ['tables', 'eligible', activityType],
    queryFn: () => api<Array<{ id: string; code: string; title: string; challengeType: string; type: string }>>(`/tables/eligible?activity=${activityType}`),
  });
  const gpsError = recorder.gpsError;
  useEffect(() => { if (gpsError) toast({ tone: 'warn', title: 'No location yet', message: gpsError, action: gpsError.includes('Settings') ? { label: 'Open Settings', run: () => void Linking.openSettings() } : undefined }); }, [gpsError]);
  const placeName = usePlaceName(preview.position);
  const noun = nounFor(activityType);

  function begin() {
    setStarting(false);
    void recorder.start(activityType).then((problem) => { if (problem === 'background-denied') setBackgroundDenied(true); });
  }
  // The tab bar's centre button is Start here: it opens the full-screen countdown.
  useEffect(() => onStartPressed(() => setStarting(true)), []);

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
    : preview.state === 'locating' ? 'Finding you…' : preview.state === 'denied' ? 'Location off' : 'Show my location';
  const gpsColour = preview.state === 'ready' ? (strength >= 3 ? colors.ok : colors.warn) : preview.state === 'locating' ? '#0A84FF' : colors.ink3;
  const gpsTappable = preview.state === 'idle' || preview.state === 'denied';

  // Room at the bottom so the circles clear the tab bar's raised Start button.
  const picker = <View style={{ paddingTop: 6, paddingBottom: 40 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }} accessibilityLabel="Start an activity">
      {ACTIVITY_CHOICES.map(({ value, label, icon: Icon, fill, iconOn }) => {
        const active = activityType === value;
        // Glass circles: the picked one is tinted in its colour; on iOS 26 they also react to your touch.
        // Tapping one starts it: it becomes the activity and the countdown opens, like the tab bar's Start.
        return <Pressable key={value} style={{ alignItems: 'center', gap: 12 }} onPress={() => { haptic('medium'); setActivityType(value); setStarting(true); }}
          accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`Start a ${nounFor(value)}`}>
          {({ pressed }) => <>
            <Glass interactive tint={active ? fill : undefined} solid={active ? fill : colors.inkWash} style={[styles.choice, pressed && !LIQUID_GLASS && { transform: [{ scale: 0.95 }] }]}>
              <Icon size={44} color={active ? iconOn : colors.ink} />
            </Glass>
            <Text style={plain(16, active ? colors.ink : colors.ink2)}>{label}</Text>
          </>}
        </Pressable>;
      })}
    </View>
    {(locating || preview.state === 'denied') && <Txt size={13} color="ink3" align="center" style={{ marginTop: 14 }}>
      {locating ? 'Finding a GPS signal…' : 'Turn on location to record distance.'}
    </Txt>}
    <Pressable onPress={() => { haptic(); setShowHowItWorks(true); }} hitSlop={10} style={{ alignSelf: 'center', marginTop: 16 }} accessibilityRole="link">
      <Txt size={13} weight="semibold" color="ink2" style={{ textDecorationLine: 'underline' }}>How it works</Txt>
    </Pressable>
  </View>;

  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <RunMap route={[]} position={preview.position} zoom={15} style={StyleSheet.absoluteFill} bottomInset={sheetHeight} topInset={insets.top + 52} />

    <View style={[styles.topRow, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Pressable disabled={!gpsTappable} onPress={() => { haptic(); void (preview.state === 'denied' ? Linking.openSettings() : preview.enable()); }} accessibilityRole={gpsTappable ? 'button' : undefined} accessibilityLabel={gpsLabel}>
        <Glass interactive={gpsTappable} style={styles.chip}>
          <View style={[styles.signalDot, { backgroundColor: gpsColour }]} />
          <Txt size={14} weight="semibold" numberOfLines={1} style={{ maxWidth: 200 }}>{preview.state === 'ready' && placeName ? placeName : gpsLabel}</Txt>
          {accuracy !== null && preview.state === 'ready' ? <Txt size={13} color="ink2" num>±{Math.round(accuracy)} m</Txt> : null}
        </Glass>
      </Pressable>
    </View>

    <DragSheet initiallyOpen={false} onVisibleHeight={setSheetHeight} header={picker} style={[styles.floating, { bottom: 10 + barInset }]}>
      {/* What it counts toward shows in the countdown; the sheet only carries a problem worth knowing about. */}
      {(backgroundDenied || recorder.error) && <View style={{ gap: 12, paddingBottom: 20 }}>
        {backgroundDenied && <Notice tone="warn" title="Keep Jump open while you move" action={<Button size="sm" variant="secondary" title="Open Settings" onPress={() => void Linking.openSettings()} />}>
          Without “Always” location access, Jump only measures while it’s on screen. Allow it in Settings to keep counting with the screen locked.
        </Notice>}
        <ErrorNotice error={recorder.error ? new Error(recorder.error) : null} />
      </View>}
    </DragSheet>

    <StartCountdown open={starting} title={`${capitalised(noun)} starting`} onDone={begin} onCancel={() => setStarting(false)}
      countingToward={eligible.data ? eligible.data.map((table) => table.title) : null} />

    <Sheet open={showHowItWorks} onOpenChange={setShowHowItWorks} title="How it works">
      <View style={{ gap: 16 }}>
        {[
          ['Lock your phone if you like', 'Jump keeps measuring in the background until you finish.'],
          ['Head outdoors', 'Open sky gives the cleanest signal. Points less accurate than 50 m don’t count.'],
          ['Verified after you finish', activityType === 'cycle' ? 'Jump checks your GPS route. Rides count in cycling competitions only.' : 'Jump checks your route and steps. Competitions use the verified values.'],
        ].map(([title, body]) => <View key={title} style={{ flexDirection: 'row', gap: 12 }}>
          <View style={styles.check}><CheckIcon size={12} color={colors.volt} /></View>
          <View style={{ flex: 1 }}><Txt size={15} weight="semibold">{title}</Txt><Txt size={14} color="ink2" leading={1.45} style={{ marginTop: 2 }}>{body}</Txt></View>
        </View>)}
      </View>
    </Sheet>
  </View>;
}

/**
 * The live workout, Apple Workout-style: full screen and dark, the distance huge and bright, every
 * number readable at arm's length mid-stride. Drag it down and it shrinks to a bar at the bottom with
 * the route on the map behind it; drag it up (or tap the bar) to bring it back.
 */
function Scoreboard() {
  const recorder = useRecorder();
  const insets = useSafeAreaInsets();
  // The panel fills what the screen actually measures: on Android the app draws behind the navigation
  // bar, so the window height alone leaves a strip of map showing at the bottom.
  const windowHeight = useWindowDimensions().height;
  const [height, setHeight] = useState(windowHeight);
  const unit = useUnit();
  const now = useNow(1000);
  const recording = recorder.phase === 'recording';
  const finishing = recorder.phase === 'finishing';
  const seconds = movingSeconds(recorder.session, now);
  const pace = formatPace(recorder.distanceMetres, seconds, unit);
  const unitMetres = unit === 'km' ? 1000 : 1609.344;
  const speed = seconds > 0 && recorder.distanceMetres > 0 ? (recorder.distanceMetres / unitMetres / (seconds / 3600)).toFixed(1) : null;
  const strength = signalStrength(recorder.accuracy);
  const stale = recorder.lastFixAt !== null && now - recorder.lastFixAt > 20_000;
  const activityType = recorder.session?.activityType ?? 'run';
  const noun = nounFor(activityType);
  const shownMetres = useCountUp(recorder.distanceMetres, 900);
  const split = useSplitBanner(recorder.distanceMetres, unit, seconds);

  // The workout covers the screen; dragged down, only `peek` of it stays, over the map.
  const peek = 92 + Math.max(insets.bottom, 12);
  const travel = height - peek;
  const offset = useSharedValue(0);
  const start = useSharedValue(0);
  const [collapsed, setCollapsed] = useState(false);
  function settle(next: boolean) {
    if (next !== collapsed) haptic('select');
    setCollapsed(next);
  }
  function snap(next: boolean) {
    offset.value = withTiming(next ? travel : 0, SNAP);
    settle(next);
  }
  const drag = Gesture.Pan()
    .activeOffsetY([-12, 12])
    .onBegin(() => { start.value = offset.value; })
    .onUpdate((event) => { offset.value = Math.max(0, Math.min(travel, start.value + event.translationY)); })
    .onEnd((event) => {
      const next = event.velocityY > 600 ? true : event.velocityY < -600 ? false : offset.value > travel / 2;
      offset.value = withTiming(next ? travel : 0, SNAP);
      runOnJS(settle)(next);
    });
  const panel = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
    borderTopLeftRadius: interpolate(offset.value, [0, travel], [0, 28], Extrapolation.CLAMP),
    borderTopRightRadius: interpolate(offset.value, [0, travel], [0, 28], Extrapolation.CLAMP),
  }));
  const full = useAnimatedStyle(() => ({ opacity: interpolate(offset.value, [0, travel * 0.35], [1, 0], Extrapolation.CLAMP) }));
  const compact = useAnimatedStyle(() => ({ opacity: interpolate(offset.value, [travel * 0.65, travel], [0, 1], Extrapolation.CLAMP) }));

  // Whatever you end at is saved, even 0.00: no "nothing to save", no waiting on a check.
  async function confirmFinish() {
    if (await confirm({ title: `Finish this ${noun}?`, message: `${formatDistance(recorder.distanceMetres, unit)} goes straight to your activities.`, cancelLabel: 'Keep going', confirmLabel: 'Finish' })) void finish();
  }

  async function finish() {
    const activity = await recorder.finish();
    if (activity) {
      haptic('success');
      playSound('finish');
      router.push({ pathname: '/activities/[id]', params: { id: activity.id, fresh: '1' } });
    }
  }

  async function confirmDiscard() {
    if (await confirm({ title: `Discard this ${noun}?`, message: 'Nothing is saved or counted. This can’t be undone.', cancelLabel: 'Keep it', confirmLabel: 'Discard', destructive: true })) void recorder.discard();
  }

  function togglePause() {
    haptic('medium');
    void (recording ? recorder.pause() : recorder.resume());
  }

  // Recording with a good fix but nothing counted yet: say why, so 0.00 doesn't look broken.
  const startedAt = recorder.session ? new Date(recorder.session.startedAt).getTime() : now;
  const showStillHint = recording && recorder.distanceMetres < 1 && now - startedAt > 20_000 && strength >= 2 && !stale;
  const warning = recorder.error ?? recorder.gpsError ?? (stale ? 'GPS signal lost. Stay outdoors with a clear view of the sky.' : showStillHint ? 'No distance yet. It counts once GPS sees you move a few metres outdoors.' : null);
  const bright = recording ? brand.volt : 'rgba(242,239,232,0.4)';

  // Always dark, in either theme: the brand palette, not the theme's.
  return <View style={{ flex: 1, backgroundColor: brand.ink }} onLayout={(event) => setHeight(Math.max(event.nativeEvent.layout.height, windowHeight))}>
    <StatusBar style={collapsed ? 'dark' : 'light'} />
    <RunMap route={recorder.route} position={recorder.position} style={StyleSheet.absoluteFill} bottomInset={peek} topInset={insets.top} />

    <GestureDetector gesture={drag}>
      <Animated.View style={[styles.panel, { height }, panel]}>
        {/* Dragged down: a bar with the essentials, over the map. Tap it to come back. */}
        <Animated.View style={[styles.compact, compact]} pointerEvents={collapsed ? 'auto' : 'none'}>
          <Pressable onPress={() => snap(false)} style={styles.compactRow} accessibilityRole="button" accessibilityLabel="Show the workout">
            <View style={styles.grabber} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={[score(44), { lineHeight: 48, color: bright }]}>{formatDistanceNumber(shownMetres, unit)}</Text>
                <Text style={plain(15, 'rgba(242,239,232,0.6)')}>{unit}</Text>
              </View>
              <Text style={[score(30), { lineHeight: 34, color: brand.paper }]}>{formatDuration(seconds)}</Text>
              <Pressable onPress={togglePause} disabled={finishing} style={[styles.miniKey, { backgroundColor: recording ? brand.volt : brand.track }]} accessibilityRole="button" accessibilityLabel={recording ? 'Pause' : 'Resume'}>
                {recording ? <PauseIcon size={22} color={brand.ink} /> : <PlayIcon size={22} color={brand.ink} />}
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>

        {/* Full: just the distance, time and pace, and the three keys. */}
        <Animated.View style={[{ flex: 1, paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 12) + 8, paddingHorizontal: GUTTER }, full]} pointerEvents={collapsed ? 'none' : 'auto'}>
          <View style={styles.grabber} />
          <View style={styles.liveTop}>
            <Text style={plain(17, recording ? 'rgba(242,239,232,0.7)' : brand.volt)}>{finishing ? 'Saving…' : recording ? capitalised(noun) : 'Paused'}</Text>
            <Pressable onPress={() => router.navigate('/dashboard')} hitSlop={10} style={styles.roundGhost} accessibilityRole="button" accessibilityLabel="Minimise, keep recording">
              <ChevronDownIcon size={20} color={brand.paper} />
            </Pressable>
          </View>

          <View style={{ flex: 1, justifyContent: 'center' }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={[score(160), { lineHeight: 162, color: bright }]} numberOfLines={1} adjustsFontSizeToFit>{formatDistanceNumber(shownMetres, unit)}</Text>
              <Text style={plain(18, 'rgba(242,239,232,0.6)')}>{unit === 'km' ? 'Kilometres' : 'Miles'}</Text>
            </View>
            <View style={styles.pair}>
              <Stat label="Time" value={formatDuration(seconds)} />
              <View style={styles.pairRule} />
              <Stat label={activityType === 'cycle' ? `${unit}/h` : `Pace /${unit}`} value={activityType === 'cycle' ? speed ?? '–' : pace ?? '–:––'} />
              {/* Walks count steps too, live from the phone's motion sensor. */}
              {activityType === 'walk' && <>
                <View style={styles.pairRule} />
                <Stat label="Steps" value={recorder.steps === null ? '–' : recorder.steps.toLocaleString('en-GB')} />
              </>}
            </View>
            {warning && <Text style={[plain(14, '#FFCC00'), { textAlign: 'center', marginTop: 24, lineHeight: 20 }]}>{warning}</Text>}
          </View>

          <View style={styles.keys}>
            <Key label="Discard" background="rgba(242,239,232,0.12)" icon={<CloseIcon size={26} color={brand.paper} />} disabled={finishing} onPress={() => { haptic(); void confirmDiscard(); }} />
            <Key label={recording ? 'Pause' : 'Resume'} background={recording ? brand.volt : brand.track} icon={recording ? <PauseIcon size={30} color={brand.ink} /> : <PlayIcon size={30} color={brand.ink} />} disabled={finishing} onPress={togglePause} />
            <Key label={finishing ? 'Saving' : 'End'} background="#FF453A" icon={<StopIcon size={24} color={brand.paper} />} disabled={finishing} onPress={() => { haptic('medium'); void confirmFinish(); }} />
          </View>
        </Animated.View>
      </Animated.View>
    </GestureDetector>

    {split && <View style={[styles.splitWrap, { top: insets.top + 56 }]} pointerEvents="none">
      <Animated.View key={split.count} entering={FadeInUp.duration(260)} exiting={FadeOutUp.duration(200)} style={styles.splitToast} accessibilityLiveRegion="polite">
        <Text style={[score(22), { lineHeight: 24, color: brand.ink }]}>{`${split.count} ${unit} · ${formatDuration(split.seconds)}`}</Text>
      </Animated.View>
    </View>}
  </View>;
}

/** Normal-width text for the run screens' labels: the wide cut reads as stretched at these sizes. */
const plain = (size: number, color: string): TextStyle => ({ fontFamily: fontFamily('semibold'), fontSize: size, color });

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={{ flex: 1, alignItems: 'center' }}>
    <Text style={[score(46), { lineHeight: 50, color: brand.paper }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    <Text style={plain(15, 'rgba(242,239,232,0.5)')} numberOfLines={1}>{label}</Text>
  </View>;
}

/** One of the three equal round keys, Apple Workout-style: a filled circle, its name underneath. */
function Key({ label, icon, background, onPress, disabled }: { label: string; icon: ReactNode; background: string; onPress: () => void; disabled?: boolean }) {
  return <View style={{ alignItems: 'center', gap: 8, opacity: disabled ? 0.5 : 1 }}>
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.key, { backgroundColor: background }, pressed && { transform: [{ scale: 0.92 }] }]}>
      {icon}
    </Pressable>
    <Text style={plain(14, 'rgba(242,239,232,0.75)')}>{label}</Text>
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
      playSound('split');
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
  topRow: { position: 'absolute', left: GUTTER, right: GUTTER, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, borderRadius: 20, paddingHorizontal: 14 },
  /** The ready sheet floats clear of the edges, rounded all round, like Maps on iOS 26. */
  floating: { left: 10, right: 10, bottom: 10, borderRadius: 34 },
  signalDot: { width: 10, height: 10, borderRadius: 5 },
  choice: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center' },
  check: { width: 22, height: 22, borderRadius: 6, backgroundColor: brand.ink, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  liveTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  panel: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: brand.ink, overflow: 'hidden' },
  compact: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 2 },
  compactRow: { paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: 12 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(242,239,232,0.3)', marginBottom: 10 },
  miniKey: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  roundGhost: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(242,239,232,0.12)', alignItems: 'center', justifyContent: 'center' },
  pair: { flexDirection: 'row', alignItems: 'center', marginTop: 40 },
  pairRule: { width: StyleSheet.hairlineWidth, height: 48, backgroundColor: 'rgba(242,239,232,0.2)' },
  keys: { flexDirection: 'row', justifyContent: 'space-evenly' },
  key: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center' },
  splitWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  splitToast: { borderRadius: 22, backgroundColor: colors.volt, paddingHorizontal: 18, paddingVertical: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
});
