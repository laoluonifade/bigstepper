import { formatDistanceNumber, formatDuration, formatPace, formatSpeed } from '@jump/shared/format';
import { shownMetres } from '@jump/shared/progress';
import type { Activity, Unit } from '@jump/shared/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeInDown, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming, ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
// Always dark, in either theme, like the live workout it follows.
import { brand as colors, display, fontFamily, score, wideLabel } from '@/lib/theme';
import { CheckIcon } from './icons';
import { haptic } from './ui';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const DONE: Record<Activity['activityType'], string> = { run: 'Run done.', walk: 'Walk done.', cycle: 'Ride done.' };
const CONFETTI = [colors.track, colors.volt, colors.paper, '#FF9A6B', colors.volt];

/**
 * The moment after Finish: the route draws itself while the distance counts up under your thumb (a
 * light tick per tenth), lands with a thud and a burst, then the numbers and the verdict arrive, each
 * with its own tap.
 */
export function FinishCelebration({ activity, route, unit, onShare, onClose }: {
  activity: Activity; route: Array<[number, number]>; unit: Unit; onShare: () => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const metres = shownMetres(activity);
  const { shown, landed } = useCountWithTicks(metres, unit, reduced);
  const pop = useSharedValue(1);
  const moving = activity.movingSeconds || activity.elapsedSeconds;
  const cycle = activity.activityType === 'cycle';
  const stats = [
    { label: 'Time', value: formatDuration(moving) },
    { label: cycle ? 'Avg speed' : `Pace /${unit}`, value: (cycle ? formatSpeed(metres, moving, unit) : formatPace(metres, moving, unit)) ?? '–' },
    cycle
      ? { label: 'Elapsed', value: formatDuration(activity.elapsedSeconds) }
      : { label: 'Steps', value: (activity.validatedSteps || activity.recordedSteps).toLocaleString('en-GB') },
  ];

  useEffect(() => {
    if (!landed) return;
    pop.value = withSequence(withTiming(1.12, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 180 }));
    // The stats arrive one by one, a light tap each.
    const timers = stats.map((_, index) => setTimeout(() => haptic('tap'), 380 + index * 140));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed]);

  // The verdict gets its own moment once the count has landed.
  const status = activity.verificationStatus;
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!landed || status === 'PENDING_VERIFICATION' || announced.current === status) return;
    announced.current = status;
    const timer = setTimeout(() => haptic(status === 'VERIFIED' ? 'success' : 'warning'), 900);
    return () => clearTimeout(timer);
  }, [landed, status]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <View style={[styles.screen, { paddingTop: insets.top + 20, paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
      <View style={styles.glow} pointerEvents="none" />
      <Animated.Text entering={FadeInDown.duration(380)} style={styles.kicker}>{new Date(activity.finishedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {formatDuration(moving)}</Animated.Text>
      <Animated.Text entering={FadeInDown.delay(80).duration(380)} style={[display(40), styles.headline]}>{DONE[activity.activityType] ?? 'Done.'}</Animated.Text>

      <RouteTrace route={route} reduced={reduced} />

      <View style={styles.hero}>
        {landed && !reduced && <Burst />}
        <Animated.View style={[styles.distance, popStyle]}>
          <Text style={[score(96), styles.distanceNumber]} accessibilityLabel={`${formatDistanceNumber(metres, unit)} ${unit}`}>{formatDistanceNumber(shown, unit)}</Text>
          <Text style={styles.unit}>{unit}</Text>
        </Animated.View>
      </View>

      <View style={styles.stats}>
        {stats.map((stat, index) => landed
          ? <Animated.View key={stat.label} entering={FadeInDown.delay(380 + index * 140).springify().damping(14)} style={styles.stat}>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </Animated.View>
          : <View key={stat.label} style={[styles.stat, { opacity: 0 }]} />)}
      </View>

      <View style={styles.verdictSlot}>
        {landed && <Verdict status={status} />}
      </View>

      <View style={{ flex: 1 }} />
      {landed && <Animated.View entering={FadeIn.delay(700)} style={styles.actions}>
        <Pressable onPress={() => { haptic('medium'); onShare(); }} style={({ pressed }) => [styles.share, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.shareText}>Share it</Text>
        </Pressable>
        <Pressable onPress={() => { haptic(); onClose(); }} style={({ pressed }) => [styles.done, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.doneText}>See details</Text>
        </Pressable>
      </Animated.View>}
    </View>
  </Modal>;
}

/** Counts from zero to the distance, ticking the phone once per tenth, and lands with a thud. */
function useCountWithTicks(metres: number, unit: Unit, reduced: boolean) {
  const [shown, setShown] = useState(reduced ? metres : 0);
  const [landed, setLanded] = useState(reduced);
  useEffect(() => {
    if (reduced) {
      haptic('success');
      return;
    }
    haptic('heavy');
    const duration = Math.min(2600, 1300 + metres / 10);
    const startedAt = Date.now();
    let lastTenth = 0;
    let lastTick = 0;
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - startedAt) / duration);
      const value = metres * (1 - Math.pow(1 - t, 3));
      setShown(value);
      const tenth = Math.floor(Number(formatDistanceNumber(value, unit).replace(/,/g, '')) * 10);
      // A tick per tenth, but never faster than the motor can make them feel separate.
      if (tenth !== lastTenth && Date.now() - lastTick > 55) {
        lastTenth = tenth;
        lastTick = Date.now();
        haptic('select');
      }
      if (t < 1) frame = requestAnimationFrame(step);
      else {
        setShown(metres);
        haptic('heavy');
        setTimeout(() => haptic('success'), 130);
        setLanded(true);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // Once, when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { shown, landed };
}

/** The route, drawn as one stroke from start to finish. */
function RouteTrace({ route, reduced }: { route: Array<[number, number]>; reduced: boolean }) {
  const { width } = useWindowDimensions();
  const box = { width: width - 48, height: 150 };
  const shape = useMemo(() => tracePath(route, box.width, box.height), [route, box.width, box.height]);
  const draw = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!shape || reduced) return;
    draw.value = withDelay(150, withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.cubic) }));
  }, [shape, reduced, draw]);
  const stroke = useAnimatedProps(() => ({ strokeDashoffset: (shape?.length ?? 0) * (1 - draw.value) }));
  const end = useAnimatedProps(() => ({ opacity: draw.value > 0.98 ? 1 : 0 }));
  if (!shape) return <View style={{ height: 24 }} />;
  return <Svg width={box.width} height={box.height} style={{ marginVertical: 12 }}>
    <Path d={shape.d} stroke="rgba(242,239,232,0.1)" strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <AnimatedPath d={shape.d} stroke={colors.track} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={shape.length} animatedProps={stroke} />
    <Circle cx={shape.start[0]} cy={shape.start[1]} r={5} fill={colors.paper} />
    <AnimatedCircle cx={shape.end[0]} cy={shape.end[1]} r={7} fill={colors.volt} stroke={colors.ink} strokeWidth={2} animatedProps={end} />
  </Svg>;
}

function tracePath(route: Array<[number, number]>, width: number, height: number) {
  if (route.length < 2) return null;
  const every = Math.ceil(route.length / 400);
  const points = route.filter((_, index) => index % every === 0 || index === route.length - 1);
  const midLat = points.reduce((sum, [lat]) => sum + lat, 0) / points.length;
  const squash = Math.cos((midLat * Math.PI) / 180);
  const xs = points.map(([, lng]) => lng * squash);
  const ys = points.map(([lat]) => -lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 10;
  const scale = Math.min((width - pad * 2) / Math.max(maxX - minX, 1e-9), (height - pad * 2) / Math.max(maxY - minY, 1e-9));
  const offsetX = (width - (maxX - minX) * scale) / 2;
  const offsetY = (height - (maxY - minY) * scale) / 2;
  const projected = xs.map((x, index) => [offsetX + (x - minX) * scale, offsetY + (ys[index] - minY) * scale] as [number, number]);
  let length = 0;
  for (let index = 1; index < projected.length; index += 1) {
    length += Math.hypot(projected[index][0] - projected[index - 1][0], projected[index][1] - projected[index - 1][1]);
  }
  if (length < 1) return null;
  const d = projected.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return { d, length, start: projected[0], end: projected[projected.length - 1] };
}

/** Confetti thrown out of the number as it lands, falling away under a little gravity. */
function Burst() {
  const pieces = useMemo(() => Array.from({ length: 34 }, (_, index) => ({
    angle: (index / 34) * Math.PI * 2 + Math.random() * 0.4,
    distance: 110 + Math.random() * 120,
    size: 5 + Math.random() * 6,
    color: CONFETTI[index % CONFETTI.length],
    spin: (Math.random() - 0.5) * 720,
    round: index % 3 === 0,
  })), []);
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) });
  }, [progress]);
  return <View style={styles.burst} pointerEvents="none">
    {pieces.map((piece, index) => <Piece key={index} piece={piece} progress={progress} />)}
  </View>;
}

