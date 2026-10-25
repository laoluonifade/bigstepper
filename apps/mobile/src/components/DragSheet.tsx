import { BlurView } from 'expo-blur';
import { ReactNode, useEffect, useState } from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors } from '@/lib/theme';
import { haptic } from './ui';

const SNAP = { duration: 280, easing: Easing.out(Easing.cubic) };

/**
 * A sheet that sits over a map and can be dragged between two heights, like Maps or vaul on the web:
 * `header` always shows; `children` slides away under it when the sheet is dragged down. Snaps ease
 * into place without bouncing, with a selection tick, and the grabber toggles it for one-handed use.
 */
export function DragSheet({ header, children, initiallyOpen = true, open: openProp, onOpenChange, onVisibleHeight, style }: {
  header: ReactNode;
  children?: ReactNode;
  initiallyOpen?: boolean;
  /** Raise or lower it from outside (Start raising it, say); dragging still works and reports back. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** How much of the screen the sheet covers once it settles, so a map can keep its centre visible. */
  onVisibleHeight?: (height: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [sheetHeight, setSheetHeight] = useState(0);
  const [headerBottom, setHeaderBottom] = useState(0);
  // How far the sheet can drop: everything below the header.
  const travel = Math.max(0, sheetHeight - headerBottom);
  const offset = useSharedValue(0);
  const start = useSharedValue(0);
  const [open, setOpen] = useState(openProp ?? initiallyOpen);

  useEffect(() => {
    if (openProp === undefined || openProp === open || !sheetHeight) return;
    offset.value = withTiming(openProp ? 0 : travel, SNAP);
    settle(openProp);
    // Only a change from outside moves it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openProp]);

  useEffect(() => {
    if (!sheetHeight) return;
    offset.value = withTiming(open ? 0 : travel, SNAP);
    onVisibleHeight?.(open ? sheetHeight : sheetHeight - travel);
    // Re-measure only; `open` changes are animated by `settle`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetHeight, travel]);

  function settle(nextOpen: boolean) {
    if (nextOpen !== open) haptic('select');
    setOpen(nextOpen);
    if (nextOpen !== openProp) onOpenChange?.(nextOpen);
    onVisibleHeight?.(nextOpen ? sheetHeight : sheetHeight - travel);
  }

  function toggle() {
    offset.value = withTiming(open ? travel : 0, SNAP);
    settle(!open);
  }

  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onBegin(() => { start.value = offset.value; })
    .onUpdate((event) => {
      const next = start.value + event.translationY;
      // A little resistance past either end, rather than a hard stop.
      offset.value = next < 0 ? next / 4 : next > travel ? travel + (next - travel) / 4 : next;
    })
    .onEnd((event) => {
      const nextOpen = event.velocityY < -500 ? true : event.velocityY > 500 ? false : offset.value < travel / 2;
      offset.value = withTiming(nextOpen ? 0 : travel, SNAP);
      runOnJS(settle)(nextOpen);
    });

  const moved = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return <GestureDetector gesture={pan}>
    <Animated.View style={[styles.sheet, style, moved]} onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}>
      {Platform.OS === 'ios'
        ? <BlurView intensity={90} tint="systemChromeMaterialLight" style={StyleSheet.absoluteFill} />
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />}
      <Pressable onPress={toggle} hitSlop={12} style={styles.grabberHit} accessibilityRole="button" accessibilityLabel={open ? 'Show less' : 'Show more'}>
        <View style={styles.grabber} />
      </Pressable>
      <View onLayout={(event) => setHeaderBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}>{header}</View>
      {children}
    </Animated.View>
  </GestureDetector>;
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden',
    borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 12,
  },
  grabberHit: { alignSelf: 'center', paddingTop: 8, paddingBottom: 10, paddingHorizontal: 24 },
  grabber: { width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(60,60,67,0.3)' },
});
