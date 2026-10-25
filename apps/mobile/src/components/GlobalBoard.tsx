import { countryName, flag } from '@jump/shared/countries';
import { formatDistance } from '@jump/shared/format';
import type { AvatarStyle, Unit } from '@jump/shared/types';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { createContext, ReactNode, useContext, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Centered, ErrorNotice, haptic, HardShadow, Screen, Skeleton, Txt, VerifiedTick } from '@/components/ui';
import { api } from '@/lib/api';
import { useProfile, useUnit } from '@/lib/queries';
import { colors, GUTTER, radius, score } from '@/lib/theme';
import { ShareIcon } from './icons';
import { ShareBoardSheet } from './ShareBoard';

type BoardActivity = 'foot' | 'run' | 'walk' | 'cycle';
type BoardPeriod = 'week' | 'month' | 'all';
type BoardRow = { rank: number; userId: string; metres: number; activities: number; displayName: string; username: string | null; avatarUrl: string | null; avatarStyle?: AvatarStyle; countryCode: string | null; isMe: boolean; verified?: boolean };
type Board = { rows: BoardRow[]; me: BoardRow | null };

const ACTIVITY_TABS: Array<{ value: BoardActivity; label: string }> = [{ value: 'foot', label: 'On foot' }, { value: 'run', label: 'Run' }, { value: 'walk', label: 'Walk' }, { value: 'cycle', label: 'Ride' }];
const PERIODS: Array<{ value: BoardPeriod; label: string }> = [{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'all', label: 'All time' }];

/** Guests can't open runner profiles yet, so their rows don't link. */
const Linkable = createContext(true);

/** An avatar with the runner's flag pinned to the corner, so a global board reads as a map of who's out there. */
function Runner({ row, size, showFlag, ring }: { row: BoardRow; size: number; showFlag: boolean; ring?: string }) {
  return <View>
    <View style={ring ? { borderRadius: size, borderWidth: 2, borderColor: ring } : undefined}><Avatar name={row.displayName} src={row.avatarUrl} avatarStyle={row.avatarStyle} size={size} round /></View>
    {showFlag && row.countryCode ? <View style={styles.flag} accessibilityLabel={countryName(row.countryCode)}><Text style={{ fontSize: 12 }}>{flag(row.countryCode)}</Text></View> : null}
  </View>;
}

function RowLink({ row, style, children }: { row: BoardRow; style: object; children: ReactNode }) {
  return useContext(Linkable) && row.username && !row.isMe
    ? <Pressable onPress={() => router.push(`/runners/${row.username}`)} style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}>{children}</Pressable>
    : <View style={style}>{children}</View>;
}

function BoardRowView({ row, unit, leader, showFlag }: { row: BoardRow; unit: Unit; leader: number; showFlag: boolean }) {
  return <RowLink row={row} style={[styles.row, row.isMe && { backgroundColor: 'rgba(228,255,58,0.3)' }]}>
    <Txt size={15} weight="bold" color="ink3" num style={{ width: 28 }}>{row.rank}</Txt>
    <Runner row={row} size={36} showFlag={showFlag} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Txt size={14} weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>{row.isMe ? 'You' : row.displayName}</Txt>{row.verified ? <VerifiedTick /> : null}</View>
      {/* How far off the top they are, as a thin bar. */}
      <View style={styles.gap}><View style={{ height: '100%', borderRadius: 2, backgroundColor: 'rgba(18,18,18,0.7)', width: `${leader ? Math.max(4, (row.metres / leader) * 100) : 0}%` }} /></View>
    </View>
    <Txt size={15} weight="bold" num align="right">{formatDistance(row.metres, unit)}</Txt>
  </RowLink>;
}

/** The top three on a dark stage: first in the middle and highest, the way a real podium stands. */
function Podium({ rows, unit, showFlag }: { rows: BoardRow[]; unit: Unit; showFlag: boolean }) {
  const order = [rows[1], rows[0], rows[2]];
  const heights = [56, 80, 40];
  return <View style={styles.podium}>
    {order.map((row, index) => {
      if (!row) return <View key={index} style={{ flex: 1 }} />;
      const first = row.rank === 1;
      return <RowLink key={row.userId} row={row} style={{ flex: 1, alignItems: 'center', minWidth: 0 }}>
        <Runner row={row} size={first ? 64 : 48} showFlag={showFlag} ring={first || row.isMe ? colors.volt : colors.onInkWash} />
        <Txt size={13} weight="semibold" numberOfLines={1} style={{ marginTop: 8, color: row.isMe ? colors.volt : colors.paper }}>{row.isMe ? 'You' : row.displayName.split(' ')[0]}</Txt>
        <Txt size={15} weight="bold" num style={{ color: first ? colors.volt : colors.onInkMuted }}>{formatDistance(row.metres, unit)}</Txt>
        <View style={[styles.step, { height: heights[index], backgroundColor: first ? colors.volt : colors.onInkWash }]}>
          <Text style={[score(22), { color: first ? colors.onAccent : colors.onInkMuted }]}>{row.rank}</Text>
        </View>
      </RowLink>;
    })}
  </View>;
}

