import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, scheme } from '@/lib/theme';

/** Decided once: whether this phone draws Apple's Liquid Glass (iOS 26, built with its SDK). */
export const LIQUID_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * A glass surface. On iOS 26 it's Apple's Liquid Glass, optionally tinted and reacting to touch; on
 * older iPhones it's a frosted blur with the tint washed over it; on Android a solid surface in the tint.
 */
export function Glass({ children, style, tint, interactive = false, solid }: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Colours the glass (a picked option, say). */
  tint?: string;
  interactive?: boolean;
  /** Fill for phones without glass; defaults to the tint, then the card colour. */
  solid?: string;
}) {
  if (LIQUID_GLASS) {
    // Follows the app's theme, not the phone's: Jump in light mode on a phone in dark mode would
    // otherwise get dark glass under dark text.
    return <GlassView style={[{ overflow: 'hidden' }, style]} glassEffectStyle="regular" colorScheme={scheme} tintColor={tint} isInteractive={interactive}>{children}</GlassView>;
  }
  if (Platform.OS === 'ios') {
    return <View style={[{ overflow: 'hidden' }, style]}>
      <BlurView intensity={80} tint={scheme === 'dark' ? 'systemThickMaterialDark' : 'systemThickMaterialLight'} style={StyleSheet.absoluteFill} />
      {tint ? <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.85 }]} /> : null}
      {children}
    </View>;
  }
  return <View style={[{ overflow: 'hidden', backgroundColor: solid ?? tint ?? colors.card }, style]}>{children}</View>;
}
