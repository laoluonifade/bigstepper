import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@/lib/theme';
import { JUMP_LOGO } from './icons';

const WIDTH = 230;
const HEIGHT = (WIDTH * JUMP_LOGO.height) / JUMP_LOGO.width;
/** Logo units (the wordmark's viewBox) to points. */
const K = WIDTH / JUMP_LOGO.width;

/** The letters path is four glyphs drawn in the order M, P, U, J, then P's counter; split them so each can move. */
const SUBPATHS = JUMP_LOGO.letters.split('Z').filter(Boolean).map((part) => `${part}Z`);
const GLYPHS = [SUBPATHS[3], SUBPATHS[2], SUBPATHS[0], `${SUBPATHS[1]} ${SUBPATHS[4]}`];

/** Where the ball touches down, in logo units: off to the left, then the middle of each letter's top. */
const LANDINGS = [-34, 33, 98, 165, 233];
const LETTER_TOP = 44;
const HOP_HEIGHT = 38;
/** The arrow's tip, where the ball ends its last leap. */
const TIP = { x: 249, y: 7 };
const BALL = 15;

const HOP_MS = 210;
const LEAP_AT = GLYPHS.length * HOP_MS + 40;
const LEAP_MS = 300;
const BURST_AT = LEAP_AT + LEAP_MS;
/** When the letters start their waiting loop. */
const LOOP_AT = BURST_AT + 450;
const STAGGER = 80;
/** One beat of the waiting loop: the wave across the letters, the arrow's kick, then a rest. */
const BEAT_MS = 1380;
const KICK_AT = LOOP_AT + GLYPHS.length * STAGGER;
/** How long the intro takes, so the app can wait for it rather than cut it off. */
export const BOOT_INTRO_MS = BURST_AT + 260;

/** A letter springs up out of the baseline the moment the ball lands on it, then joins the wave. */
function Glyph({ d, index, reduced }: { d: string; index: number; reduced: boolean }) {
  const rise = useSharedValue(reduced ? 1 : 0);
  const hop = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    rise.value = withDelay((index + 1) * HOP_MS - 30, withSpring(1, { damping: 7, stiffness: 260 }));
    hop.value = withDelay(LOOP_AT + index * STAGGER, withRepeat(withSequence(
      withTiming(-9, { duration: 180, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 320, easing: Easing.bounce }),
      withTiming(0, { duration: BEAT_MS - 500 }),
    ), -1));
  }, [hop, index, reduced, rise]);
  const style = useAnimatedStyle(() => ({
    opacity: rise.value > 0.02 ? 1 : 0,
    transform: [{ translateY: hop.value }, { scaleY: rise.value }, { scaleX: 1 + (1 - rise.value) * 0.25 }],
  }));
  return <Animated.View style={[styles.layer, styles.baseline, style]}>
    <Logo d={d} color={colors.ink} evenOdd />
  </Animated.View>;
}

/** The orange ball: hops letter to letter, leaps to the arrow's tip, and bursts there. */
function Ball({ hops, leap, vanish }: { hops: SharedValue<number>; leap: SharedValue<number>; vanish: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    let x: number;
    let y: number;
    let squash = 0;
    if (leap.value > 0) {
      const t = leap.value;
      const from = LANDINGS[LANDINGS.length - 1];
      x = from + (TIP.x - from) * t;
      y = LETTER_TOP + (TIP.y - LETTER_TOP) * t - 22 * 4 * t * (1 - t);
    } else {
      const seg = Math.min(LANDINGS.length - 2, Math.floor(hops.value));
      const f = hops.value - seg;
      x = LANDINGS[seg] + (LANDINGS[seg + 1] - LANDINGS[seg]) * f;
      y = LETTER_TOP - HOP_HEIGHT * 4 * f * (1 - f);
      // Flattens as it touches down and takes off, like a ball should.
      squash = Math.max(0, 1 - 7 * Math.min(f, 1 - f)) * 0.35;
    }
    const gone = 1 - vanish.value;
    return {
      opacity: gone,
      transform: [
        { translateX: x * K - BALL / 2 },
        { translateY: y * K - BALL * (1 - squash / 2) },
        { scaleX: (1 + squash) * gone },
        { scaleY: (1 - squash) * gone },
      ],
    };
  });
  return <Animated.View style={[styles.ball, style]} />;
}

