import { VERIFICATION_LABEL } from '@jump/shared/copy';
import { defaultAvatarSvg } from '@jump/shared/avatars';
import type { AvatarStyle, VerificationStatus } from '@jump/shared/types';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ComponentRef, createContext, ReactNode, Ref, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, SvgXml } from 'react-native-svg';
import { isApiError } from '@/lib/api';
import { AccentSurface, useTextColor } from '@/lib/surface';
import { colors, eyebrow, fontFamily, GUTTER, radius, score, wideLabel, type Color, type Weight, type Width } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { AlertIcon, CheckIcon, CopyIcon, InfoIcon } from './icons';

/* ───────────────────────── Type ───────────────────────── */

export type TxtProps = TextProps & {
  size?: number;
  weight?: Weight;
  width?: Width;
  color?: Color;
  upper?: boolean;
  /** Letter spacing in em, as the web's tracking-[…em]. */
  tracking?: number;
  /** Line height as a multiple of the size. */
  leading?: number;
  align?: TextStyle['textAlign'];
  num?: boolean;
};

/** Archivo text. Weight and width pick a bundled cut, since custom fonts can't be bolded with fontWeight. */
export function Txt({ size = 15, weight = 'regular', width = 'normal', color: wanted, upper, tracking, leading = 1.4, align, num, style, ...props }: TxtProps) {
  const color = useTextColor(wanted);
  return <Text
    {...props}
    style={[
      {
        fontFamily: fontFamily(weight, width),
        fontSize: size,
        lineHeight: Math.round(size * leading),
        color: colors[color],
        ...(upper ? { textTransform: 'uppercase' } : {}),
        ...(tracking !== undefined ? { letterSpacing: tracking * size } : {}),
        ...(align ? { textAlign: align } : {}),
        ...(num ? { fontVariant: ['tabular-nums'] } : {}),
      },
      style,
    ]}
  />;
}

export function Eyebrow({ children, color = 'ink2', style }: { children: ReactNode; color?: Color; style?: StyleProp<TextStyle> }) {
  return <Text style={[eyebrow, { color: colors[color] }, style]}>{children}</Text>;
}

export function Score({ size = 32, color = 'ink', style, children, numberOfLines }: { size?: number; color?: Color; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number }) {
  return <Text numberOfLines={numberOfLines} style={[score(size), { color: colors[color] }, style]}>{children}</Text>;
}

/* ───────────────────────── Motion ───────────────────────── */

/** Eases a number toward `target` (from 0 on first render, then from the previous value). */
export function useCountUp(target: number, durationMs = 700) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = Date.now();
    const origin = from.current;
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      const next = origin + (target - origin) * (1 - Math.pow(1 - t, 3));
      from.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, target]);
  return value;
}

export function CountUp({ value, format = (n) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  return <>{format(useCountUp(value))}</>;
}

export function useNow(intervalMs = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs]);
  return now;
}

/** Fades and lifts its children in once, like the web's `animate-rise`. */
export function Rise({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: 320, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }));
  }, [delay, progress]);
  const animated = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateY: (1 - progress.value) * 6 }] }));
  return <Animated.View style={[animated, style]}>{children}</Animated.View>;
}

/** A status dot; when `live`, a ring pulses out of it (recording). */
export function LiveDot({ live, color = colors.track, size = 10 }: { live: boolean; color?: string; size?: number }) {
  const ring = useSharedValue(0);
  useEffect(() => {
    ring.value = live ? withRepeat(withTiming(1, { duration: 1600, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }), -1) : 0;
  }, [live, ring]);
  const animated = useAnimatedStyle(() => ({ opacity: live ? 0.7 * (1 - ring.value) : 0, transform: [{ scale: 1 + ring.value * 1.6 }] }));
  return <View style={{ width: size, height: size }}>
    <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size, backgroundColor: color }, animated]} />
    <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color, opacity: live ? 1 : 0.5 }} />
  </View>;
}

/**
 * The Taptic Engine vocabulary: `tap` for buttons, `select` for picking between options (and snapping),
 * `medium`/`heavy` for weighty moments like pause or a countdown beat, `success`/`warning` for outcomes.
 */
