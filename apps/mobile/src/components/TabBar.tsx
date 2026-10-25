import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { usePathname } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { BlurView } from 'expo-blur';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, interpolateColor, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useRecorder } from '@/lib/recorder';
import { colors, fontFamily, scheme } from '@/lib/theme';
import { FeedIcon, HomeIcon, PlayIcon, RunIcon, TableIcon, UserIcon } from './icons';
import { Glass } from './Glass';
import { haptic, HardShadow } from './ui';

/** The run screen listens for the centre button's Start, the way the web's run page does. */
const startListeners = new Set<() => void>();
export function onStartPressed(listener: () => void) {
  startListeners.add(listener);
  return () => void startListeners.delete(listener);
}

/** The active tab's pill: ink with a volt icon in light mode; in dark mode ink is cream, so volt with a dark icon. */
const PILL = scheme === 'dark' ? colors.volt : colors.ink;
const PILL_ICON = scheme === 'dark' ? colors.onAccent : colors.volt;

/** iOS gets the floating glass capsule; Android keeps the full-width bar. */
export const FLOATING = Platform.OS === 'ios';
const CAPSULE_HEIGHT = 66;
/** The selection bubble: a lighter (or, in dark mode, brighter) lens on the glass. */
const BUBBLE_TINT = scheme === 'dark' ? 'rgba(242,239,232,0.22)' : 'rgba(255,255,255,0.55)';
/** Dark glass over dark content loses its shape: lift it a touch, and give it a hairline edge (below). */
const CAPSULE_TINT = scheme === 'dark' ? 'rgba(58,58,62,0.42)' : undefined;
/** How much of a screen's bottom the floating bar covers, so content can scroll clear of it. */
export function floatingTabInset(bottomInset: number) {
  return FLOATING ? CAPSULE_HEIGHT + Math.max(bottomInset - 6, 10) + 16 : 0;
}

const TABS: Record<string, { label: string; icon: (color: string) => ReactNode }> = {
  dashboard: { label: 'Home', icon: (color) => <HomeIcon color={color} /> },
  competitions: { label: 'Compete', icon: (color) => <TableIcon color={color} /> },
  feed: { label: 'Rant', icon: (color) => <FeedIcon color={color} /> },
  you: { label: 'You', icon: (color) => <UserIcon color={color} /> },
};

const EASE = { duration: 240, easing: Easing.out(Easing.cubic) };

function Tab({ label, icon, active, onPress, floating }: { label: string; icon: (color: string) => ReactNode; active: boolean; onPress: () => void; floating: boolean }) {
  // 0 → 1 as the tab becomes active: eased, no overshoot.
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => { on.value = withTiming(active ? 1 : 0, EASE); }, [active, on]);
  const bar = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scaleX: 0.3 + 0.7 * on.value }] }));
  const pill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], ['rgba(18,18,18,0)', PILL]),
    transform: [{ scale: 0.86 + 0.14 * on.value }],
  }));
  const lit = useAnimatedStyle(() => ({ opacity: on.value }));
  const dim = useAnimatedStyle(() => ({ opacity: 1 - on.value }));
  const text = useAnimatedStyle(() => ({ color: interpolateColor(on.value, [0, 1], [colors.ink3, colors.ink]) }));
  return <Pressable onPress={onPress} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={label}>
    {/* Orange bar along the top edge of the active tab. */}
    {!floating && <Animated.View style={[styles.activeBar, bar]} />}
    <Animated.View style={[styles.iconPill, floating && styles.iconPillFloating, pill]}>
      {/* The two icon colours cross-fade rather than snap. */}
      <Animated.View style={[styles.icon, dim]}>{icon(colors.ink3)}</Animated.View>
      <Animated.View style={[styles.icon, lit]}>{icon(PILL_ICON)}</Animated.View>
    </Animated.View>
    <Animated.Text style={[styles.label, { fontFamily: fontFamily(active ? 'black' : 'semibold') }, text]}>{label}</Animated.Text>
  </Pressable>;
}

const PAD = 6;
const BUBBLE = { damping: 24, stiffness: 260, mass: 0.9 };

/**
 * iOS: the tabs on a floating Liquid Glass capsule, with a glass bubble under the current one. Tap a tab,
 * or press and slide the bubble along the bar: it follows your finger (stretching with speed), ticks as it
 * crosses each tab, and opens the one you let go on. It glides there on its own when the tab changes.
 */
