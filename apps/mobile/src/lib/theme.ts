import { reloadAppAsync } from 'expo';
import { Appearance, DevSettings, type TextStyle } from 'react-native';
import { Storage } from './kv';

/** Same palette as apps/web/tailwind.config.ts. */
const LIGHT = {
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
  /** Text and icons on volt or orange: always dark, whatever the theme. */
  onAccent: '#121212',
  /** Secondary text and faint fills on an `ink` surface (a selected card, the podium). */
  onInkMuted: 'rgba(242,239,232,0.68)',
  onInkWash: 'rgba(242,239,232,0.12)',
  /** Ink at low opacity, for pressed rows and hairline fills. */
  inkWash: 'rgba(18,18,18,0.06)',
  inkFaint: 'rgba(18,18,18,0.10)',
  scrim: 'rgba(18,18,18,0.5)',
  /** Strong outlines (cards, buttons, tags) and the hard offset shadow under them. */
  edge: '#121212',
  shadow: '#121212',
};

export type Palette = typeof LIGHT;
export type Color = keyof Palette;

/**
 * Dark mode: the same roles, flipped. `paper` (the page) goes near-black and `ink` (text, strong
 * surfaces) goes cream, so every screen that speaks in roles comes out right. Orange and volt stay.
 */
const DARK: Palette = {
  paper: '#0E0E0F',
  card: '#1A1A1C',
  white: '#242426',
  ink: '#F2EFE8',
  ink2: '#B9B4AA',
  ink3: '#86817A',
  line: '#2C2C2F',
  track: '#FF5A1F',
  trackDeep: '#FF8A5C',
  trackWash: 'rgba(255,90,31,0.18)',
  volt: '#E4FF3A',
  ok: '#3DD68C',
  okWash: 'rgba(61,214,140,0.16)',
  warn: '#F5B83D',
  warnWash: 'rgba(245,184,61,0.16)',
  bad: '#FF6B5E',
  badWash: 'rgba(255,107,94,0.16)',
  gold: '#E3B23C',
  silver: '#B4B6B1',
  bronze: '#C77B3B',
  verified: '#1D9BF0',
  onAccent: '#121212',
  onInkMuted: 'rgba(18,18,18,0.62)',
  onInkWash: 'rgba(18,18,18,0.1)',
  inkWash: 'rgba(242,239,232,0.07)',
  inkFaint: 'rgba(242,239,232,0.12)',
  scrim: 'rgba(0,0,0,0.6)',
  // A cream outline and a cream offset shadow read as a glaring second layer on a dark page, so dark
  // mode keeps the shapes but draws them quietly.
  edge: 'rgba(242,239,232,0.2)',
  shadow: '#2A2A2E',
};

export type ThemePreference = 'system' | 'light' | 'dark';
const THEME_KEY = 'jump_theme';

function readPreference(): ThemePreference {
  try {
    const stored = Storage.getItemSync(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** What the runner picked in Settings: follow the phone, or always light or dark. */
export const themePreference = readPreference();

// An override set earlier survives a JS restart on Android; following the phone again means clearing it
// before reading the phone's scheme.
if (themePreference === 'system') {
  try { Appearance.setColorScheme('unspecified'); } catch { /* nothing was overridden */ }
}
/** The scheme this launch uses. Colours are fixed for the session; changing it restarts the app. */
export const scheme: 'light' | 'dark' = themePreference === 'system' ? (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light') : themePreference;

export const colors: Palette = scheme === 'dark' ? DARK : LIGHT;

// A chosen theme also overrides the system's for the native parts (Liquid Glass, maps, the keyboard,
// pickers, alerts), so they match the app instead of the phone.
if (themePreference !== 'system') {
  try { Appearance.setColorScheme(themePreference); } catch { /* older native side: they follow the phone */ }
}

/**
 * The brand's own colours, the same in both themes, for surfaces that are always dark or always light:
 * the live workout, the countdown, and the share pictures (a posted image shouldn't depend on the
 * poster's settings).
 */
export const brand: Palette = LIGHT;

/**
 * Saves the choice and restarts into it (behind the boot animation), since every style is built at
 * launch. Resolves false if the app couldn't restart itself (some Android dev setups), so the screen
 * can ask the runner to reopen Jump; the choice is saved either way.
 */
export async function setThemePreference(next: ThemePreference): Promise<boolean> {
  try { Storage.setItemSync(THEME_KEY, next); } catch { return false; }
  try {
    await reloadAppAsync('Theme changed');
    return true;
  } catch {
    try {
      DevSettings.reload('Theme changed');
      return true;
    } catch {
      return false;
    }
  }
}

/** Whether the phone's own setting now disagrees with this launch, for "Use system setting". */
export function systemSchemeChanged() {
  if (themePreference !== 'system') return false;
  return (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light') !== scheme;
}

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
