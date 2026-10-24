import type { TextStyle } from 'react-native';

/** Same palette as apps/web/tailwind.config.ts. */
export const colors = {
  paper: '#F2EFE8',
  card: '#FBFAF6',
  white: '#FFFFFF',
  ink: '#121212',
  ink2: '#55524B',
  ink3: '#8A857B',
  line: '#DCD7CC',
  track: '#FF4D12',
  trackDeep: '#C23500',
  trackWash: '#FFE4D8',
  volt: '#E4FF3A',
  ok: '#12805C',
  okWash: '#DDF1E8',
  warn: '#9A6200',
  warnWash: '#FBEBC8',
  bad: '#C2261B',
  badWash: '#FADCD8',
  gold: '#E3B23C',
  silver: '#B4B6B1',
  bronze: '#C77B3B',
  verified: '#1D9BF0',
  /** Ink at low opacity, for pressed rows and hairline fills. */
  inkWash: 'rgba(18,18,18,0.06)',
  inkFaint: 'rgba(18,18,18,0.10)',
  scrim: 'rgba(18,18,18,0.5)',
} as const;

export type Color = keyof typeof colors;

export const radius = { sm: 2, base: 4, md: 6, lg: 8, xl: 12, '2xl': 16, sheet: 22, full: 999 } as const;

/** The 16px gutter every screen shares. */
export const GUTTER = 16;

export type Weight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold' | 'black';
/** Archivo's width axis: `wide` is the web's `font-stretch: 125%`, `narrow` its 72% (scores). */
export type Width = 'normal' | 'wide' | 'narrow';

/**
 * The bundled static cuts of Archivo (React Native can't set a variable font's width axis). Widths that
 * weren't cut fall back to the nearest weight that was.
 */
export const FONT_FILES = {
  'Archivo-Regular': require('../../assets/fonts/Archivo-Regular.ttf'),
  'Archivo-Medium': require('../../assets/fonts/Archivo-Medium.ttf'),
  'Archivo-SemiBold': require('../../assets/fonts/Archivo-SemiBold.ttf'),
  'Archivo-Bold': require('../../assets/fonts/Archivo-Bold.ttf'),
  'Archivo-ExtraBold': require('../../assets/fonts/Archivo-ExtraBold.ttf'),
  'Archivo-Black': require('../../assets/fonts/Archivo-Black.ttf'),
  'ArchivoWide-SemiBold': require('../../assets/fonts/ArchivoWide-SemiBold.ttf'),
  'ArchivoWide-Bold': require('../../assets/fonts/ArchivoWide-Bold.ttf'),
  'ArchivoWide-ExtraBold': require('../../assets/fonts/ArchivoWide-ExtraBold.ttf'),
  'ArchivoWide-Black': require('../../assets/fonts/ArchivoWide-Black.ttf'),
  'ArchivoNarrow-Bold': require('../../assets/fonts/ArchivoNarrow-Bold.ttf'),
  'ArchivoNarrow-ExtraBold': require('../../assets/fonts/ArchivoNarrow-ExtraBold.ttf'),
  'JetBrainsMono-Regular': require('../../assets/fonts/JetBrainsMono-Regular.ttf'),
  'JetBrainsMono-SemiBold': require('../../assets/fonts/JetBrainsMono-SemiBold.ttf'),
};

const CUT: Record<Weight, string> = { regular: 'Regular', medium: 'Medium', semibold: 'SemiBold', bold: 'Bold', extrabold: 'ExtraBold', black: 'Black' };

export function fontFamily(weight: Weight = 'regular', width: Width = 'normal'): string {
  if (width === 'wide') return `ArchivoWide-${CUT[weight === 'regular' || weight === 'medium' ? 'semibold' : weight]}`;
  if (width === 'narrow') return `ArchivoNarrow-${weight === 'extrabold' || weight === 'black' ? 'ExtraBold' : 'Bold'}`;
  return `Archivo-${CUT[weight]}`;
}

export const mono = 'JetBrainsMono-Regular';

/** The web's `.display`: wide, extra bold, upper case, tight. */
export function display(size: number): TextStyle {
  return { fontFamily: fontFamily('extrabold', 'wide'), fontSize: size, lineHeight: Math.round(size * 1.02), letterSpacing: -0.01 * size, textTransform: 'uppercase', color: colors.ink };
}

/** The web's `.score`: narrow, extra bold, for big numbers. */
export function score(size: number): TextStyle {
  return { fontFamily: fontFamily('extrabold', 'narrow'), fontSize: size, lineHeight: Math.round(size * 1.08), letterSpacing: -0.02 * size, color: colors.ink, fontVariant: ['tabular-nums'] };
}

/** The web's `.eyebrow`: the small label above a title or a stat. */
export const eyebrow: TextStyle = { fontFamily: fontFamily('semibold'), fontSize: 11, lineHeight: 14, letterSpacing: 1.54, textTransform: 'uppercase', color: colors.ink2 };

/** Wide upper-case labels: section titles, buttons, tabs. */
export function wideLabel(size: number, tracking = 0.08): TextStyle {
  return { fontFamily: fontFamily('extrabold', 'wide'), fontSize: size, letterSpacing: tracking * size, textTransform: 'uppercase', color: colors.ink };
}