export function haptic(kind: 'tap' | 'select' | 'medium' | 'heavy' | 'success' | 'warning' = 'tap') {
  const done = () => undefined;
  if (kind === 'select') void Haptics.selectionAsync().catch(done);
  else if (kind === 'tap' || kind === 'medium' || kind === 'heavy') {
    void Haptics.impactAsync(kind === 'tap' ? Haptics.ImpactFeedbackStyle.Light : kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy).catch(done);
  } else void Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(done);
}

/* ───────────────────────── Surfaces ───────────────────────── */

/**
 * The web's `shadow-hard`: a solid ink block offset behind the element. Drawn as a view because native
 * shadows blur (iOS) or can't be offset (Android). `pressed` slides the element onto it.
 */
export function HardShadow({ children, offset = 3, pressed = false, radius: r = radius.base, style, color = colors.ink }: { children: ReactNode; offset?: number; pressed?: boolean; radius?: number; style?: StyleProp<ViewStyle>; color?: string }) {
  return <View style={[{ paddingRight: offset, paddingBottom: offset }, style]}>
    <View style={{ position: 'absolute', left: offset, top: offset, right: 0, bottom: 0, borderRadius: r, backgroundColor: color, opacity: pressed ? 0 : 1 }} />
    <View style={pressed ? { transform: [{ translateX: offset }, { translateY: offset }] } : undefined}>{children}</View>
  </View>;
}

export type CardVariant = 'panel' | 'strong' | 'hard' | 'dashed' | 'ink' | 'volt';

/** The web's `.panel` (hairline), `.panel-strong` (ink border) and the hard-shadow card. */
export function Card({ variant = 'panel', children, style, padded = true }: { variant?: CardVariant; children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const body = <View style={[styles.card, cardVariants[variant], padded && styles.cardPadding, style]}>{variant === 'volt' ? <AccentSurface.Provider value>{children}</AccentSurface.Provider> : children}</View>;
  return variant === 'hard' ? <HardShadow radius={radius.md}>{body}</HardShadow> : body;
}

const cardVariants: Record<CardVariant, ViewStyle> = {
  panel: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  strong: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.card },
  hard: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.card },
  dashed: { borderWidth: 1.5, borderColor: 'rgba(138,133,123,0.6)', borderStyle: 'dashed', backgroundColor: 'transparent' },
  ink: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.ink },
  volt: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.volt },
};

export function Divider({ style, strong }: { style?: StyleProp<ViewStyle>; strong?: boolean }) {
  return <View style={[{ height: strong ? 2 : StyleSheet.hairlineWidth, backgroundColor: strong ? colors.ink : colors.line }, style]} />;
}

/** A pressable that dims (iOS) or ripples (Android) like a native row. */
export function Touchable({ style, pressedStyle, children, ...props }: PressableProps & { style?: StyleProp<ViewStyle>; pressedStyle?: StyleProp<ViewStyle>; children: ReactNode }) {
  return <Pressable android_ripple={{ color: colors.inkFaint }} {...props} style={({ pressed }) => [style, pressed && (pressedStyle ?? { opacity: 0.6 })]}>{children}</Pressable>;
}

/* ───────────────────────── Buttons ───────────────────────── */

export type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'quiet' | 'danger' | 'volt';

const buttonColors: Record<ButtonVariant, { bg: string; fg: Color; border: string; borderWidth: number; shadow: boolean }> = {
  // Orange and volt keep dark text in both themes.
  primary: { bg: colors.track, fg: 'onAccent', border: colors.ink, borderWidth: 2, shadow: true },
  secondary: { bg: colors.card, fg: 'ink', border: colors.ink, borderWidth: 2, shadow: true },
  volt: { bg: colors.volt, fg: 'onAccent', border: colors.ink, borderWidth: 2, shadow: true },
  dark: { bg: colors.ink, fg: 'paper', border: colors.ink, borderWidth: 2, shadow: false },
  quiet: { bg: 'transparent', fg: 'ink', border: colors.line, borderWidth: 1, shadow: false },
  danger: { bg: colors.card, fg: 'bad', border: colors.bad, borderWidth: 2, shadow: false },
};

/**
 * Where a button that isn't `full` sits across its container. Buttons hug their label and sit at the
 * start by default; inside `Centered` (empty states, prompts) they sit in the middle.
 */
