import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, GUTTER, radius } from '@/lib/theme';
import { dismissToast, useToasts, type ToastTone } from '@/lib/toast';
import { AlertIcon, CheckIcon, InfoIcon } from './icons';
import { HardShadow } from './ui';

const ACCENT: Record<ToastTone, string> = { bad: colors.bad, warn: colors.warn, ok: colors.ok, info: colors.ink };

/** Toasts drop in under the status bar; tap one to dismiss it. */
export function Toaster() {
  const toasts = useToasts();
  const insets = useSafeAreaInsets();
  if (toasts.length === 0) return null;
  return <View pointerEvents="box-none" style={[styles.stack, { top: insets.top + 8 }]}>
    {toasts.map((item) => <Animated.View key={item.id} entering={FadeInUp.duration(260)} exiting={FadeOutUp.duration(200)} layout={LinearTransition}>
      <HardShadow radius={radius.md}>
        <Pressable onPress={() => dismissToast(item.id)} accessibilityRole="alert" style={[styles.toast, { borderLeftColor: ACCENT[item.tone] }]}>
          <View style={{ marginTop: 1 }}>{item.tone === 'ok' ? <CheckIcon size={18} color={ACCENT.ok} /> : item.tone === 'info' ? <InfoIcon size={18} /> : <AlertIcon size={18} color={ACCENT[item.tone]} />}</View>
          <View style={{ flex: 1, minWidth: 0 }}>
            {item.title ? <Text style={styles.title}>{item.title}</Text> : null}
            <Text style={styles.message}>{item.message}</Text>
          </View>
          {item.action ? <Pressable hitSlop={8} onPress={() => { item.action?.run(); dismissToast(item.id); }} accessibilityRole="button">
            <Text style={styles.action}>{item.action.label.toUpperCase()}</Text>
          </Pressable> : null}
        </Pressable>
      </HardShadow>
    </Animated.View>)}
  </View>;
}

const styles = StyleSheet.create({
  stack: { position: 'absolute', left: GUTTER, right: GUTTER, gap: 8, zIndex: 100 },
  toast: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: radius.md, borderWidth: 2, borderLeftWidth: 5, borderColor: colors.ink, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 12 },
  title: { fontFamily: fontFamily('bold'), fontSize: 14, lineHeight: 19, color: colors.ink },
  message: { fontFamily: fontFamily('regular'), fontSize: 14, lineHeight: 19, color: colors.ink2 },
  action: { fontFamily: fontFamily('extrabold', 'wide'), fontSize: 11, letterSpacing: 0.6, color: colors.ink, textDecorationLine: 'underline', paddingTop: 2 },
});