function FloatingTabBar({ state, navigateToTab, bottom, onRun, live, locating }: {
  state: BottomTabBarProps['state']; navigateToTab: BottomTabBarProps['navigateToTab']; bottom: number; onRun: boolean; live: boolean; locating: boolean;
}) {
  const count = state.routes.length;
  const [width, setWidth] = useState(0);
  const slot = width > 0 ? (width - PAD * 2) / count : 0;
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const lift = useSharedValue(0);
  const stretch = useSharedValue(0);
  const dragging = useSharedValue(false);
  // While dragging, the tab under your finger lights up before you let go.
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? state.index;

  useEffect(() => {
    if (!slot || dragging.value) return;
    x.value = withSpring(state.index * slot, BUBBLE);
  }, [state.index, slot, x, dragging]);

  function select(index: number) {
    setHover(null);
    const route = state.routes[index];
    if (!route) return;
    if (route.name === 'run' && onRun && !live) {
      if (!locating) startListeners.forEach((listener) => listener());
      return;
    }
    if (index !== state.index) navigateToTab(route.key);
  }
  function hovering(index: number) {
    haptic('select');
    setHover(index);
  }

  const drag = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .onBegin(() => {
      start.value = x.value;
    })
    .onStart(() => {
      dragging.value = true;
      lift.value = withTiming(1, { duration: 160 });
    })
    .onUpdate((event) => {
      if (!slot) return;
      const next = Math.max(0, Math.min(slot * (count - 1), start.value + event.translationX));
      const before = Math.round(x.value / slot);
      x.value = next;
      stretch.value = Math.min(0.35, Math.abs(event.velocityX) / 2600);
      const now = Math.round(next / slot);
      if (now !== before) runOnJS(hovering)(now);
    })
    .onEnd(() => {
      if (!slot) return;
      const index = Math.round(x.value / slot);
      x.value = withSpring(index * slot, BUBBLE);
      runOnJS(select)(index);
    })
    .onFinalize((_event, success) => {
      if (!success) runOnJS(setHover)(null);
      dragging.value = false;
      lift.value = withTiming(0, { duration: 220 });
      stretch.value = withTiming(0, { duration: 220 });
    });
  const tap = Gesture.Tap().maxDuration(400).onEnd((event) => {
    if (!slot) return;
    const index = Math.max(0, Math.min(count - 1, Math.floor((event.x - PAD) / slot)));
    runOnJS(haptic)('tap');
    runOnJS(select)(index);
  });

  const runSlot = state.routes.findIndex((route) => route.name === 'run');
  const bubble = useAnimatedStyle(() => ({
    width: slot,
    // Resting on Run, the orange orb is the selection: the bubble fades out as it arrives (and back while dragging).
    opacity: runSlot < 0 || !slot ? 1 : Math.max(lift.value, Math.min(1, Math.abs(x.value - runSlot * slot) / (slot * 0.6))),
    transform: [{ translateX: PAD + x.value }, { scaleX: 1 + lift.value * 0.08 + stretch.value }, { scaleY: 1 + lift.value * 0.1 - stretch.value * 0.3 }],
  }));

  return <View style={[styles.floatingWrap, { paddingBottom: Math.max(bottom - 6, 10) }]} pointerEvents="box-none">
    <GestureDetector gesture={Gesture.Exclusive(drag, tap)}>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.capsuleShadow} accessibilityRole="tablist">
        <Glass style={styles.capsule} tint={CAPSULE_TINT}>
          {slot > 0 && <Animated.View style={[styles.bubble, bubble]} pointerEvents="none">
            <Glass interactive tint={BUBBLE_TINT} solid={BUBBLE_TINT} style={StyleSheet.absoluteFill} />
          </Animated.View>}
          {state.routes.map((route, index) => {
            const active = shown === index;
            if (route.name === 'run') {
              const starting = onRun && !live;
              return <View key={route.key} style={styles.tab} accessible accessibilityRole="button"
                accessibilityLabel={starting ? (locating ? 'Finding GPS signal' : 'Start activity') : 'Run'} onAccessibilityTap={() => select(index)}>
                <View style={styles.runOrb}>
                  {starting ? (locating ? <ActivityIndicator color={colors.onAccent} /> : <PlayIcon size={24} color={colors.onAccent} />) : <RunIcon size={23} color={colors.onAccent} />}
                </View>
              </View>;
            }
            const tab = TABS[route.name];
            if (!tab) return null;
            return <View key={route.key} style={styles.tab} accessible accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: active }} onAccessibilityTap={() => select(index)}>
              {tab.icon(active ? colors.ink : colors.ink3)}
              <Text style={[styles.floatingLabel, { color: active ? colors.ink : colors.ink3, fontFamily: fontFamily(active ? 'bold' : 'semibold') }]}>{tab.label}</Text>
            </View>;
          })}
        </Glass>
      </View>
    </GestureDetector>
  </View>;
}

