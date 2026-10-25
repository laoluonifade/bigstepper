import { createContext, useContext } from 'react';
import { colors, type Color } from './theme';

/**
 * Set inside a volt or orange surface. There, text and icons that would draw in ink (or its greys) draw
 * in `onAccent` instead, which stays dark in both themes; in dark mode plain ink is cream, which
 * vanishes on volt.
 */
export const AccentSurface = createContext(false);

/** The colour key a piece of text should really use, given where it sits. */
export function useTextColor(color: Color | undefined): Color {
  const onAccent = useContext(AccentSurface);
  const wanted = color ?? 'ink';
  return onAccent && (wanted === 'ink' || wanted === 'ink2' || wanted === 'ink3') ? 'onAccent' : wanted;
}

/** The same for an icon's colour value (icons default to ink). */
export function useIconColor(color: string | undefined): string {
  const onAccent = useContext(AccentSurface);
  if (color && color !== colors.ink) return color;
  return onAccent ? colors.onAccent : colors.ink;
}
