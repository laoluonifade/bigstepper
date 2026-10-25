import type { Club } from '@jump/shared/types';
import { Image } from 'expo-image';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import { brand, colors, fontFamily, radius, scheme } from '@/lib/theme';

/**
 * A club's picture everywhere it shows: its logo, or its first letters in volt on an ink tile. The tile
 * stays dark in both themes (theme ink turns cream in dark mode, where volt can't be read), with a
 * hairline edge so it doesn't melt into a dark page.
 */
export function ClubLogo({ club, size = 44, style }: { club: Pick<Club, 'name' | 'logoUrl'>; size?: number; style?: StyleProp<ViewStyle> }) {
  if (club.logoUrl) return <Image source={{ uri: club.logoUrl }} style={[{ width: size, height: size, borderRadius: radius.xl, backgroundColor: colors.white }, style as object]} contentFit="cover" />;
  return <View style={[{ width: size, height: size, borderRadius: radius.xl, backgroundColor: brand.ink, alignItems: 'center', justifyContent: 'center' }, scheme === 'dark' && { borderWidth: 1, borderColor: colors.line }, style]} accessibilityElementsHidden>
    <Text style={{ fontFamily: fontFamily('black', 'wide'), fontSize: Math.max(15, size * 0.38), color: brand.volt }}>{club.name.trim().slice(0, 2).toUpperCase() || 'J'}</Text>
  </View>;
}
