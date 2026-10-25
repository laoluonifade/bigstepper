import { BlurView } from 'expo-blur';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeOut, useAnimatedProps, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { colors, fontFamily, score } from '@/lib/theme';
import { haptic } from './ui';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const FROM = 3;

/**
 * Apple Workout's 3, 2, 1 with a firm tap on each beat. `finish()` skips straight to the start; it fires
 * `onDone` once, with a success tap.
 */
export function useCountdown(active: boolean, onDone: () => void) {
  const [count, setCount] = useState(FROM);
  const progress = useSharedValue(0);
  const finished = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;

  function finish() {
    if (finished.current) return;
    finished.current = true;
    haptic('success');
    done.current();
  }

  useEffect(() => {
    if (!active) return;
    finished.current = false;
    setCount(FROM);
    progress.value = 0;
    progress.value = withTiming(1, { duration: FROM * 1000, easing: Easing.linear });
    haptic('heavy');
    let left = FROM;
    const timer = setInterval(() => {
      left -= 1;
      if (left > 0) {
        setCount(left);
        haptic('heavy');
      } else {
        clearInterval(timer);
        finish();
      }
    }, 1000);
    return () => clearInterval(timer);
    // `finish` only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, progress]);

  return { count, progress, finish };
}

/** The number inside an orange ring that drains as the seconds run out. */
export function CountdownRing({ count, progress, size = 96, light = false }: { count: number; progress: ReturnType<typeof useCountdown>['progress']; size?: number; light?: boolean }) {
  const stroke = Math.max(6, size / 14);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const drain = useAnimatedProps(() => ({ strokeDashoffset: circumference * progress.value }));
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLiveRegion="assertive" accessibilityLabel={`Starting in ${count}`}>
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={light ? 'rgba(242,239,232,0.14)' : colors.inkFaint} strokeWidth={stroke} fill="none" />
      <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={colors.track} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={circumference} animatedProps={drain} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </Svg>
    <Animated.View key={count} entering={ZoomIn.duration(240).easing(Easing.out(Easing.cubic))} exiting={FadeOut.duration(120)}>
      <Text style={[score(size * 0.5), { lineHeight: size * 0.56 }, light && { color: colors.volt }]}>{count}</Text>
    </Animated.View>
  </View>;
}

/**
 * The full-screen 3, 2, 1 before an activity: frosted dark, a big ring, what it will count toward, and a
 * Cancel that's easy to hit. Tapping the ring starts straight away.
 */
export function StartCountdown({ open, title, countingToward, onDone, onCancel }: {
  open: boolean; title: string; countingToward: string[] | null; onDone: () => void; onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { count, progress, finish } = useCountdown(open, onDone);
  return <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
    <View style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
      {Platform.OS === 'ios'
        ? <BlurView intensity={90} tint="systemUltraThinMaterialDark" style={StyleSheet.absoluteFill} />
        : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'ios' ? 'rgba(18,18,18,0.82)' : colors.ink }]} />
      <Text style={styles.title}>{title}</Text>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable onPress={finish} accessibilityRole="button" accessibilityLabel={`Starting in ${count}. Tap to start now.`}>
          <CountdownRing count={count} progress={progress} size={260} light />
        </Pressable>
        <Text style={styles.hint}>Tap the ring to start now</Text>
      </View>
      {countingToward && <View style={styles.toward}>
        <Text style={styles.towardLabel}>Counting toward</Text>
        <Text style={styles.towardList} numberOfLines={3}>{countingToward.length ? countingToward.join(' · ') : 'Your league and your totals'}</Text>
      </View>}
      <Pressable onPress={() => { haptic(); onCancel(); }} style={({ pressed }) => [styles.cancel, pressed && { transform: [{ scale: 0.97 }], opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel="Cancel">
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', paddingHorizontal: 24 },
  title: { fontFamily: fontFamily('semibold'), fontSize: 17, color: 'rgba(242,239,232,0.7)' },
  towardLabel: { fontFamily: fontFamily('semibold'), fontSize: 13, color: 'rgba(242,239,232,0.5)' },
  cancelText: { fontFamily: fontFamily('semibold'), fontSize: 17, color: colors.paper },
  hint: { fontFamily: fontFamily('semibold'), fontSize: 14, color: 'rgba(242,239,232,0.55)', marginTop: 28 },
  toward: { alignSelf: 'stretch', borderRadius: 18, backgroundColor: 'rgba(242,239,232,0.08)', padding: 16, marginBottom: 16 },
  towardList: { fontFamily: fontFamily('semibold'), fontSize: 15, lineHeight: 21, color: colors.paper, marginTop: 4 },
  cancel: { alignSelf: 'stretch', height: 60, borderRadius: 30, backgroundColor: 'rgba(242,239,232,0.14)', alignItems: 'center', justifyContent: 'center' },
});