/**
 * The web's mobile tab bar: four tabs around a raised orange Run button. On the run screen, before an
 * activity, that button becomes Start (and shows the GPS search once tapped). It hides while an activity
 * fills the screen.
 */
export function TabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const recorder = useRecorder();
  const pathname = usePathname();
  const live = recorder.phase === 'recording' || recorder.phase === 'paused' || recorder.phase === 'finishing';
  if (pathname === '/run' && live) return null;
  const onRun = pathname === '/run';
  const locating = recorder.phase === 'locating';

  if (FLOATING) return <FloatingTabBar state={state} navigateToTab={navigateToTab} bottom={insets.bottom} onRun={onRun} live={live} locating={locating} />;

  return <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]} accessibilityRole="tablist">
    {/* No rule across the top: the bar lifts off the page with a soft shadow, frosted on iOS. */}
    {Platform.OS === 'ios' ? <BlurView intensity={80} tint={scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} style={styles.glass} /> : null}
    {state.routes.map((route, index) => {
      const active = state.index === index;
      const go = () => { haptic(); navigateToTab(route.key); };
      if (route.name === 'run') {
        const start = onRun && !live;
        return <Pressable
          key={route.key}
          onPress={start ? () => { startListeners.forEach((listener) => listener()); } : go}
          disabled={start && locating}
          style={styles.tab}
          accessibilityRole="button"
          accessibilityLabel={start ? (locating ? 'Finding GPS signal' : 'Start activity') : 'Run'}
          accessibilityState={{ busy: start && locating }}
        >
          {({ pressed }) => <>
            <HardShadow offset={3} radius={8} pressed={pressed || (start && locating)} style={styles.raised}>
              <View style={styles.runButton}>
                {start ? (locating ? <ActivityIndicator color={colors.onAccent} /> : <PlayIcon size={24} color={colors.onAccent} />) : <RunIcon size={22} color={colors.onAccent} />}
              </View>
            </HardShadow>
            <Text style={[styles.label, { color: colors.ink, fontFamily: fontFamily(start ? 'extrabold' : 'bold') }]}>{start ? (locating ? 'GPS…' : 'Start') : 'Run'}</Text>
          </>}
        </Pressable>;
      }
      const tab = TABS[route.name];
      return tab ? <Tab key={route.key} label={tab.label} icon={tab.icon} active={active} onPress={go} floating={FLOATING} /> : null;
    })}
  </View>;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingTop: 6,
    backgroundColor: Platform.OS === 'ios' ? (scheme === 'dark' ? 'rgba(14,14,15,0.72)' : 'rgba(242,239,232,0.72)') : colors.paper,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: -4 }, elevation: 16,
  },
  glass: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingTop: 6, paddingBottom: 4 },
  activeBar: { position: 'absolute', top: -6, width: 32, height: 3, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: colors.track },
  iconPill: { width: 48, height: 32, borderRadius: 8 },
  icon: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  raised: { marginTop: -26, marginBottom: 2 },
  floatingWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14 },
  capsule: {
    flexDirection: 'row', alignItems: 'center', height: CAPSULE_HEIGHT, borderRadius: CAPSULE_HEIGHT / 2, paddingHorizontal: 6,
    borderWidth: StyleSheet.hairlineWidth, borderColor: scheme === 'dark' ? 'rgba(242,239,232,0.22)' : 'rgba(255,255,255,0.7)',
  },
  // The glass clips what's inside it, so its shadow lives on the wrapper.
  capsuleShadow: { borderRadius: CAPSULE_HEIGHT / 2, shadowColor: '#000', shadowOpacity: scheme === 'dark' ? 0.5 : 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } },
  iconPillFloating: { width: 46, height: 30, borderRadius: 15 },
  bubble: { position: 'absolute', left: 0, top: 6, bottom: 6, borderRadius: (CAPSULE_HEIGHT - 12) / 2, overflow: 'hidden' },
  floatingLabel: { fontSize: 10.5, marginTop: 3 },
  runOrb: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.track, alignItems: 'center', justifyContent: 'center' },
  runButton: { width: 56, height: 56, borderRadius: 8, borderWidth: 2, borderColor: colors.onAccent, backgroundColor: colors.track, alignItems: 'center', justifyContent: 'center' },
});
