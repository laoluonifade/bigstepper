import type { Club } from '@jump/shared/types';
import { Image } from 'expo-image';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import { colors, fontFamily, radius } from '@/lib/theme';

/** A club's picture everywhere it shows: its logo, or its first letters on an ink tile. */
export function ClubLogo({ club, size = 44, style }: { club: Pick<Club, 'name' | 'logoUrl'>; size?: number; style?: StyleProp<ViewStyle> }) {
  if (club.logoUrl) return <Image source={{ uri: club.logoUrl }} style={[{ width: size, height: size, borderRadius: radius.xl, backgroundColor: colors.white }, style as object]} contentFit="cover" />;
  return <View style={[{ width: size, height: size, borderRadius: radius.xl, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }, style]} accessibilityElementsHidden>
    <Text style={{ fontFamily: fontFamily('black', 'wide'), fontSize: Math.max(15, size * 0.38), color: colors.volt }}>{club.name.trim().slice(0, 2).toUpperCase() || 'J'}</Text>
  </View>;
}
