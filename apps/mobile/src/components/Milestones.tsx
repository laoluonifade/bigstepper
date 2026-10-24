import { formatDistance } from '@jump/shared/format';
import type { Milestone } from '@jump/shared/progress';
import type { Unit } from '@jump/shared/types';
import { ReactNode, useId } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { colors, radius } from '@/lib/theme';
import { Txt } from './ui';

const GLYPHS: Record<string, ReactNode> = {
  first: <><Path d="M9 32V7m0 2h22l-5 6 5 6H9" /><Path d="M15 9v12m6-12v12m5-12v12" /></>,
  '5k': <><Path d="M7 31V9h24v22H7zM7 17h24M15 9v8m8 0v14" /><Path d="M12 25h4m8 0h4" /></>,
  '10k': <><Path d="M5 30 14 10l7 14 5-9 9 15H5z" /><Path d="M13 15h4m9 6h4" /></>,
  half: <><Path d="M6 31c1-14 10-23 20-23 5 0 8 2 9 5" /><Path d="M11 31c1-11 7-18 16-18m-1 0 5 5-6 4" /></>,
  streak3: <><Path d="M21 5c2 9-7 11-4 19 1-4 4-5 5-8 7 6 8 17-3 19C8 35 7 24 13 17c0 5 2 7 2 7" /></>,
  streak7: <><Circle cx="20" cy="20" r="7" /><Path d="M20 3v7m0 20v7M3 20h7m20 0h7M8 8l5 5m14 14 5 5M32 8l-5 5M13 27l-5 5" /></>,
  total50: <><Path d="m4 31 9-17 6 9 6-15 11 23H4z" /><Path d="m22 14 3-6 3 6M8 25l5-11 3 5" /></>,
  total100: <><Path d="m20 4 14 6v9c0 10-6 15-14 18C12 34 6 29 6 19v-9z" /><Path d="m20 11 2.5 6 6.5.5-5 4 1.5 6-5.5-3.5-5.5 3.5 1.5-6-5-4 6.5-.5z" /></>,
  total500: <><Path d="M22 3 8 22h11l-2 15 15-20H21z" /></>,
};

export type Metal = { face: [string, string]; rim: [string, string]; edge: string; ink: string };
export const METALS: Record<'volt' | 'bronze' | 'silver' | 'gold' | 'flame', Metal> = {
  volt: { face: ['#F6FF9E', '#D5EE1E'], rim: ['#FBFFD0', '#A9BE00'], edge: '#7D8C00', ink: '#121212' },
  bronze: { face: ['#F1B587', '#B8692F'], rim: ['#FFD9B8', '#8A4A1C'], edge: '#5E300F', ink: '#3B1C06' },
  silver: { face: ['#FBFBF9', '#B9BCB6'], rim: ['#FFFFFF', '#8D918A'], edge: '#5F625C', ink: '#2B2D29' },
  gold: { face: ['#FFE793', '#E0A82A'], rim: ['#FFF4C7', '#B07A0E'], edge: '#7A5205', ink: '#4A3100' },
  flame: { face: ['#FFB38F', '#FF4D12'], rim: ['#FFD6C2', '#C23500'], edge: '#8A2500', ink: '#2A0A00' },
};
const LOCKED: Metal = { face: ['#F2EFE8', '#D9D4C9'], rim: ['#FBFAF6', '#BDB7AA'], edge: '#9E9787', ink: '#9E9787' };
const TIER: Record<string, keyof typeof METALS> = {
  first: 'volt', '5k': 'bronze', '10k': 'silver', half: 'gold', streak3: 'flame', streak7: 'flame', total50: 'bronze', total100: 'silver', total500: 'gold',
};

/**
 * A 3D medal: a thick coin edge under a bevelled rim, a domed face with an embossed glyph and a
 * gloss highlight. Locked medals are matte grey with an orange progress ring.
 */
