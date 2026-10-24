import { ReactNode, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, GUTTER, radius, wideLabel } from '@/lib/theme';
import { ChevronRightIcon, CloseIcon } from './icons';
import { haptic, Txt } from './ui';

const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

/**
 * A bottom sheet you can drag down to close: the phone version of the web's vaul Sheet. For settings that
 * would otherwise make a form scroll on and on: the form keeps a one-line summary, the detail lives here.
 * The footer stays pinned above the keyboard and the home indicator.
 */
export function Sheet({ open, onOpenChange, title, description, children, footer, scroll = true }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** False when the content brings its own list (a FlatList) and must not sit in a ScrollView. */
  scroll?: boolean;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(open);
  const offset = useSharedValue(height);

  useEffect(() => {
    if (open) {
      setMounted(true);
      offset.value = height;
      offset.value = withTiming(0, { duration: 320, easing: EASE });
    } else if (mounted) {
      offset.value = withTiming(height, { duration: 240, easing: EASE }, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
    // Only open/close drive the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => onOpenChange(false);
  const drag = Gesture.Pan()
    .activeOffsetY(8)
    .onChange((event) => {
      offset.value = Math.max(0, offset.value + event.changeY);
    })
    .onEnd((event) => {
      if (offset.value > 120 || event.velocityY > 900) runOnJS(close)();
      else offset.value = withTiming(0, { duration: 200, easing: EASE });
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, offset.value / height) }));

  if (!mounted) return null;
  return <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }, scrimStyle]}>
        <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.anchor} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, { maxHeight: height * 0.92 - insets.top }, sheetStyle]} accessibilityViewIsModal>
          <GestureDetector gesture={drag}>
            <View>
              <View style={styles.handle} />
              <View style={styles.header}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={wideLabel(17, 0)} accessibilityRole="header">{title}</Text>
                  {description ? typeof description === 'string' ? <Txt size={13} color="ink2" leading={1.35} style={{ marginTop: 2 }}>{description}</Txt> : description : null}
                </View>
                <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => [styles.close, pressed && { backgroundColor: colors.inkWash }]}>
                  <CloseIcon size={18} color={colors.ink2} />
                </Pressable>
              </View>
            </View>
          </GestureDetector>
          {scroll
            ? <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: GUTTER + 4, paddingBottom: footer ? 20 : Math.max(insets.bottom, 20) }} keyboardShouldPersistTaps="handled" bounces={false}>{children}</ScrollView>
            : <View style={{ flexShrink: 1, paddingBottom: footer ? 0 : insets.bottom }}>{children}</View>}
          {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  </Modal>;
}

/** One line in a form that opens a sheet: what it is, what's set now, and any problem to fix. */
export function SheetRow({ title, summary, onOpen, error, tone = 'default' }: { title: string; summary: ReactNode; onOpen: () => void; error?: string; tone?: 'default' | 'on' }) {
  return <Pressable onPress={() => { haptic(); onOpen(); }} accessibilityRole="button" accessibilityLabel={title}
    style={({ pressed }) => [styles.row, error ? { borderColor: colors.bad, backgroundColor: 'rgba(250,220,216,0.4)' } : tone === 'on' ? { backgroundColor: 'rgba(228,255,58,0.4)' } : { backgroundColor: colors.card }, pressed && { opacity: 0.75 }]}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={wideLabel(13, 0)}>{title}</Text>
      {typeof summary === 'string' ? <Txt size={13.5} color="ink2" leading={1.35} style={{ marginTop: 2 }}>{summary}</Txt> : summary}
      {error ? <Text style={{ marginTop: 4, fontFamily: fontFamily('semibold'), fontSize: 12.5, color: colors.bad }}>{error}</Text> : null}
    </View>
    <ChevronRightIcon size={18} color={colors.ink3} />
  </Pressable>;
}

/** A sheet of options to pick one from: the phone's version of the web's Dropdown and <select>. */
export function OptionSheet<T extends string>({ open, onOpenChange, title, description, options, value, onChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  options: Array<{ value: T; label: string; detail?: string; disabled?: boolean; icon?: ReactNode }>;
  value: T | null;
  onChange: (value: T) => void;
}) {
  return <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
    <View style={{ gap: 8 }}>
      {options.map((option) => {
        const active = option.value === value;
        return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: active, disabled: option.disabled }} disabled={option.disabled}
          onPress={() => { haptic(); onChange(option.value); onOpenChange(false); }}
          style={({ pressed }) => [styles.option, active && { borderColor: colors.ink, backgroundColor: 'rgba(228,255,58,0.4)' }, option.disabled && { opacity: 0.45 }, pressed && { opacity: 0.7 }]}>
          {option.icon}
          <View style={{ flex: 1 }}>
            <Txt size={15} weight="bold">{option.label}</Txt>
            {option.detail ? <Txt size={13} color="ink2" leading={1.35} style={{ marginTop: 2 }}>{option.detail}</Txt> : null}
          </View>
          <View style={[styles.radio, active && { borderColor: colors.ink, backgroundColor: colors.ink }]}>{active ? <View style={styles.radioDot} /> : null}</View>
        </Pressable>;
      })}
    </View>
  </Sheet>;
}

const styles = StyleSheet.create({
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderTopWidth: 2, borderColor: colors.ink, overflow: 'hidden' },
  handle: { alignSelf: 'center', width: 44, height: 6, borderRadius: 3, backgroundColor: 'rgba(18,18,18,0.15)', marginTop: 10, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: GUTTER + 4, paddingTop: 8, paddingBottom: 12 },
  close: { padding: 6, marginRight: -6, borderRadius: radius.md },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.card, paddingHorizontal: GUTTER + 4, paddingTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.ink, padding: 16 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, padding: 14 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.ink3, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.paper },
});