const ButtonAlign = createContext<'flex-start' | 'center'>('flex-start');

/** Centres buttons (and anything else) inside it. */
export function Centered({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <ButtonAlign.Provider value="center"><View style={[{ alignItems: 'center' }, style]}>{children}</View></ButtonAlign.Provider>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  disabled,
  full,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const look = buttonColors[variant];
  const align = useContext(ButtonAlign);
  const off = disabled || loading;
  const height = size === 'sm' ? 36 : size === 'lg' ? 56 : 46;
  return <Pressable
    onPress={() => { haptic(); onPress?.(); }}
    disabled={off}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? title}
    accessibilityState={{ disabled: Boolean(off), busy: Boolean(loading) }}
    style={[{ alignSelf: full ? 'stretch' : align }, { opacity: off ? 0.45 : 1 }, style]}
  >
    {({ pressed }) => {
      const face = <View style={[styles.button, { minHeight: height, paddingHorizontal: size === 'sm' ? 12 : 16, backgroundColor: look.bg, borderColor: look.border, borderWidth: look.borderWidth }, pressed && !look.shadow && { opacity: 0.8 }]}>
        {loading ? <ActivityIndicator color={colors[look.fg]} size="small" /> : icon}
        <Text numberOfLines={1} style={[wideLabel(size === 'sm' ? 11 : 13, 0.04), { fontFamily: fontFamily('bold', 'wide'), color: colors[look.fg] }]}>{title}</Text>
        {iconRight}
      </View>;
      return look.shadow ? <HardShadow pressed={pressed && !off}>{face}</HardShadow> : face;
    }}
  </Pressable>;
}

/** A round icon button for headers and toolbars. */
export function IconButton({ icon, onPress, label, badge, style }: { icon: ReactNode; onPress: () => void; label: string; badge?: number; style?: StyleProp<ViewStyle> }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.inkWash }, style]}>
    {icon}
    {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text></View> : null}
  </Pressable>;
}

export function TextLink({ title, onPress, color = 'ink', size = 14 }: { title: string; onPress: () => void; color?: Color; size?: number }) {
  return <Text onPress={onPress} suppressHighlighting accessibilityRole="link" style={{ fontFamily: fontFamily('semibold'), fontSize: size, color: colors[color], textDecorationLine: 'underline', textDecorationColor: 'rgba(18,18,18,0.3)' }}>{title}</Text>;
}

/* ───────────────────────── Layout ───────────────────────── */

/** A tab or page title inside the scroll view, as the web's PageHeader. */
export function PageHeader({ eyebrow: kicker, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <View style={{ marginBottom: 24 }}>
    {kicker ? <Eyebrow style={{ marginBottom: 8 }}>{kicker}</Eyebrow> : null}
    <Text style={styles.pageTitle}>{title}</Text>
    {description ? <Txt size={15} color="ink2" leading={1.55} style={{ marginTop: 10 }}>{description}</Txt> : null}
    {actions ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>{actions}</View> : null}
  </View>;
}

export function SectionTitle({ children, aside, style }: { children: ReactNode; aside?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.sectionTitle, style]}>
    <Text style={wideLabel(13)}>{children}</Text>
    {aside ? typeof aside === 'string' ? <Txt size={13} color="ink2">{aside}</Txt> : aside : null}
  </View>;
}

/**
 * The pull-to-refresh spinner, shown only for a refresh you pulled for. Screens poll in the background,
 * and tying the spinner to "is refetching" left it spinning (and on iOS, stuck open) during those.
 * It shows at least briefly, ends when the refetch does, and never hangs longer than 10 seconds.
 */
function usePullToRefresh(refetching: boolean) {
  const [active, setActive] = useState(false);
  const startedAt = useRef(0);
  const sawRefetch = useRef(false);
  useEffect(() => {
    if (!active) return;
    if (refetching) sawRefetch.current = true;
    // Done once the refetch it triggered has finished (or never started), after a short minimum.
    if (!refetching) {
      const wait = Math.max(0, 500 - (Date.now() - startedAt.current));
      const timer = setTimeout(() => setActive(false), sawRefetch.current ? wait : Math.max(wait, 800));
      return () => clearTimeout(timer);
    }
    const cap = setTimeout(() => setActive(false), 10_000);
    return () => clearTimeout(cap);
  }, [active, refetching]);
  return {
    active,
    start() {
      startedAt.current = Date.now();
      sawRefetch.current = false;
      setActive(true);
    },
  };
}

