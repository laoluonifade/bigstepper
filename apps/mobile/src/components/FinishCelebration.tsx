import { formatDistanceNumber, formatDuration, formatPace, formatSpeed } from '@jump/shared/format';
import { shownMetres } from '@jump/shared/progress';
import type { Activity, Unit } from '@jump/shared/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeInDown, SlideInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// A paper bib: the brand's paper and ink in either theme.
import { brand as colors, fontFamily, score, wideLabel } from '@/lib/theme';
import { haptic } from './ui';

const KIND: Record<Activity['activityType'], string> = { run: 'Run', walk: 'Walk', cycle: 'Ride' };
const CONFETTI = [colors.track, colors.volt, colors.paper, '#FF9A6B', colors.volt];

/**
 * The finisher's bib. After Finish, a race bib slides up: your distance is the bib number (counting up
 * with a tick per tenth), time, pace and steps sit on tear-off stubs, and then the verdict is stamped
 * across it like a rubber stamp, with a thud. Jump's own moment, not another fitness-app summary.
 */
export function FinishCelebration({ activity, unit, onShare, onClose }: {
  activity: Activity; route?: Array<[number, number]>; unit: Unit; onShare: () => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const metres = shownMetres(activity);
  const { shown, landed } = useCountWithTicks(metres, unit, reduced);
  const moving = activity.movingSeconds || activity.elapsedSeconds;
  const cycle = activity.activityType === 'cycle';
  const finished = new Date(activity.finishedAt);
  const stubs = [
    { label: 'Time', value: formatDuration(moving) },
    { label: cycle ? 'Speed' : `Pace /${unit}`, value: ((cycle ? formatSpeed(metres, moving, unit) : formatPace(metres, moving, unit)) ?? '–').replace(/ (km|mi)\/h$/, '') },
    cycle
      ? { label: 'Elapsed', value: formatDuration(activity.elapsedSeconds) }
      : { label: 'Steps', value: (activity.validatedSteps || activity.recordedSteps).toLocaleString('en-GB') },
  ];

  return <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <View style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
      <Animated.Text entering={FadeInDown.duration(360)} style={[wideLabel(12, 0.14), styles.kicker]}>
        {`${KIND[activity.activityType]} finished · ${finished.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
      </Animated.Text>

      <View style={{ flex: 1, justifyContent: 'center', alignSelf: 'stretch' }}>
        <Animated.View entering={reduced ? FadeIn : SlideInDown.springify().damping(15).stiffness(120)}>
          {/* The bib, with its hard shadow. */}
          <View style={styles.shadow} />
          <View style={styles.bib}>
            <View style={styles.band}>
              <Text style={[wideLabel(11, 0.12), styles.bandText]}>{`Jump · ${KIND[activity.activityType]} finisher`}</Text>
              <Text style={[wideLabel(11, 0.08), styles.bandText]}>{finished.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Text>
            </View>
            <View style={styles.body}>
              {[styles.pinTL, styles.pinTR, styles.pinBL, styles.pinBR].map((pin, index) => <View key={index} style={[styles.pin, pin]} />)}
              <Text style={[wideLabel(10, 0.16), styles.label]}>{`Distance · ${unit}`}</Text>
              <Text style={styles.number} adjustsFontSizeToFit numberOfLines={1} accessibilityLabel={`${formatDistanceNumber(metres, unit)} ${unit}`}>
                {formatDistanceNumber(shown, unit)}
              </Text>
              {landed && <Stamp status={activity.verificationStatus} reduced={reduced} />}
            </View>
            <View style={styles.perforation}>
              <View style={[styles.notch, { left: -12 }]} />
              <View style={styles.tear} />
              <View style={[styles.notch, { right: -12 }]} />
            </View>
            <View style={styles.stubs}>
              {stubs.map((stub, index) => <View key={stub.label} style={[styles.stubCell, index > 0 && styles.stubDivider]}>
                <Text style={[score(24), { color: colors.ink }]} numberOfLines={1} adjustsFontSizeToFit>{stub.value}</Text>
                <Text style={[wideLabel(9, 0.14), styles.label, { marginTop: 4 }]}>{stub.label}</Text>
              </View>)}
            </View>
          </View>
        </Animated.View>
      </View>

      {landed && <Animated.View entering={FadeIn.delay(900)} style={{ alignSelf: 'stretch', gap: 10 }}>
        <Pressable onPress={() => { haptic('medium'); onShare(); }} style={({ pressed }) => [styles.share, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={[wideLabel(14, 0.06), { color: colors.volt, fontFamily: fontFamily('extrabold', 'wide') }]}>Share it</Text>
        </Pressable>
        <Pressable onPress={() => { haptic(); onClose(); }} style={({ pressed }) => [styles.done, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={[wideLabel(13, 0.06), { color: colors.ink, fontFamily: fontFamily('bold', 'wide') }]}>See details</Text>
        </Pressable>
      </Animated.View>}
    </View>
  </Modal>;
}

/**
 * The verdict, stamped across the bib: it slams down from above with a thud. Verified is Jump orange;
 * still checking is a faint pencil-grey "Checking"; a flag is ink "Needs a look". When the check finishes
 * while you're watching, the new stamp lands over it.
 */
function Stamp({ status, reduced }: { status: Activity['verificationStatus']; reduced: boolean }) {
  const look = status === 'VERIFIED' ? { text: 'Verified', color: colors.track, opacity: 1 }
    : status === 'PENDING_VERIFICATION' ? { text: 'Checking…', color: colors.ink3, opacity: 0.75 }
      : { text: 'Needs a look', color: colors.ink, opacity: 0.9 };
  const scale = useSharedValue(reduced ? 1 : 2.4);
  const fade = useSharedValue(reduced ? look.opacity : 0);
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (announced.current === status) return;
    announced.current = status;
    const delay = status === 'PENDING_VERIFICATION' ? 500 : 650;
    if (!reduced) {
      scale.value = 2.4;
      fade.value = 0;
      const timer = setTimeout(() => {
        scale.value = withSpring(1, { damping: 11, stiffness: 260 });
        fade.value = withTiming(look.opacity, { duration: 120 });
      }, delay);
      const thud = setTimeout(() => {
        haptic('heavy');
        if (status !== 'PENDING_VERIFICATION') setTimeout(() => haptic(status === 'VERIFIED' ? 'success' : 'warning'), 120);
      }, delay + 140);
      return () => { clearTimeout(timer); clearTimeout(thud); };
    }
    if (status !== 'PENDING_VERIFICATION') haptic(status === 'VERIFIED' ? 'success' : 'warning');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  const style = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ rotate: '-11deg' }, { scale: scale.value }] }));
  return <Animated.View pointerEvents="none" style={[styles.stamp, { borderColor: look.color }, style]}>
    <View style={[styles.stampInner, { borderColor: look.color }]}>
      <Text style={[wideLabel(22, 0.08), { color: look.color, fontFamily: 'ArchivoWide-Black' }]}>{look.text}</Text>
    </View>
  </Animated.View>;
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

/** Confetti thrown out of the number as it lands, falling away under a little gravity. */
export function Burst() {
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: 22, alignItems: 'center' },
  kicker: { color: colors.ink2, fontFamily: fontFamily('bold', 'wide') },
  shadow: { position: 'absolute', top: 6, left: 6, right: -6, bottom: -6, borderRadius: 22, backgroundColor: colors.ink },
  bib: { borderRadius: 22, borderWidth: 2.5, borderColor: colors.ink, backgroundColor: colors.card, overflow: 'hidden' },
  band: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.track, borderBottomWidth: 2.5, borderBottomColor: colors.ink, paddingHorizontal: 16, paddingVertical: 11 },
  bandText: { color: colors.ink, fontFamily: fontFamily('extrabold', 'wide') },
  body: { alignItems: 'center', paddingHorizontal: 26, paddingTop: 26, paddingBottom: 22 },
  label: { color: colors.ink2, fontFamily: fontFamily('bold', 'wide'), textAlign: 'center' },
  number: { fontFamily: 'ArchivoWide-Black', fontSize: 104, lineHeight: 112, letterSpacing: -4, color: colors.ink, marginTop: 4 },
  pin: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.paper },
  pinTL: { top: 12, left: 12 }, pinTR: { top: 12, right: 12 }, pinBL: { bottom: 12, left: 12 }, pinBR: { bottom: 12, right: 12 },
  stamp: { position: 'absolute', top: '42%', alignSelf: 'center', borderWidth: 3, borderRadius: 10, padding: 3 },
  stampInner: { borderWidth: 1.5, borderRadius: 7, paddingHorizontal: 14, paddingVertical: 6 },
  perforation: { height: 24, justifyContent: 'center' },
  tear: { marginHorizontal: 18, borderTopWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(18,18,18,0.35)' },
  notch: { position: 'absolute', top: 0, width: 24, height: 24, borderRadius: 12, borderWidth: 2.5, borderColor: colors.ink, backgroundColor: colors.paper },
  stubs: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 4, paddingBottom: 18 },
  stubCell: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  stubDivider: { borderLeftWidth: 2, borderStyle: 'dashed', borderLeftColor: 'rgba(18,18,18,0.25)' },
  share: { height: 58, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  done: { height: 52, borderRadius: 12, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  burst: { position: 'absolute', top: '50%', left: '50%', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
});