/** The global and country boards. `guest` shows the global board only, with the way in instead of "start a run". */
export function GlobalBoard({ guest = false }: { guest?: boolean }) {
  const unit = useUnit();
  const profile = useProfile();
  const country = profile.data?.countryCode ?? null;
  const [activity, setActivity] = useState<BoardActivity>('foot');
  const [period, setPeriod] = useState<BoardPeriod>('week');
  const [sharing, setSharing] = useState(false);
  const [chosenScope, setScope] = useState<'global' | 'country'>('global');
  const scope = guest ? 'global' : chosenScope;
  const board = useQuery({ queryKey: ['leaderboard', activity, period, scope, 50], queryFn: () => api<Board>(`/leaderboard?activity=${activity}&period=${period}&scope=${scope}&limit=50`), staleTime: 60_000 });
  const data = board.data;
  const global = scope === 'global';
  const me = data?.me;
  const above = me && data ? data.rows.find((row) => row.rank === me.rank - 1) ?? (data.rows.some((row) => row.isMe) ? null : data.rows.at(-1)) : null;
  const countries = global && data ? new Set(data.rows.map((row) => row.countryCode).filter(Boolean)).size : 0;
  const meOutside = data?.me && !data.rows.some((row) => row.isMe);
  const leader = data?.rows[0]?.metres ?? 0;

  return <Linkable.Provider value={!guest}><Screen refreshing={board.isRefetching} onRefresh={() => void board.refetch()}>
    <Txt size={26} weight="extrabold">{guest ? 'Who’s moving' : 'Leaderboard'}</Txt>
    <Txt size={13} color="ink3" style={{ marginTop: 2, marginBottom: 16 }}>{`Verified distance${activity === 'foot' ? ' from runs and walks' : ''}${global && countries > 1 ? ` · runners from ${countries} countries` : ''}`}</Txt>

    {/* Where: the whole world, or just home. */}
    {!guest && <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="tablist">
      {([['global', '🌍', 'Global'], ['country', country ? flag(country) : '🏳️', country ? countryName(country) : 'My country']] as const).map(([value, icon, label]) => {
        const active = scope === value;
        return <Pressable key={value} style={{ flex: 1 }} onPress={() => { haptic(); setScope(value); }} accessibilityRole="tab" accessibilityState={{ selected: active }}>
          <HardShadow offset={2} radius={radius['2xl']} pressed={!active}>
            <View style={[styles.scope, active && { backgroundColor: colors.ink }]}>
              <Text style={{ fontSize: 20 }}>{icon}</Text>
              <Txt size={14} weight="bold" numberOfLines={1} style={{ flexShrink: 1, color: active ? colors.paper : colors.ink2 }}>{label}</Txt>
            </View>
          </HardShadow>
        </Pressable>;
      })}
    </View>}

    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabs, guest && { marginTop: 0 }]} contentContainerStyle={{ gap: 20 }} accessibilityRole="tablist">
      {ACTIVITY_TABS.map((tab) => <Pressable key={tab.value} onPress={() => { haptic(); setActivity(tab.value); }} accessibilityRole="tab" accessibilityState={{ selected: activity === tab.value }} style={[styles.tab, activity === tab.value && { borderBottomColor: colors.ink }]}>
        <Txt size={14} weight="semibold" color={activity === tab.value ? 'ink' : 'ink3'}>{tab.label}</Txt>
      </Pressable>)}
    </ScrollView>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
      {PERIODS.map((option) => <Pressable key={option.value} onPress={() => { haptic(); setPeriod(option.value); }} style={[styles.period, period === option.value && { backgroundColor: colors.ink }]} accessibilityRole="tab" accessibilityState={{ selected: period === option.value }}>
        <Txt size={13} weight="semibold" color={period === option.value ? 'paper' : 'ink2'}>{option.label}</Txt>
      </Pressable>)}
      {!guest && <Pressable onPress={() => { haptic(); setSharing(true); }} hitSlop={6} style={[styles.period, styles.share]} accessibilityRole="button" accessibilityLabel="Share the leaderboard as an image">
        <ShareIcon size={14} color={colors.ink} />
      </Pressable>}
    </View>
    {!guest && <ShareBoardSheet open={sharing} onOpenChange={setSharing} activity={activity} period={period} initialScope={scope} country={country} unit={unit}
      filter={`${ACTIVITY_TABS.find((tab) => tab.value === activity)?.label} · ${PERIODS.find((option) => option.value === period)?.label}`} />}

    <ErrorNotice error={board.error} onRetry={() => void board.refetch()} />
    {board.isLoading ? <View style={{ gap: 12, marginTop: 16 }}><Skeleton style={{ height: 224, borderRadius: 24 }} /><Skeleton style={{ height: 288, borderRadius: radius['2xl'] }} /></View>
      : !data?.rows.length ? <View style={styles.empty}>
        <Text style={{ fontSize: 36, textAlign: 'center' }}>{global ? '🌍' : country ? flag(country) : '🏁'}</Text>
        <Txt size={15} weight="bold" align="center" style={{ marginTop: 12 }}>The top spot is open</Txt>
        <Txt size={13} color="ink3" align="center" style={{ marginTop: 4 }}>{`A verified ${activity === 'cycle' ? 'ride' : 'run or walk'} puts you on this board.`}</Txt>
        <Centered style={{ marginTop: 16 }}>
          {guest ? <Button variant="dark" title="Join free and take it" onPress={() => router.push('/register')} /> : <Button variant="dark" title="Start a run" onPress={() => router.navigate('/run')} />}
        </Centered>
      </View>
        : <View style={{ gap: 12, marginTop: 16 }}>
          <Podium rows={data.rows.slice(0, 3)} unit={unit} showFlag={global} />
          {/* Where you stand and who's next to catch. */}
          {me && <View style={styles.me}>
            <Text style={score(28)}>#{me.rank}</Text>
            <Txt size={13} leading={1.35} style={{ flex: 1 }}>
              {me.rank === 1 ? `You’re on top${global ? ' of the world' : country ? ` of ${countryName(country)}` : ''}. Hold it.`
                : above ? <><Txt size={13} weight="bold" num>{formatDistance(Math.max(0, above.metres - me.metres), unit)}</Txt>{` to pass ${above.isMe ? 'the next runner' : above.displayName.split(' ')[0]}${data.rows.some((row) => row.isMe) ? '' : ' and reach the top 50'}.`}</>
                  : 'Keep moving to climb.'}
            </Txt>
            <Pressable onPress={() => router.navigate('/run')} style={styles.go} accessibilityRole="button"><Txt size={12} weight="bold" color="paper">Go</Txt></Pressable>
          </View>}
          {(data.rows.length > 3 || meOutside) && <View style={styles.list}>
            {data.rows.slice(3).map((row, index) => <View key={row.userId} style={index > 0 ? styles.line : undefined}><BoardRowView row={row} unit={unit} leader={leader} showFlag={global} /></View>)}
            {meOutside && <View style={{ borderTopWidth: 1.5, borderTopColor: 'rgba(18,18,18,0.3)', borderStyle: 'dashed' }}><BoardRowView row={data.me!} unit={unit} leader={leader} showFlag={global} /></View>}
          </View>}
        </View>}
  </Screen></Linkable.Provider>;
}

