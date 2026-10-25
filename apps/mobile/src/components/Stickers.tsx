import { formatDistanceNumber, formatDuration, formatPace, formatSpeed } from '@jump/shared/format';
import { shownMetres } from '@jump/shared/progress';
import type { Activity, Unit } from '@jump/shared/types';
import { ReactNode } from 'react';
import { DimensionValue, StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import { fontFamily, type Palette } from '@/lib/theme';
import { HardShadow } from './ui';

/** The dark sticker stays dark in both themes, so the time on it always reads volt on ink. */
const INK = '#121212';

/**
 * A slightly tilted card with a thin outline and a small hard shadow: one sticker on the activity's
 * board. `k` scales it for the share image; `p` is the theme on screen, the brand palette in pictures.
 */
export function Sticker({ p, bg, tilt = 0, k = 1, padded = true, width, style, children }: {
  p: Palette; bg: string; tilt?: number; k?: number; padded?: boolean; width?: DimensionValue; style?: StyleProp<ViewStyle>; children: ReactNode;
}) {
  const r = 14 * k;
  return <View style={[{ width, transform: [{ rotate: `${tilt}deg` }] }, style]}>
    <HardShadow offset={4 * k} radius={r} color={p.shadow}>
      <View style={[{ borderRadius: r, borderWidth: 1.5 * k, borderColor: p.edge, backgroundColor: bg, overflow: 'hidden' }, padded && { paddingHorizontal: 14 * k, paddingVertical: 12 * k, alignItems: 'center' }]}>
        {children}
      </View>
    </HardShadow>
  </View>;
}

const PAST = { walk: 'walked', run: 'run', cycle: 'ridden' } as const;

/** The numbers on an activity's stickers, shared by the page and the share image. */
export function stickerNumbers(activity: Activity, unit: Unit) {
  const metres = shownMetres(activity);
  const seconds = activity.movingSeconds || activity.elapsedSeconds;
  const cycling = activity.activityType === 'cycle';
  const verified = activity.verificationStatus === 'VERIFIED';
  const steps = verified ? activity.validatedSteps : activity.recordedSteps;
  return {
    distance: formatDistanceNumber(metres, unit),
    distanceLabel: activity.verificationStatus === 'PENDING_VERIFICATION' ? `${unit} · checking` : `${unit} ${PAST[activity.activityType]}`,
    struck: activity.verificationStatus === 'REJECTED',
    time: formatDuration(seconds),
    pace: (cycling ? formatSpeed(metres, seconds, unit)?.split(' ')[0] : formatPace(metres, seconds, unit)) ?? '–',
    paceLabel: cycling ? `${unit}/h` : `pace /${unit}`,
    steps: !cycling && steps > 0 ? steps.toLocaleString('en-GB') : null,
  };
}

/**
 * Distance, time, pace and steps as a loose pile of stickers: distance big on volt, time on ink,
 * pace on orange overlapping it, steps tucked underneath.
 */
export function StatStickers({ activity, unit, p, k = 1 }: { activity: Activity; unit: Unit; p: Palette; k?: number }) {
  const n = stickerNumbers(activity, unit);
  const number = (size: number, color: string): TextStyle => ({ fontFamily: fontFamily('extrabold', 'narrow'), fontSize: size * k, lineHeight: size * 1.05 * k, letterSpacing: -0.02 * size * k, color, fontVariant: ['tabular-nums'] });
  const label = (color: string): TextStyle => ({ fontFamily: fontFamily('extrabold', 'wide'), fontSize: 9.5 * k, letterSpacing: 0.6 * k, textTransform: 'uppercase', color, marginTop: 2 * k });
  return <View>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <Sticker p={p} k={k} bg={n.struck ? p.card : p.volt} tilt={-2} style={{ flex: 1.35, marginTop: 16 * k, zIndex: 1 }}>
        <Text style={[number(68, n.struck ? p.ink3 : p.onAccent), n.struck && { textDecorationLine: 'line-through' }]} numberOfLines={1} adjustsFontSizeToFit>{n.distance}</Text>
        <Text style={label(n.struck ? p.ink3 : p.onAccent)} numberOfLines={1}>{n.distanceLabel}</Text>
      </Sticker>
      <View style={{ flex: 1, marginLeft: -4 * k, zIndex: 2 }}>
        <Sticker p={p} k={k} bg={INK} tilt={3}>
          <Text style={number(34, '#F2EFE8')} numberOfLines={1} adjustsFontSizeToFit>{n.time}</Text>
          <Text style={label(p.volt)}>time</Text>
        </Sticker>
        <Sticker p={p} k={k} bg={p.track} tilt={-3} style={{ marginTop: -6 * k, marginLeft: -12 * k }}>
          <Text style={number(34, p.onAccent)} numberOfLines={1} adjustsFontSizeToFit>{n.pace}</Text>
          <Text style={label(p.onAccent)} numberOfLines={1}>{n.paceLabel}</Text>
        </Sticker>
      </View>
    </View>
    {n.steps && <Sticker p={p} k={k} bg={p.card} tilt={2} width="44%" style={{ marginLeft: 22 * k, marginTop: -2 * k }}>
      <Text style={number(30, p.ink)} numberOfLines={1} adjustsFontSizeToFit>{n.steps}</Text>
      <Text style={label(p.ink2)}>steps</Text>
    </Sticker>}
  </View>;
}
