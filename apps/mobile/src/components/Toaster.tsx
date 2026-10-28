import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { FullWindowOverlay } from 'react-native-screens';
import Animated, { FadeInUp, FadeOutUp, LinearTransition, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, GUTTER, radius } from '@/lib/theme';
import { dismissToast, useToasts, type Toast, type ToastTone } from '@/lib/toast';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './icons';
import { HardShadow } from './ui';

const ACCENT: Record<ToastTone, string> = { bad: colors.bad, warn: colors.warn, ok: colors.ok, info: colors.ink };

/**
 * Toasts drop in under the status bar. Close one with its ×, or swipe it away sideways or up. On iPhone
 * they sit in a window above everything, sheets and modal screens included; Android sheets show their own.
 */
export function Toaster() {
  const toasts = useToasts();
  const insets = useSafeAreaInsets();
  if (toasts.length === 0) return null;
  const stack = <View pointerEvents="box-none" style={[styles.stack, { top: insets.top + 8 }]}>
    {toasts.map((item) => <Animated.View key={item.id} entering={FadeInUp.duration(260)} exiting={FadeOutUp.duration(200)} layout={LinearTransition}>
      <ToastCard item={item} />
    </Animated.View>)}
  </View>;
  if (Platform.OS !== 'ios') return stack;
  return <FullWindowOverlay>
    <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents="box-none">{stack}</GestureHandlerRootView>
  </FullWindowOverlay>;
}

function ToastCard({ item }: { item: Toast }) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const close = () => dismissToast(item.id);
  const swipe = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .activeOffsetY(-12)
    .onChange((event) => { x.value += event.changeX; y.value = Math.min(0, y.value + event.changeY); })
    .onEnd((event) => {
      const sideways = Math.abs(x.value) > 90 || Math.abs(event.velocityX) > 800;
      const upward = y.value < -30 || event.velocityY < -600;
      if (sideways || upward) {
        if (sideways) x.value = withTiming(Math.sign(x.value || event.velocityX) * 500, { duration: 160 }, () => runOnJS(close)());
        else y.value = withTiming(-200, { duration: 160 }, () => runOnJS(close)());
      } else {
        x.value = withTiming(0, { duration: 160 });
        y.value = withTiming(0, { duration: 160 });
      }
    });
  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }], opacity: 1 - Math.min(0.6, Math.abs(x.value) / 300) }));
  return <GestureDetector gesture={swipe}>
    <Animated.View style={moving}>
      <HardShadow radius={radius.md}>
        <View accessibilityRole="alert" style={[styles.toast, { borderLeftColor: ACCENT[item.tone] }]}>
          <View style={{ marginTop: 1 }}>{item.tone === 'ok' ? <CheckIcon size={18} color={ACCENT.ok} /> : item.tone === 'info' ? <InfoIcon size={18} /> : <AlertIcon size={18} color={ACCENT[item.tone]} />}</View>
          <View style={{ flex: 1, minWidth: 0 }}>
            {item.title ? <Text style={styles.title}>{item.title}</Text> : null}
            <Text style={styles.message}>{item.message}</Text>
            {item.action ? <Pressable hitSlop={8} onPress={() => { item.action?.run(); close(); }} accessibilityRole="button" style={{ marginTop: 6, alignSelf: 'flex-start' }}>
              <Text style={styles.action}>{item.action.label.toUpperCase()}</Text>
            </Pressable> : null}
          </View>
          <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => [styles.close, pressed && { backgroundColor: colors.inkWash }]}>
            <CloseIcon size={16} color={colors.ink3} />
          </Pressable>
        </View>
      </HardShadow>
    </Animated.View>
  </GestureDetector>;
}

const styles = StyleSheet.create({
  stack: { position: 'absolute', left: GUTTER, right: GUTTER, gap: 8, zIndex: 100 },
  toast: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: radius.md, borderWidth: 2, borderLeftWidth: 5, borderColor: colors.edge, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 12 },
  title: { fontFamily: fontFamily('bold'), fontSize: 14, lineHeight: 19, color: colors.ink },
  message: { fontFamily: fontFamily('regular'), fontSize: 14, lineHeight: 19, color: colors.ink2 },
  close: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: -3, marginRight: -6 },
  action: { fontFamily: fontFamily('extrabold', 'wide'), fontSize: 11, letterSpacing: 0.6, color: colors.ink, textDecorationLine: 'underline', paddingTop: 2 },
});
