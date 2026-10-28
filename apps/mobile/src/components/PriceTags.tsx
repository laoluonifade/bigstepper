import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { brand, colors, fontFamily, radius, score } from '@/lib/theme';
import { haptic } from './ui';

export type EntryMode = 'free' | 'sponsored' | 'paid';

const TAGS: Array<{ value: EntryMode; word: string; line: string; bg: string; ink: string; tilt: number }> = [
  { value: 'free', word: 'FREE', line: 'No fee. Just run.', bg: brand.volt, ink: brand.ink, tilt: -5 },
  { value: 'sponsored', word: '₦ PRIZE', line: 'Free entry. You fund the cash.', bg: brand.track, ink: brand.ink, tilt: 4 },
  { value: 'paid', word: 'PAID', line: 'Entry fees make the pot.', bg: brand.ink, ink: brand.paper, tilt: -3 },
];

/** One price tag on a string: tilted and faded until it's picked, then it straightens and lifts. */
function PriceTag({ tag, active, onPress }: { tag: (typeof TAGS)[number]; active: boolean; onPress: () => void }) {
  const lift = useSharedValue(active ? 1 : 0);
  useEffect(() => { lift.value = withSpring(active ? 1 : 0, { damping: 13, stiffness: 180 }); }, [active, lift]);
  const swing = useAnimatedStyle(() => ({
    opacity: 0.5 + lift.value * 0.5,
    transform: [{ translateY: -6 * lift.value }, { rotate: `${tag.tilt * (1 - lift.value)}deg` }, { scale: 0.95 + lift.value * 0.07 }],
  }));
  const shadow = useAnimatedStyle(() => ({ opacity: lift.value }));
  return <Pressable onPress={onPress} style={{ flex: 1 }} accessibilityRole="radio" accessibilityState={{ checked: active }} accessibilityLabel={`${tag.word}: ${tag.line}`}>
    <Animated.View style={swing}>
      <Svg width="100%" height={18} viewBox="0 0 100 18" preserveAspectRatio="none" style={{ marginBottom: -4 }}>
        <Path d="M50 18 C 46 10, 54 6, 50 0" stroke={colors.ink3} strokeWidth={1.5} fill="none" />
      </Svg>
      <View>
        <Animated.View style={[styles.shadow, shadow]} />
        <View style={[styles.tag, { backgroundColor: tag.bg }]}>
          <View style={styles.hole} />
          <Text style={[score(22), { color: tag.ink, marginTop: 10 }]} numberOfLines={1} adjustsFontSizeToFit>{tag.word}</Text>
          <Text style={[styles.line, { color: tag.ink }]} numberOfLines={2}>{tag.line}</Text>
        </View>
      </View>
    </Animated.View>
  </Pressable>;
}

/** Free, funded or paid entry, as three price tags hanging in a row. */
export function PriceTags({ value, onChange }: { value: EntryMode; onChange: (mode: EntryMode) => void }) {
  return <View style={{ flexDirection: 'row', gap: 10, paddingTop: 2 }} accessibilityRole="radiogroup" accessibilityLabel="Entry">
    {TAGS.map((tag) => <PriceTag key={tag.value} tag={tag} active={value === tag.value} onPress={() => { haptic('select'); onChange(tag.value); }} />)}
  </View>;
}

const styles = StyleSheet.create({
  tag: { alignItems: 'center', minHeight: 108, borderRadius: radius.xl, borderWidth: 2, borderColor: brand.ink, paddingHorizontal: 8, paddingTop: 10, paddingBottom: 12 },
  shadow: { position: 'absolute', left: 4, top: 4, right: -4, bottom: -4, borderRadius: radius.xl, backgroundColor: colors.shadow },
  hole: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: brand.ink, backgroundColor: colors.paper },
  line: { fontFamily: fontFamily('semibold'), fontSize: 11.5, lineHeight: 14, textAlign: 'center', marginTop: 4 },
});
