import { ZONE_LABEL, type LeagueZone } from '@jump/shared/league';
import type { LeagueDivision } from '@jump/shared/types';
import { useId } from 'react';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '@/lib/theme';
import { Tag } from './ui';

/** Metal for each division: highlight, base and the emblem's ink. Unknown names fall back to bronze. */
const DIVISION_METAL: Record<string, { light: string; base: string; mark: string }> = {
  bronze: { light: '#F2B47E', base: '#B4622A', mark: '#121212' },
  silver: { light: '#F4F5F2', base: '#A3A6A0', mark: '#121212' },
  gold: { light: '#FFE58A', base: '#D7981C', mark: '#121212' },
  platinum: { light: '#EEF9FC', base: '#86BCCF', mark: '#121212' },
  elite: { light: '#3A3A3A', base: '#121212', mark: '#E4FF3A' },
};

const SHIELD = 'M24 3 43 9.5V27c0 12.5-8 20.5-19 25.5C13 47.5 5 39.5 5 27V9.5z';

/** Bronze to Gold earn a chevron per level; Platinum gets a gem; Elite a crown. */
function DivisionEmblem({ level, name, colour }: { level: number; name: string; colour: string }) {
  const key = name.toLowerCase();
  if (key === 'elite' || level >= 5) return <Path d="M14 34V20.5l5.5 5L24 17l4.5 8.5 5.5-5V34z" fill={colour} stroke={colour} strokeWidth="1.5" strokeLinejoin="round" />;
  if (key === 'platinum' || level === 4) {
    return <G stroke={colour} strokeWidth="2.2" strokeLinejoin="round" fill="none">
      <Path d="M17 21h14l4 5-11 12-11-12z" />
      <Path d="M13 26h22M21 21l-2 5 5 12 5-12-2-5" strokeWidth="1.6" />
    </G>;
  }
  const count = Math.min(3, Math.max(1, level));
  const top = 27 - (count - 1) * 3.5;
  return <G stroke={colour} strokeWidth="3.4" strokeLinecap="square" strokeLinejoin="miter" fill="none">
    {Array.from({ length: count }, (_, index) => <Path key={index} d={`M15 ${top + index * 7 + 2}l9-6 9 6`} />)}
  </G>;
}

export function DivisionBadge({ division, size = 'md' }: { division: LeagueDivision | undefined; size?: 'md' | 'lg' }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const name = division?.name ?? 'Division';
  const metal = DIVISION_METAL[name.toLowerCase()] ?? DIVISION_METAL.bronze;
  const width = size === 'lg' ? 56 : 36;
  return <Svg width={width} height={width * (58 / 50)} viewBox="0 0 50 58" accessibilityLabel={`${name} division`}>
    <Defs>
      <LinearGradient id={`${id}-metal`} x1="0" y1="0" x2="0.4" y2="1">
        <Stop offset="0" stopColor={metal.light} />
        <Stop offset="1" stopColor={metal.base} />
      </LinearGradient>
    </Defs>
    <Path d={SHIELD} transform="translate(2.5 2.5)" fill={colors.ink} />
    <Path d={SHIELD} fill={`url(#${id}-metal)`} stroke={colors.ink} strokeWidth="2.5" strokeLinejoin="round" />
    <Path d="M24 8.5 38.5 13.5V27c0 9.5-5.8 16-14.5 20.3" fill="none" stroke="#fff" strokeOpacity={name.toLowerCase() === 'elite' ? 0.18 : 0.55} strokeWidth="1.6" strokeLinecap="round" />
    <DivisionEmblem level={division?.level ?? 1} name={name} colour={metal.mark} />
  </Svg>;
}

export function ZoneTag({ zone }: { zone: LeagueZone }) {
  const look = zone === 'up'
    ? { color: colors.ok, background: colors.okWash, border: 'rgba(18,128,92,0.6)' }
    : zone === 'down'
      ? { color: colors.bad, background: colors.badWash, border: 'rgba(194,38,27,0.5)' }
      : { color: colors.ink2, background: colors.card, border: colors.line };
  return <Tag {...look}>{ZONE_LABEL[zone]}</Tag>;
}
