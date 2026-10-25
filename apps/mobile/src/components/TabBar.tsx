import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { usePathname } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { BlurView } from 'expo-blur';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useRecorder } from '@/lib/recorder';
import { colors, fontFamily } from '@/lib/theme';
import { FeedIcon, HomeIcon, PlayIcon, RunIcon, TableIcon, UserIcon } from './icons';
import { haptic, HardShadow } from './ui';

/** The run screen listens for the centre button's Start, the way the web's run page does. */
const startListeners = new Set<() => void>();
export function onStartPressed(listener: () => void) {
  startListeners.add(listener);
  return () => void startListeners.delete(listener);
}

const TABS: Record<string, { label: string; icon: (color: string) => ReactNode }> = {
  dashboard: { label: 'Home', icon: (color) => <HomeIcon color={color} /> },
  competitions: { label: 'Compete', icon: (color) => <TableIcon color={color} /> },
  feed: { label: 'Rant', icon: (color) => <FeedIcon color={color} /> },
  you: { label: 'You', icon: (color) => <UserIcon color={color} /> },
};

const EASE = { duration: 240, easing: Easing.out(Easing.cubic) };

function Tab({ label, icon, active, onPress }: { label: string; icon: (color: string) => ReactNode; active: boolean; onPress: () => void }) {
  // 0 → 1 as the tab becomes active: eased, no overshoot.
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => { on.value = withTiming(active ? 1 : 0, EASE); }, [active, on]);
  const bar = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scaleX: 0.3 + 0.7 * on.value }] }));
  const pill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], ['rgba(18,18,18,0)', colors.ink]),
    transform: [{ scale: 0.86 + 0.14 * on.value }],
  }));
  const lit = useAnimatedStyle(() => ({ opacity: on.value }));
  const dim = useAnimatedStyle(() => ({ opacity: 1 - on.value }));
  const text = useAnimatedStyle(() => ({ color: interpolateColor(on.value, [0, 1], [colors.ink3, colors.ink]) }));
  return <Pressable onPress={onPress} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={label}>
    {/* Orange bar along the top edge of the active tab. */}
    <Animated.View style={[styles.activeBar, bar]} />
    <Animated.View style={[styles.iconPill, pill]}>
      {/* The two icon colours cross-fade rather than snap. */}
      <Animated.View style={[styles.icon, dim]}>{icon(colors.ink3)}</Animated.View>
      <Animated.View style={[styles.icon, lit]}>{icon(colors.volt)}</Animated.View>
    </Animated.View>
    <Animated.Text style={[styles.label, { fontFamily: fontFamily(active ? 'black' : 'semibold') }, text]}>{label}</Animated.Text>
  </Pressable>;
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

  return <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]} accessibilityRole="tablist">
    {/* No rule across the top: the bar lifts off the page with a soft shadow, frosted on iOS. */}
    {Platform.OS === 'ios' ? <BlurView intensity={80} tint="systemChromeMaterialLight" style={styles.glass} /> : null}
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
                {start ? (locating ? <ActivityIndicator color={colors.ink} /> : <PlayIcon size={24} />) : <RunIcon size={22} />}
              </View>
            </HardShadow>
            <Text style={[styles.label, { color: colors.ink, fontFamily: fontFamily(start ? 'extrabold' : 'bold') }]}>{start ? (locating ? 'GPS…' : 'Start') : 'Run'}</Text>
          </>}
        </Pressable>;
      }
      const tab = TABS[route.name];
      return tab ? <Tab key={route.key} label={tab.label} icon={tab.icon} active={active} onPress={go} /> : null;
    })}
  </View>;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingTop: 6,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(242,239,232,0.72)' : colors.paper,
    shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: -4 }, elevation: 16,
  },
  glass: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingTop: 6, paddingBottom: 4 },
  activeBar: { position: 'absolute', top: -6, width: 32, height: 3, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: colors.track },
  iconPill: { width: 48, height: 32, borderRadius: 8 },
  icon: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  raised: { marginTop: -26, marginBottom: 2 },
  runButton: { width: 56, height: 56, borderRadius: 8, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.track, alignItems: 'center', justifyContent: 'center' },
});
