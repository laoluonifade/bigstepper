import type { AvatarStyle } from '@jump/shared/types';
import { formatDistance } from '@jump/shared/format';
import { useQuery } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { JumpLogo } from '@/components/icons';
import { Avatar, Button, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { brand, colors, fontFamily, GUTTER, radius, wideLabel } from '@/lib/theme';

type Leader = { rank: number; userId: string; metres: number; displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle };

/** One line of the headline, rising into place a beat after the one above. */
function Line({ delay, children }: { delay: number; children: ReactNode }) {
  return <Animated.View entering={FadeInDown.delay(delay).duration(520).easing(Easing.out(Easing.cubic))}>{children}</Animated.View>;
}

/** "WIN" with the volt highlight sweeping in behind it, then the orange full stop popping on. */
function Win({ size }: { size: number }) {
  const sweep = useSharedValue(0);
  const dot = useSharedValue(0);
  useEffect(() => {
    sweep.value = withDelay(620, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    dot.value = withDelay(1100, withSpring(1, { damping: 9, stiffness: 220 }));
  }, [sweep, dot]);
  const [width, setWidth] = useState(0);
  const highlight = useAnimatedStyle(() => ({ width: sweep.value * width }));
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: dot.value }], opacity: dot.value > 0.05 ? 1 : 0 }));
  const type = { fontFamily: fontFamily('black', 'wide'), fontSize: size, lineHeight: size * 0.98, letterSpacing: -size * 0.04 };
  return <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ paddingHorizontal: size * 0.06 }}>
      <Animated.View style={[styles.highlight, { top: size * 0.14, bottom: size * 0.06 }, highlight]} />
      <Text style={[type, { color: brand.ink }]}>WIN</Text>
    </View>
    <Animated.Text style={[type, { color: brand.track }, pop]}>.</Animated.Text>
  </View>;
}

/** This week's top movers, drifting past as a strip of stickers: proof that people are out there now. */
function Movers({ leaders }: { leaders: Leader[] }) {
  const { width } = useWindowDimensions();
  const [strip, setStrip] = useState(0);
  const slide = useSharedValue(0);
  useEffect(() => {
    if (!strip) return;
    slide.value = 0;
    slide.value = withRepeat(withTiming(-strip, { duration: strip * 28, easing: Easing.linear }), -1, false);
  }, [strip, slide]);
  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: slide.value }] }));
  // Repeated until one copy is wider than the screen, so the loop never shows a gap.
  const filled = Array.from({ length: Math.max(1, Math.ceil(8 / leaders.length)) }, () => leaders).flat();
  const chips = (copy: number) => filled.map((row, index) => <View key={`${copy}-${index}-${row.userId}`} style={styles.chip}>
    <Avatar name={row.displayName} src={row.avatarUrl} avatarStyle={row.avatarStyle} size={26} round />
    <Txt size={13} weight="bold" numberOfLines={1} style={{ maxWidth: 120 }}>{row.displayName.split(' ')[0]}</Txt>
    <Txt size={13} weight="bold" num color="ink2">{formatDistance(row.metres, 'km')}</Txt>
  </View>);
  return <View style={{ marginHorizontal: -GUTTER, overflow: 'hidden', width }}>
    <Animated.View style={[{ flexDirection: 'row' }, moving]}>
      <View style={styles.chips} onLayout={(event) => setStrip(event.nativeEvent.layout.width)}>{chips(0)}</View>
      <View style={styles.chips}>{chips(1)}</View>
    </Animated.View>
  </View>;
}

/**
 * The app opens at `/`. Signed in, that's home. Signed out, it's the same promise as startajump.com:
 * MOVE. COMPETE. WIN., what Jump is in a sentence, this week's movers drifting past, and the way in.
 */
export default function Index() {
  const { status } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const leaders = useQuery({
    queryKey: ['leaderboard', 'foot', 'week', 'global', 10],
    queryFn: () => api<{ rows: Leader[] }>('/leaderboard?activity=foot&period=week&scope=global&limit=10'),
    enabled: status !== 'signed-in',
    staleTime: 60_000,
  });
  if (status === 'signed-in') return <Redirect href="/dashboard" />;
  // As big as the phone allows: "COMPETE." is the widest line, about 6.5 times the font size.
  const size = Math.min(84, (width - GUTTER * 2) / 6.2);
  const type = { fontFamily: fontFamily('black', 'wide'), fontSize: size, lineHeight: size * 0.98, letterSpacing: -size * 0.04, color: colors.ink };
  const movers = (leaders.data?.rows ?? []).filter((row) => row.metres > 0);

  return <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: insets.top }}>
    <View style={styles.bar}><JumpLogo height={24} /></View>
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: GUTTER }}>
      <Line delay={0}><Text style={type}>MOVE.</Text></Line>
      <Line delay={90}><Text style={type}>COMPETE.</Text></Line>
      <Line delay={180}><Win size={size} /></Line>
      <Animated.View entering={FadeInDown.delay(350).duration(520)}>
        <Txt size={17} leading={1.5} color="ink2" style={{ marginTop: 22 }}>Turn your everyday walks, runs and rides into a race. Compete with friends, clubs and your city, climb the leaderboard, and win real prizes.</Txt>
      </Animated.View>
      {movers.length ? <Animated.View entering={FadeInDown.delay(600).duration(520)} style={{ marginTop: 28 }}>
        <Text style={[wideLabel(11), { color: colors.ink3, marginBottom: 10 }]}>Moving this week</Text>
        <Movers leaders={movers} />
      </Animated.View> : null}
    </View>
    <Animated.View entering={FadeInDown.delay(480).duration(520)} style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <Button title="Get started, it’s free" full size="lg" onPress={() => router.push('/register')} />
      <Pressable onPress={() => router.push('/login')} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 6 }}>
        <Txt size={14} weight="semibold" color="ink2">I already have an account · <Txt size={14} weight="bold">Log in</Txt></Txt>
      </Pressable>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  bar: { height: 54, justifyContent: 'center', paddingHorizontal: GUTTER },
  highlight: { position: 'absolute', left: 0, backgroundColor: brand.volt },
  chips: { flexDirection: 'row', gap: 10, paddingLeft: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, paddingLeft: 4, paddingRight: 14, paddingVertical: 4 },
  actions: { gap: 12, paddingHorizontal: GUTTER, paddingTop: 12 },
});
