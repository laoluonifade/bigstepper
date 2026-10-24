import { useState } from 'react';
import { ActionSheetIOS, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, radius } from '@/lib/theme';
import { Sheet } from './Sheet';
import { haptic, Txt } from './ui';

export type MenuAction = { label: string; run: () => void; danger?: boolean };

/**
 * A row's actions behind a "⋯" button: the system action sheet on iOS, a bottom sheet on Android
 * (which has no equivalent), with destructive actions in red on both.
 */
export function ActionMenu({ label, actions, title, trigger }: { label: string; actions: MenuAction[]; title?: string; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  function show() {
    haptic();
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({
        title,
        options: [...actions.map((action) => action.label), 'Cancel'],
        cancelButtonIndex: actions.length,
        destructiveButtonIndex: actions.map((action, index) => (action.danger ? index : -1)).filter((index) => index >= 0),
        tintColor: colors.ink,
      }, (index) => actions[index]?.run());
    } else setOpen(true);
  }
  return <>
    <Pressable onPress={show} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}>
      {trigger ?? <View style={styles.dots}><Text style={styles.dotsText}>⋯</Text></View>}
    </Pressable>
    {Platform.OS !== 'ios' && <Sheet open={open} onOpenChange={setOpen} title={title ?? label}>
      <View style={{ gap: 4 }}>
        {actions.map((action) => <Pressable key={action.label} onPress={() => { setOpen(false); action.run(); }} style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.inkWash }]}>
          <Txt size={16} weight="semibold" color={action.danger ? 'bad' : 'ink'}>{action.label}</Txt>
        </Pressable>)}
      </View>
    </Sheet>}
  </>;
}

const styles = StyleSheet.create({
  dots: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dotsText: { fontFamily: fontFamily('bold'), fontSize: 18, lineHeight: 20, color: colors.ink2 },
  item: { borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 14 },
});