/** The arrow sweeps out in orange from the J's shoulder to the tip, racing the ball there. */
function Arrow({ draw, kick }: { draw: SharedValue<number>; kick: SharedValue<number> }) {
  const reveal = useAnimatedStyle(() => ({ width: WIDTH * (0.24 + 0.76 * draw.value) }));
  const move = useAnimatedStyle(() => ({
    opacity: draw.value > 0 ? 1 : 0,
    transform: [{ translateX: kick.value * 5 }, { translateY: kick.value * -6 }],
  }));
  return <Animated.View style={[styles.layer, move]}>
    <Animated.View style={[styles.clip, reveal]}>
      <Logo d={JUMP_LOGO.arrow} color={colors.track} />
    </Animated.View>
  </Animated.View>;
}

const SPARKS = Array.from({ length: 9 }, (_, index) => ({ angle: -Math.PI * 0.95 + (index * Math.PI * 1.3) / 8, color: index % 2 ? colors.ink : colors.track }));

function Spark({ angle, color, burst, kick }: { angle: number; color: string; burst: SharedValue<number>; kick: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = burst.value;
    const distance = 6 + 22 * Math.sqrt(t);
    return {
      opacity: t > 0 && t < 1 ? 1 - t : 0,
      transform: [
        { translateX: TIP.x * K + kick.value * 5 + Math.cos(angle) * distance - 5 },
        { translateY: TIP.y * K - kick.value * 6 + Math.sin(angle) * distance - 1.5 },
        { rotate: `${angle}rad` },
        { scaleX: 1 - t * 0.6 },
      ],
    };
  });
  return <Animated.View style={[styles.spark, { backgroundColor: color }, style]} />;
}

function Logo({ d, color, evenOdd }: { d: string; color: string; evenOdd?: boolean }) {
  return <Svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${JUMP_LOGO.width} ${JUMP_LOGO.height}`} fill={color}>
    <Path d={d} fillRule={evenOdd ? 'evenodd' : 'nonzero'} />
  </Svg>;
}

/**
 * What you see while the app starts. An orange ball bounces in and hops across the word, and each letter
 * springs up as it lands; then it leaps for the arrow's tip as the arrow sweeps in after it, and bursts into
 * sparks. Until the app is ready the word keeps hopping, and each kick of the arrow throws sparks again.
 * It takes over from the native splash (same paper background) and fades out over the first screen.
 */
export function BootScreen({ onShown }: { onShown?: () => void }) {
  const reduced = useReducedMotion();
  const hops = useSharedValue(0);
  const leap = useSharedValue(0);
  const draw = useSharedValue(reduced ? 1 : 0);
  const burst = useSharedValue(0);
  const kick = useSharedValue(0);
  const vanish = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    hops.value = withTiming(LANDINGS.length - 1, { duration: GLYPHS.length * HOP_MS, easing: Easing.linear });
    leap.value = withDelay(LEAP_AT, withTiming(1, { duration: LEAP_MS, easing: Easing.out(Easing.quad) }));
    draw.value = withDelay(LEAP_AT, withTiming(1, { duration: LEAP_MS, easing: Easing.out(Easing.cubic) }));
    vanish.value = withDelay(BURST_AT, withTiming(1, { duration: 110 }));
    burst.value = withSequence(
      withDelay(BURST_AT, withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) })),
      // Then again with every kick of the arrow.
      withDelay(KICK_AT + 120 - BURST_AT - 420, withRepeat(withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: BEAT_MS - 420 }),
      ), -1)),
    );
    kick.value = withDelay(KICK_AT, withRepeat(withSequence(
      withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 280, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: BEAT_MS - 480 }),
    ), -1));
  }, [burst, draw, hops, kick, leap, reduced, vanish]);

  return <Animated.View exiting={FadeOut.duration(260)} style={styles.screen} onLayout={onShown} accessibilityLabel="Jump is loading">
    <View style={{ width: WIDTH, height: HEIGHT }}>
      {GLYPHS.map((d, index) => <Glyph key={index} d={d} index={index} reduced={reduced} />)}
      <Arrow draw={draw} kick={kick} />
      {!reduced && <>
        {SPARKS.map((spark, index) => <Spark key={index} {...spark} burst={burst} kick={kick} />)}
        <Ball hops={hops} leap={leap} vanish={vanish} />
      </>}
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  screen: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper, zIndex: 10 },
  layer: { position: 'absolute', top: 0, left: 0, width: WIDTH, height: HEIGHT },
  /** Letters grow from the baseline, not their middle. */
  baseline: { transformOrigin: 'bottom' },
  clip: { height: HEIGHT, overflow: 'hidden' },
  ball: { position: 'absolute', top: 0, left: 0, width: BALL, height: BALL, borderRadius: BALL / 2, backgroundColor: colors.track },
  spark: { position: 'absolute', top: 0, left: 0, width: 10, height: 3, borderRadius: 1.5 },
});