/** How much of the bottom a floating tab bar covers (iOS), so a page's end can scroll clear of it. */
export const BottomBarInset = createContext(0);

/** The standard scrolling page: paper background, 16px gutters, room for the tab bar. */
export function Screen({ ref, children, refreshing, onRefresh, padded = true, contentStyle, footer }: { ref?: Ref<ComponentRef<typeof ScrollView>>; children: ReactNode; refreshing?: boolean; onRefresh?: () => void; padded?: boolean; contentStyle?: StyleProp<ViewStyle>; footer?: ReactNode }) {
  const pulling = usePullToRefresh(Boolean(refreshing));
  const barInset = useContext(BottomBarInset);
  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <ScrollView
      ref={ref}
      style={{ flex: 1 }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentContainerStyle={[padded && { paddingHorizontal: GUTTER, paddingTop: 16, paddingBottom: 48 }, contentStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={pulling.active} onRefresh={() => { pulling.start(); onRefresh(); }} tintColor={colors.ink} colors={[colors.track]} /> : undefined}
    >
      {children}
      {barInset ? <View style={{ height: barInset }} /> : null}
    </ScrollView>
    {footer}
  </View>;
}

/** A bar pinned under a screen (a form's submit, a chat composer), above the home indicator. */
export function Footer({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }, style]}>{children}</View>;
}

/* ───────────────────────── Feedback ───────────────────────── */

type Tone = 'info' | 'ok' | 'warn' | 'bad' | 'neutral';

const toneStyles: Record<Tone, { border: string; bg: string; icon: string }> = {
  info: { border: colors.ink, bg: colors.card, icon: colors.ink },
  ok: { border: colors.ok, bg: colors.okWash, icon: colors.ok },
  warn: { border: colors.warn, bg: colors.warnWash, icon: colors.warn },
  bad: { border: colors.bad, bg: colors.badWash, icon: colors.bad },
  neutral: { border: colors.line, bg: colors.card, icon: colors.ink },
};

export function Notice({ tone = 'info', title, children, action, style }: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const look = toneStyles[tone];
  return <View accessibilityRole={tone === 'bad' ? 'alert' : undefined} style={[styles.notice, { borderColor: look.border, backgroundColor: look.bg }, style]}>
    <View style={{ marginTop: 2 }}>{tone === 'ok' ? <CheckIcon size={18} color={look.icon} /> : tone === 'warn' || tone === 'bad' ? <AlertIcon size={18} color={look.icon} /> : <InfoIcon size={18} color={look.icon} />}</View>
    <View style={{ flex: 1, minWidth: 0 }}>
      {title ? <Txt size={14} weight="bold" leading={1.5}>{title}</Txt> : null}
      {children ? typeof children === 'string' ? <Txt size={14} color="ink2" leading={1.5} style={title ? { marginTop: 2 } : undefined}>{children}</Txt> : <View style={title ? { marginTop: 2 } : undefined}>{children}</View> : null}
      {action ? <View style={{ marginTop: 12 }}>{action}</View> : null}
    </View>
  </View>;
}

/** Errors show as a toast rather than inline; each new error object raises one toast. */
export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const retry = useRef(onRetry);
  retry.current = onRetry;
  useEffect(() => {
    if (!error) return;
    const offline = isApiError(error, 0);
    const disabled = isApiError(error, 503);
    toast({
      tone: disabled ? 'warn' : 'bad',
      title: offline ? 'You’re offline' : disabled ? 'Not available right now' : undefined,
      message: error instanceof Error ? error.message : 'Something went wrong.',
      action: error instanceof Error && error.message.startsWith('Verify your identity')
        ? { label: 'Verify now', run: () => router.push('/wallet') }
        : retry.current && !disabled ? { label: 'Retry', run: () => retry.current?.() } : undefined,
    });
  }, [error]);
  return null;
}