function Piece({ piece, progress }: { piece: { angle: number; distance: number; size: number; color: string; spin: number; round: boolean }; progress: ReturnType<typeof useSharedValue<number>> }) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: 1 - p * p * p,
      transform: [
        { translateX: Math.cos(piece.angle) * piece.distance * p },
        { translateY: Math.sin(piece.angle) * piece.distance * p + 160 * p * p },
        { rotate: `${piece.spin * p}deg` },
      ],
    };
  });
  return <Animated.View style={[{ position: 'absolute', width: piece.size, height: piece.round ? piece.size : piece.size * 0.45, borderRadius: piece.round ? piece.size / 2 : 1, backgroundColor: piece.color }, style]} />;
}

function Verdict({ status }: { status: Activity['verificationStatus'] }) {
  if (status === 'PENDING_VERIFICATION') {
    return <Animated.View entering={FadeIn.delay(700)} style={styles.checking}>
      <ActivityIndicator size="small" color={colors.paper} />
      <Text style={styles.checkingText}>Checking your route…</Text>
    </Animated.View>;
  }
  const ok = status === 'VERIFIED';
  return <Animated.View key={status} entering={ZoomIn.delay(900).springify().damping(10)} style={[styles.verdict, !ok && styles.verdictWarn]}>
    {ok && <CheckIcon size={18} color={colors.ink} />}
    <Text style={[wideLabel(13, 0.04), { color: ok ? colors.ink : colors.paper }]}>{ok ? 'Verified · it counts' : 'Needs a closer look'}</Text>
  </Animated.View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink, paddingHorizontal: 24, alignItems: 'center' },
  glow: { position: 'absolute', top: -180, width: 520, height: 520, borderRadius: 260, backgroundColor: colors.track, opacity: 0.16 },
  kicker: { fontFamily: fontFamily('semibold'), fontSize: 14, color: 'rgba(242,239,232,0.6)' },
  headline: { color: colors.paper, marginTop: 4 },
  hero: { alignItems: 'center', justifyContent: 'center', minHeight: 120 },
  burst: { position: 'absolute', top: '50%', left: '50%', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  distance: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  distanceNumber: { color: colors.volt, lineHeight: 104 },
  unit: { fontFamily: fontFamily('bold'), fontSize: 22, color: colors.paper },
  stats: { flexDirection: 'row', alignSelf: 'stretch', gap: 10, marginTop: 20 },
  stat: { flex: 1, borderRadius: 18, backgroundColor: 'rgba(242,239,232,0.08)', paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', minHeight: 70 },
  statValue: { fontFamily: fontFamily('bold'), fontSize: 20, color: colors.paper },
  statLabel: { fontFamily: fontFamily('semibold'), fontSize: 12, color: 'rgba(242,239,232,0.55)', marginTop: 4 },
  verdictSlot: { height: 44, marginTop: 22, justifyContent: 'center' },
  checking: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkingText: { fontFamily: fontFamily('semibold'), fontSize: 15, color: 'rgba(242,239,232,0.75)' },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.volt, borderRadius: 22, paddingHorizontal: 18, height: 44 },
  verdictWarn: { backgroundColor: 'rgba(242,239,232,0.14)' },
  actions: { alignSelf: 'stretch', gap: 10 },
  share: { height: 58, borderRadius: 29, backgroundColor: colors.volt, alignItems: 'center', justifyContent: 'center' },
  shareText: { fontFamily: fontFamily('bold'), fontSize: 17, color: colors.ink },
  done: { height: 54, borderRadius: 27, backgroundColor: 'rgba(242,239,232,0.12)', alignItems: 'center', justifyContent: 'center' },
  doneText: { fontFamily: fontFamily('semibold'), fontSize: 16, color: colors.paper },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.88 },
});