const styles = StyleSheet.create({
  flag: { position: 'absolute', right: -4, bottom: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  gap: { height: 4, borderRadius: 2, backgroundColor: 'rgba(18,18,18,0.07)', marginTop: 6, overflow: 'hidden' },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderRadius: 24, backgroundColor: colors.ink, paddingHorizontal: 12, paddingTop: 20, overflow: 'hidden' },
  step: { width: '100%', marginTop: 8, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, alignItems: 'center', paddingTop: 8 },
  scope: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, paddingHorizontal: 8 },
  tabs: { marginTop: 16, flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, marginHorizontal: -GUTTER, paddingHorizontal: GUTTER },
  tab: { paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  period: { height: 32, borderRadius: radius.full, backgroundColor: colors.inkWash, paddingHorizontal: 14, justifyContent: 'center' },
  share: { marginLeft: 'auto', width: 32, paddingHorizontal: 0, alignItems: 'center' },
  empty: { marginTop: 16, borderRadius: radius['2xl'], borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(18,18,18,0.3)', paddingHorizontal: 16, paddingVertical: 48 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.ink, backgroundColor: 'rgba(228,255,58,0.4)', paddingHorizontal: 16, paddingVertical: 12 },
  go: { borderRadius: radius.full, backgroundColor: colors.ink, paddingHorizontal: 14, paddingVertical: 8 },
  list: { borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, overflow: 'hidden' },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