export function Medal({ milestone, size = 64 }: { milestone: Milestone; size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const metal = milestone.earned ? METALS[TIER[milestone.id] ?? 'gold'] : LOCKED;
  const pct = Math.max(0, Math.min(1, milestone.progress / milestone.target));
  const ring = 2 * Math.PI * 30;
  return <Svg viewBox="0 0 72 72" width={size} height={size} accessibilityElementsHidden>
    <Defs>
      <LinearGradient id={`rim-${uid}`} x1="0" y1="0" x2="0.4" y2="1"><Stop offset="0" stopColor={metal.rim[0]} /><Stop offset="1" stopColor={metal.rim[1]} /></LinearGradient>
      <RadialGradient id={`face-${uid}`} cx="0.35" cy="0.3" r="0.85"><Stop offset="0" stopColor={metal.face[0]} /><Stop offset="1" stopColor={metal.face[1]} /></RadialGradient>
      <LinearGradient id={`gloss-${uid}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#fff" stopOpacity="0.75" /><Stop offset="1" stopColor="#fff" stopOpacity="0" /></LinearGradient>
      <ClipPath id={`clip-${uid}`}><Circle cx="36" cy="34" r="22" /></ClipPath>
    </Defs>
    {/* Ground shadow, then the coin's thickness, then the rim and face on top. */}
    <Ellipse cx="36" cy="68" rx="20" ry="3.2" fill="#121212" opacity={milestone.earned ? 0.22 : 0.1} />
    <Circle cx="36" cy="38" r="29" fill={metal.edge} />
    <Circle cx="36" cy="34" r="29" fill={`url(#rim-${uid})`} />
    <Circle cx="36" cy="34" r="22.5" fill={metal.edge} opacity="0.55" />
    <Circle cx="36" cy="34.8" r="22" fill={`url(#face-${uid})`} />
    <Circle cx="36" cy="34" r="25.5" fill="none" stroke="#fff" strokeOpacity={milestone.earned ? 0.45 : 0.6} strokeWidth="0.8" strokeDasharray="1.2 2.2" />
    {/* Embossed glyph: a light offset under a dark stroke reads as raised metal. */}
    <G transform="translate(19 17) scale(0.85)" fill="none" strokeWidth="2.6" strokeLinecap="square" strokeLinejoin="miter">
      <G stroke="#fff" strokeOpacity={milestone.earned ? 0.6 : 0.8} transform="translate(0.7 0.9)">{GLYPHS[milestone.id]}</G>
      <G stroke={metal.ink} strokeOpacity={milestone.earned ? 0.9 : 0.55}>{GLYPHS[milestone.id]}</G>
    </G>
    <G clipPath={`url(#clip-${uid})`}>
      <Ellipse cx="29" cy="20" rx="20" ry="11" fill={`url(#gloss-${uid})`} transform="rotate(-20 29 20)" />
    </G>
    {!milestone.earned && pct > 0 && <Circle cx="36" cy="34" r="30" fill="none" stroke={colors.track} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${ring * pct} ${ring}`} transform="rotate(-90 36 34)" />}
  </Svg>;
}

function progressText(milestone: Milestone, unit: Unit) {
  if (milestone.earned) return 'Earned';
  if (milestone.kind === 'streak') return `Best ${milestone.progress} of ${milestone.target} days`;
  if (milestone.kind === 'count') return 'Not yet';
  if (milestone.kind === 'single') return `Longest ${formatDistance(milestone.progress, unit)}`;
  return `${formatDistance(milestone.progress, unit)} so far`;
}

export function MilestoneBadge({ milestone, unit, compact }: { milestone: Milestone; unit: Unit; compact?: boolean }) {
  return <View style={[styles.badge, !compact && styles.badgeBox]} accessible accessibilityLabel={`${milestone.title}: ${milestone.earned ? 'earned' : progressText(milestone, unit)}`}>
    <Medal milestone={milestone} size={60} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Txt size={13} weight="extrabold" width="wide" upper numberOfLines={1}>{milestone.title}</Txt>
      <Txt size={12} color="ink2" numberOfLines={1}>{milestone.description}</Txt>
      <Txt size={11} weight="semibold" color={milestone.earned ? 'ok' : 'ink3'} style={{ marginTop: 2 }}>{progressText(milestone, unit)}</Txt>
    </View>
  </View>;
}

export function MilestoneStrip({ milestones }: { milestones: Milestone[] }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityLabel="Milestones">
    {milestones.map((milestone) => <View key={milestone.id} accessible accessibilityLabel={`${milestone.title}: ${milestone.earned ? 'earned' : 'not yet earned'}`}><Medal milestone={milestone} size={44} /></View>)}
  </ScrollView>;
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badgeBox: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, padding: 12 },
});
