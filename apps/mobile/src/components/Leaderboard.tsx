import { formatDistanceNumber, ordinal } from '@jump/shared/format';
import type { AvatarStyle, Unit } from '@jump/shared/types';
import { router } from 'expo-router';
import { ReactNode, useId } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { brand, colors, fontFamily, radius, score } from '@/lib/theme';
import { Avatar, Tag, Txt, VerifiedTick } from './ui';
import { AccentSurface } from '@/lib/surface';

export interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  avatarUrl?: string | null;
  avatarStyle?: AvatarStyle;
  /** Opens their profile when known. */
  username?: string | null;
  metres: number;
  score?: number | null;
  host?: boolean;
  /** Blue tick from a Jump admin. */
  verified?: boolean;
  /** A quieter second line under the name, e.g. the km behind a steps score. */
  detail?: string | null;
}

/** Podium metals: the winner gets platinum and a crown, then gold and bronze. */
const PODIUM: Record<number, { light: string; base: string }> = {
  1: { light: '#F2FBFE', base: '#7FB6CA' },
  2: { light: '#FFE58A', base: '#D7981C' },
  3: { light: '#F2B47E', base: '#B4622A' },
};

export function RankBadge({ rank, size = 'md' }: { rank: number; size?: 'md' | 'lg' }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const metal = PODIUM[rank];
  const px = size === 'lg' ? 48 : 34;
  if (!metal) return <View style={{ minWidth: size === 'lg' ? 48 : 32, height: size === 'lg' ? 48 : 32, alignItems: 'center', justifyContent: 'center' }}><Text style={score(size === 'lg' ? 28 : 18)}>{rank}</Text></View>;
  return <View style={{ width: px, height: px, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={rank === 1 ? '1st, winning' : ordinal(rank)}>
    <Svg viewBox="0 0 32 32" width={px} height={px} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={`${id}-m`} x1="0" y1="0" x2="0.5" y2="1"><Stop offset="0" stopColor={metal.light} /><Stop offset="1" stopColor={metal.base} /></LinearGradient>
      </Defs>
      {rank === 1
        ? <Path d="M9.5 9.5V2.5l3.3 3L16 .8l3.2 4.7 3.3-3v7z" fill={colors.volt} stroke={colors.ink} strokeWidth="1.4" strokeLinejoin="round" />
        : <Path d="M10 1h4.5l3 8.5h-4.5zM22 1h-4.5l-3 8.5h4.5z" fill={colors.ink} />}
      <Circle cx="17.2" cy="20.2" r="10.8" fill={colors.ink} />
      <Circle cx="16" cy="19" r="10.8" fill={`url(#${id}-m)`} stroke={colors.ink} strokeWidth="1.8" />
      <Circle cx="16" cy="19" r="7.6" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.1" />
    </Svg>
    <Text style={[score(size === 'lg' ? 21 : 15), { transform: [{ translateY: (px * 3) / 32 }] }]}>{rank}</Text>
  </View>;
}

export function Leaderboard({ rows, currentUserId, unit, limit = 50, empty, metricLabel = 'Distance', formatScore }: {
  rows: LeaderboardRow[]; currentUserId?: string; unit: Unit; limit?: number; empty?: ReactNode; metricLabel?: string; formatScore?: (row: LeaderboardRow) => ReactNode;
}) {
  if (rows.length === 0) return <>{empty}</>;
  const meIndex = rows.findIndex((row) => row.userId === currentUserId);
  const visible = rows.slice(0, limit);
  const pinnedMe = meIndex >= limit ? rows[meIndex] : null;
  return <View style={styles.board}>
    <View style={styles.head}>
      <Text style={[styles.headText, { width: 56, paddingLeft: 16 }]}>Pos</Text>
      <Text style={[styles.headText, { flex: 1 }]}>Runner</Text>
      <Text style={[styles.headText, { paddingRight: 16, textAlign: 'right' }]}>{metricLabel}</Text>
    </View>
    {visible.map((row, index) => <Row key={row.userId} row={row} isMe={row.userId === currentUserId} unit={unit} formatScore={formatScore} last={index === visible.length - 1 && !pinnedMe} />)}
    {pinnedMe && <>
      <Txt size={11} color="ink3" align="center" style={{ letterSpacing: 3.3, paddingVertical: 4 }}>· · ·</Txt>
      <Row row={pinnedMe} isMe unit={unit} formatScore={formatScore} last />
    </>}
  </View>;
}

function Row({ row, isMe, unit, formatScore, last }: { row: LeaderboardRow; isMe: boolean; unit: Unit; formatScore?: (row: LeaderboardRow) => ReactNode; last: boolean }) {
  const body = <>
    <View style={{ width: 56, paddingLeft: 16 }}><RankBadge rank={row.rank} /></View>
    <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 8 }}>
      <Avatar name={row.name} src={row.avatarUrl} avatarStyle={row.avatarStyle} size={30} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt size={15} weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>{row.name}</Txt>
          {row.verified ? <VerifiedTick /> : null}
          {isMe ? <Tag color={brand.volt} background={brand.ink} border={brand.ink} style={{ height: 20, paddingHorizontal: 6 }}>You</Tag> : null}
          {row.host ? <Tag background={colors.paper} border={colors.line} style={{ height: 20, paddingHorizontal: 6 }}>Host</Tag> : null}
        </View>
        {row.detail ? <Txt size={12} color="ink3" num numberOfLines={1}>{row.detail}</Txt> : null}
      </View>
    </View>
    <View style={{ paddingRight: 16, alignItems: 'flex-end' }}>
      {formatScore ? formatScore(row) : <Text style={[score(20), isMe && { color: colors.onAccent }]}>{formatDistanceNumber(row.metres, unit)}<Text style={[styles.unit, isMe && { color: colors.onAccent }]}> {unit}</Text></Text>}
    </View>
  </>;
  const style = [styles.row, !last && styles.rowLine, isMe && { backgroundColor: colors.volt }];
  // Your row is volt: its text stays dark in both themes.
  const content = isMe ? <AccentSurface.Provider value>{body}</AccentSurface.Provider> : body;
  return row.username
    ? <Pressable onPress={() => router.push(`/runners/${row.username}`)} style={({ pressed }) => [...style, pressed && !isMe && { backgroundColor: colors.inkWash }]} accessibilityRole="button" accessibilityLabel={`${ordinal(row.rank)}, ${row.name}`}>{content}</Pressable>
    : <View style={style}>{content}</View>;
}

const styles = StyleSheet.create({
  board: { borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1.5, borderBottomColor: colors.ink, paddingVertical: 8 },
  headText: { fontFamily: fontFamily('bold'), fontSize: 10.5, letterSpacing: 1.26, textTransform: 'uppercase', color: colors.ink2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  unit: { fontFamily: fontFamily('semibold'), fontSize: 11, color: colors.ink2, letterSpacing: 0 },
});