export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 800 }), withTiming(0.5, { duration: 800 })), -1);
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[{ backgroundColor: colors.line, borderRadius: radius.base }, animated, style]} />;
}

/** A page's data is loading: its outline. With a label, the label instead, since what's happening matters more. */
export function Loading({ label }: { label?: string }) {
  if (label) {
    return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 40 }} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.ink} />
      <Txt size={13} weight="semibold" upper tracking={0.12} color="ink2">{label}</Txt>
    </View>;
  }
  return <View accessibilityLabel="Loading">
    <Skeleton style={{ height: 30, width: '60%' }} />
    <Skeleton style={{ height: 160, marginTop: 20, borderRadius: radius['2xl'] }} />
    <Skeleton style={{ height: 56, marginTop: 20, borderRadius: radius.xl }} />
    <Skeleton style={{ height: 56, marginTop: 10, borderRadius: radius.xl }} />
  </View>;
}

export function EmptyState({ mark, title, children, action }: { mark?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return <View style={styles.empty}>
    {mark ? typeof mark === 'string' ? <Score size={44} color="ink3" style={{ textAlign: 'center', marginBottom: 12 }}>{mark}</Score> : <View style={{ alignItems: 'center', marginBottom: 12 }}>{mark}</View> : null}
    <Txt size={15} weight="extrabold" width="wide" upper align="center">{title}</Txt>
    {children ? typeof children === 'string' ? <Txt size={14} color="ink2" align="center" leading={1.55} style={{ marginTop: 8 }}>{children}</Txt> : <View style={{ marginTop: 8 }}>{children}</View> : null}
    {action ? <Centered style={{ marginTop: 20 }}>{action}</Centered> : null}
  </View>;
}

/* ───────────────────────── Data display ───────────────────────── */

export function Tag({ children, color = colors.ink, background = colors.card, border = 'rgba(18,18,18,0.8)', style }: { children: ReactNode; color?: string; background?: string; border?: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.tag, { backgroundColor: background, borderColor: border }, style]}>
    {typeof children === 'string' ? <Text style={[styles.tagText, { color }]} numberOfLines={1}>{children}</Text> : children}
  </View>;
}

const verificationStyles: Record<VerificationStatus, { color: string; bg: string; border: string }> = {
  PENDING_VERIFICATION: { color: colors.warn, bg: colors.warnWash, border: 'rgba(154,98,0,0.6)' },
  VERIFIED: { color: colors.ok, bg: colors.okWash, border: 'rgba(18,128,92,0.6)' },
  FLAGGED: { color: colors.bad, bg: colors.badWash, border: 'rgba(194,38,27,0.6)' },
  REJECTED: { color: colors.paper, bg: colors.ink, border: colors.ink },
};

export function VerificationTag({ status }: { status: VerificationStatus }) {
  const look = verificationStyles[status];
  return <Tag color={look.color} background={look.bg} border={look.border}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: look.color }} />
      <Text style={[styles.tagText, { color: look.color }]}>{VERIFICATION_LABEL[status]}</Text>
    </View>
  </Tag>;
}

export function Stat({ label, value, unit, sub, style }: { label: ReactNode; value: ReactNode; unit?: ReactNode; sub?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ minWidth: 0 }, style]}>
    <Eyebrow>{label}</Eyebrow>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
      <Score size={32}>{value}</Score>
      {unit ? <Txt size={13} weight="semibold" color="ink2">{unit}</Txt> : null}
    </View>
    {sub ? <Txt size={12} color="ink2" style={{ marginTop: 4 }}>{sub}</Txt> : null}
  </View>;
}

/** Thin progress meter: the filled part carries the accent; the track is a lighter step. */
export function Meter({ value, max, tone = 'track', label, height = 8 }: { value: number; max: number; tone?: 'track' | 'ink' | 'ok' | 'volt'; label: string; height?: number }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withTiming(pct, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [grow, pct]);
  const animated = useAnimatedStyle(() => ({ width: `${grow.value}%` }));
  return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max, now: Math.min(value, max) }} style={{ height, borderRadius: radius.sm, backgroundColor: colors.inkFaint, overflow: 'hidden' }}>
    <Animated.View style={[{ height: '100%', backgroundColor: colors[tone] }, animated]} />
  </View>;
}

