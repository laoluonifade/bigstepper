import { ComponentRef, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily } from '@/lib/theme';
import { haptic, Txt } from './ui';

export type MenuAction = { label: string; run: () => void; danger?: boolean };

const WIDTH = 240;
const ROW = 48;

/**
 * A row's actions behind a "⋯" button, as Jump's own menu: it pops from the button (below it, or above
 * when there's no room), the same on iOS and Android, with destructive actions in red.
 */
export function ActionMenu({ label, actions, title, trigger }: { label: string; actions: MenuAction[]; title?: string; trigger?: React.ReactNode }) {
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const [frame, setFrame] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  function show() {
    haptic();
    anchor.current?.measureInWindow((x, y, width, height) => setFrame({ x, y, width, height }));
  }
  const close = () => setFrame(null);

  const menuHeight = actions.length * ROW + (title ? 38 : 0) + 8;
  const below = frame ? frame.y + frame.height + 8 + menuHeight <= screenHeight - insets.bottom - 8 : true;
  const top = frame ? (below ? frame.y + frame.height + 8 : Math.max(insets.top + 8, frame.y - 8 - menuHeight)) : 0;
  // Right-aligned with the button, kept on screen.
  const left = frame ? Math.min(Math.max(12, frame.x + frame.width - WIDTH), screenWidth - WIDTH - 12) : 0;

  return <>
    <Pressable onPress={show} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}>
      <View ref={anchor} collapsable={false}>
        {trigger ?? <View style={styles.dots}><Text style={styles.dotsText}>⋯</Text></View>}
      </View>
    </Pressable>
    <Modal visible={frame !== null} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close menu">
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: 0.35 }]} />
      </Pressable>
      {frame && <Animated.View entering={ZoomIn.duration(170).easing(Easing.out(Easing.cubic))} exiting={FadeOut.duration(110)}
        style={[styles.menu, { top, left, transformOrigin: below ? 'top right' : 'bottom right' }]} accessibilityRole="menu">
        {title ? <Txt size={12} weight="semibold" color="ink3" numberOfLines={1} style={styles.title}>{title}</Txt> : null}
        {actions.map((action, index) => <Pressable key={action.label} accessibilityRole="menuitem"
          // Run once the menu has gone: an action that opens its own sheet (a confirm) can't present
          // while this modal is still closing on iOS.
          onPress={() => { haptic('select'); close(); setTimeout(action.run, 220); }}
          style={({ pressed }) => [styles.item, (index > 0 || title) && styles.divider, pressed && { backgroundColor: colors.inkWash }]}>
          <Txt size={16} weight="semibold" color={action.danger ? 'bad' : 'ink'}>{action.label}</Txt>
        </Pressable>)}
      </Animated.View>}
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  dots: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dotsText: { fontFamily: fontFamily('bold'), fontSize: 18, lineHeight: 20, color: colors.ink2 },
  menu: {
    position: 'absolute', width: WIDTH, borderRadius: 16, backgroundColor: colors.white, paddingVertical: 4, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  title: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  item: { height: ROW, justifyContent: 'center', paddingHorizontal: 16 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
