import { formatDistance, formatDistanceNumber } from '@jump/shared/format';
import type { WeekDay } from '@jump/shared/progress';
import type { Unit } from '@jump/shared/types';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { colors, fontFamily } from '@/lib/theme';

const HEIGHT = 120;
const BAR_WIDTH = 22;

function Bar({ height, today, dim, delay }: { height: number; today: boolean; dim: boolean; delay: number }) {
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withDelay(delay, withTiming(height, { duration: 700, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }));
  }, [delay, grow, height]);
  const animated = useAnimatedStyle(() => ({ height: grow.value }));
  return <Animated.View style={[styles.bar, { backgroundColor: today ? colors.track : colors.ink, opacity: dim ? 0.4 : 1 }, animated]} />;
}

/**
 * Seven columns, Monday to Sunday, of verified distance. Today is the accented, labelled bar; tap a day
 * to read its distance.
 */
export function WeekChart({ days, unit }: { days: WeekDay[]; unit: Unit }) {
  const [picked, setPicked] = useState<number | null>(null);
  const max = Math.max(1000, ...days.map((day) => day.metres));
  const todayIndex = days.findIndex((day) => day.isToday);
  const focus = picked ?? (days[todayIndex]?.metres > 0 ? todayIndex : null);

  return <View style={{ height: HEIGHT + 24 }}>
    <View style={[styles.baseline, { top: HEIGHT }]} />
    <View style={styles.columns}>
      {days.map((day, index) => {
        const height = day.metres > 0 ? Math.max(4, Math.round((day.metres / max) * (HEIGHT - 26))) : 0;
        const active = focus === index;
        return <Pressable key={index} style={styles.column} onPress={() => setPicked(picked === index ? null : index)}
          accessibilityLabel={`${day.date.toLocaleDateString('en-GB', { weekday: 'long' })}: ${formatDistance(day.metres, unit)} verified`}>
          <View style={{ height: HEIGHT, width: '100%', alignItems: 'center', justifyContent: 'flex-end' }}>
            {active && day.metres > 0 && <Text style={[styles.value, { bottom: height + 6 }]}>{formatDistanceNumber(day.metres, unit)}</Text>}
            {height > 0 ? <Bar height={height} today={day.isToday} dim={picked !== null && !active} delay={index * 60} /> : !day.isFuture ? <View style={styles.dot} /> : null}
          </View>
          <Text style={[styles.label, day.isToday && { color: colors.ink, textDecorationLine: 'underline', textDecorationColor: colors.track }]}>{day.label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  baseline: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(18,18,18,0.15)' },
  columns: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row' },
  column: { flex: 1, alignItems: 'center' },
  bar: { width: BAR_WIDTH, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(18,18,18,0.25)', marginBottom: 3 },
  value: { position: 'absolute', fontFamily: fontFamily('bold'), fontSize: 12, color: colors.ink, fontVariant: ['tabular-nums'] },
  label: { marginTop: 6, fontFamily: fontFamily('bold'), fontSize: 11, textTransform: 'uppercase', color: colors.ink3 },
});