export function KeyValue({ items }: { items: Array<{ label: ReactNode; value: ReactNode }> }) {
  return <View>
    {items.map((item, index) => <View key={index} style={[styles.keyValue, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      {typeof item.label === 'string' ? <Txt size={14} color="ink2">{item.label}</Txt> : item.label}
      {typeof item.value === 'string' || typeof item.value === 'number' ? <Txt size={14} weight="semibold" num align="right" style={{ flexShrink: 1 }}>{item.value}</Txt> : item.value}
    </View>)}
  </View>;
}

/** The blue tick: a Jump admin verified this person or club. */
export function VerifiedTick({ size = 15 }: { size?: number }) {
  return <Svg viewBox="0 0 24 24" width={size} height={size} accessibilityLabel="Verified">
    <Path fill={colors.verified} d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z" />
    <Path fill="#fff" d="M10.54 16.2 6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36z" />
  </Svg>;
}

/** Profile photo over the generated picture (lib/avatars), which shows while it loads or if there isn't one. */
export function Avatar({ name, src, avatarStyle, size = 36, round, style }: { name: string | null | undefined; src?: string | null; avatarStyle?: AvatarStyle; size?: number; round?: boolean; style?: StyleProp<ViewStyle> }) {
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = Boolean(src) && failed !== src;
  return <View style={[{ width: size, height: size, borderRadius: round ? size / 2 : radius.sm, overflow: 'hidden', backgroundColor: colors.line }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <SvgXml xml={defaultAvatarSvg(name, avatarStyle)} width={size} height={size} />
    {showPhoto && <Image source={{ uri: src! }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} onError={() => setFailed(src!)} />}
  </View>;
}

/* ───────────────────────── Inputs ───────────────────────── */

export function FieldLabel({ label, optional }: { label: ReactNode; optional?: boolean }) {
  return <Text style={styles.label}>{label}{optional ? <Text style={{ fontFamily: fontFamily('regular'), color: colors.ink3 }}>  Optional</Text> : null}</Text>;
}

export function Hint({ children, error }: { children: ReactNode; error?: boolean }) {
  return <Txt size={12} leading={1.4} weight={error ? 'semibold' : 'regular'} color={error ? 'bad' : 'ink2'} style={{ marginTop: 6 }}>{children}</Txt>;
}

/** A labelled text field: the web's `.label` + `.field` + `.hint`. */
export type TextFieldRef = ComponentRef<typeof TextInput>;

export function TextField({ ref, label, hint, error, optional, left, right, containerStyle, style, multiline, onFocus, onBlur, ...props }: TextInputProps & { ref?: Ref<TextFieldRef>; label?: ReactNode; hint?: ReactNode; error?: ReactNode; optional?: boolean; left?: ReactNode; right?: ReactNode; containerStyle?: StyleProp<ViewStyle> }) {
  const [focused, setFocused] = useState(false);
  return <View style={containerStyle}>
    {label ? <FieldLabel label={label} optional={optional} /> : null}
    <View style={[styles.field, multiline && { minHeight: 112, alignItems: 'flex-start' }, { borderColor: error ? colors.bad : focused ? colors.ink : colors.line }]}>
      {left}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.ink3}
        selectionColor={colors.track}
        cursorColor={colors.ink}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        style={[styles.input, multiline && { paddingVertical: 12, lineHeight: 22 }, style]}
        {...props}
      />
      {right}
    </View>
    {error ? <Hint error>{error}</Hint> : hint ? <Hint>{hint}</Hint> : null}
  </View>;
}

export function Segmented<T extends string>({ value, options, onChange, label, size = 'md', stretch }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; label: string; size?: 'sm' | 'md'; stretch?: boolean }) {
  return <HardShadow offset={2} radius={radius.md} style={stretch ? undefined : { alignSelf: 'flex-start', maxWidth: '100%' }}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={!stretch} accessibilityRole="radiogroup" accessibilityLabel={label}
      style={styles.segmented} contentContainerStyle={[{ padding: 3 }, stretch && { flexGrow: 1 }]}>
      {options.map((option) => {
        const active = option.value === value;
        return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => { haptic(); onChange(option.value); }}
          style={[styles.segment, { minHeight: size === 'sm' ? 28 : 34, paddingHorizontal: size === 'sm' ? 12 : 14 }, stretch && { flex: 1 }, active && { backgroundColor: colors.ink }]}>
          <Text numberOfLines={1} style={[wideLabel(size === 'sm' ? 10.5 : 11, 0.06), { color: active ? colors.paper : colors.ink2 }]}>{option.label}</Text>
        </Pressable>;
      })}
    </ScrollView>
  </HardShadow>;
}

/** Chips that scroll sideways: filters and quick choices. */
export function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; label: string }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" accessibilityLabel={label} contentContainerStyle={{ gap: 8, paddingHorizontal: GUTTER }} style={{ marginHorizontal: -GUTTER, flexGrow: 0 }}>
    {options.map((option) => {
      const active = option.value === value;
      return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => { haptic(); onChange(option.value); }}
        style={[styles.chip, active && { backgroundColor: colors.ink, borderColor: colors.ink }]}>
        <Text style={[{ fontFamily: fontFamily('bold'), fontSize: 13, color: active ? colors.paper : colors.ink }]}>{option.label}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  return <Button variant="quiet" size="sm" title={copied ? 'Copied' : label} icon={copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
    onPress={() => void Clipboard.setStringAsync(value).then(() => { haptic('success'); setCopied(true); })} />;
}

/** A tappable list row: leading art, title and detail, and a trailing accessory. */
export function ListRow({ leading, title, detail, trailing, onPress, style }: { leading?: ReactNode; title: ReactNode; detail?: ReactNode; trailing?: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const body = <>
    {leading}
    <View style={{ flex: 1, minWidth: 0 }}>
      {typeof title === 'string' ? <Txt size={15} weight="semibold" numberOfLines={1}>{title}</Txt> : title}
      {detail ? typeof detail === 'string' ? <Txt size={13} color="ink2" numberOfLines={2} style={{ marginTop: 1 }}>{detail}</Txt> : detail : null}
    </View>
    {trailing}
  </>;
  return onPress
    ? <Touchable onPress={onPress} style={[styles.row, style]} pressedStyle={{ backgroundColor: colors.inkWash }}>{body}</Touchable>
    : <View style={[styles.row, style]}>{body}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, overflow: 'hidden' },
  cardPadding: { padding: 16 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.base },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.base },
  badge: { position: 'absolute', top: 2, right: 0, minWidth: 18, paddingHorizontal: 4, height: 18, borderRadius: 9, backgroundColor: colors.bad, borderWidth: 1.5, borderColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fontFamily('bold'), fontSize: 10, color: colors.paper, fontVariant: ['tabular-nums'] },
  pageTitle: { fontFamily: fontFamily('extrabold', 'wide'), fontSize: 30, lineHeight: 31, letterSpacing: -0.3, textTransform: 'uppercase', color: colors.ink },
  sectionTitle: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, borderBottomWidth: 2, borderBottomColor: colors.ink, paddingBottom: 8, marginBottom: 12 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.paper, paddingHorizontal: GUTTER, paddingTop: 12 },
  notice: { flexDirection: 'row', gap: 12, borderRadius: radius.base, borderWidth: 1, borderLeftWidth: 4, paddingHorizontal: 16, paddingVertical: 12 },
  empty: { borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(138,133,123,0.6)', paddingHorizontal: 24, paddingVertical: 40 },
  tag: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', height: 24, borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: 8 },
  tagText: { fontFamily: fontFamily('bold'), fontSize: 10.5, letterSpacing: 0.84, textTransform: 'uppercase' },
  keyValue: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, paddingVertical: 10 },
  label: { fontFamily: fontFamily('semibold'), fontSize: 13, color: colors.ink, marginBottom: 6 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 50, borderRadius: radius.base, borderWidth: 1.5, backgroundColor: colors.white, paddingHorizontal: 14 },
  input: { flex: 1, fontFamily: fontFamily('regular'), fontSize: 16, color: colors.ink, paddingVertical: 12 },
  segmented: { borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, flexGrow: 0 },
  segment: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.base },
  chip: { height: 36, justifyContent: 'center', borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER, paddingVertical: 12, minHeight: 56 },
});
