import { formatDistanceNumber, formatRelative } from '@jump/shared/format';
import type { AppleHealthStatus, DailySteps, Unit } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { AppState, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { api, patch, post } from '@/lib/api';
import { appleHealthAvailable, requestAppleHealth, startBackgroundSync, stopBackgroundSync, syncAppleHealth } from '@/lib/apple-health';
import { confirm } from '@/lib/dialog';
import { keys } from '@/lib/queries';
import { colors, fontFamily, radius, score } from '@/lib/theme';
import { ErrorNotice, Txt } from './ui';

const HEALTH_RED = '#FF2D55';
const STALE_AFTER_MS = 10 * 60 * 1000;

export const HEALTH_PINK = HEALTH_RED;

export function HealthMark({ size = 18, color = colors.white }: { size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Path d="M12 21.4 10.6 20.1C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.6L12 21.4Z" /></Svg>;
}

function refreshProgress(queryClient: QueryClient) {
  for (const queryKey of [keys.activities, keys.tables, ['standings'], keys.leagues, ['club'], keys.profile, ['activity-calendar'], ['activity-summary']]) void queryClient.invalidateQueries({ queryKey });
}

export function useAppleHealthStatus() {
  return useQuery({ queryKey: ['apple-health'], queryFn: () => api<AppleHealthStatus>('/apple-health'), enabled: appleHealthAvailable() });
}

function useAppleHealthSync(onImported?: (count: number) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (status: Extract<AppleHealthStatus, { connected: true }>) => syncAppleHealth(status.lastSyncedAt, status.connectedAt),
    onSuccess(imported) {
      void queryClient.invalidateQueries({ queryKey: ['apple-health'] });
      refreshProgress(queryClient);
      if (imported) setTimeout(() => refreshProgress(queryClient), 15_000);
      onImported?.(imported);
    },
  });
}

export function useDailySteps() {
  const status = useAppleHealthStatus();
  return useQuery({
    queryKey: ['apple-health', 'days'],
    queryFn: () => api<DailySteps[]>('/apple-health/days?limit=60'),
    enabled: Boolean(status.data?.connected),
  });
}

function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Today's steps and walking distance from Apple Health with the last seven days as bars, in the dashboard's tile style. */
export function HealthToday({ unit }: { unit: Unit }) {
  const days = useDailySteps();
  const byDay = new Map((days.data ?? []).map((row) => [row.day, row]));
  const today = byDay.get(localDay(new Date()));
  if (!days.data?.length) return null;
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return { key: localDay(date), letter: date.toLocaleDateString('en-GB', { weekday: 'narrow' }), steps: byDay.get(localDay(date))?.steps ?? 0 };
  });
  const counted = week.filter((day) => day.steps > 0);
  const average = counted.length ? Math.round(counted.reduce((sum, day) => sum + day.steps, 0) / counted.length) : 0;
  const most = Math.max(1000, ...week.map((day) => day.steps));
  return <Pressable onPress={() => router.push('/activities')} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]} accessibilityRole="button"
    accessibilityLabel={`Steps today, ${(today?.steps ?? 0).toLocaleString('en-GB')}, from Apple Health`}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={styles.via}><HealthMark size={11} color={HEALTH_RED} /><Txt size={11} weight="bold" upper tracking={0.1} style={{ color: HEALTH_RED }}>Steps today</Txt></View>
      <Text style={styles.big}>{(today?.steps ?? 0).toLocaleString('en-GB')}</Text>
      <Txt size={12} color="ink2" num>
        {today?.distanceMetres != null ? `${formatDistanceNumber(today.distanceMetres, unit)} ${unit} · ` : ''}{`avg ${average.toLocaleString('en-GB')}/day`}
      </Txt>
    </View>
    <View style={styles.week} accessible={false}>
      {week.map((day, index) => <View key={day.key} style={styles.weekColumn}>
        <View style={[styles.weekBar, index === 6 && { borderWidth: 1, borderColor: colors.ink3 }]}>
          {day.steps > 0 && <View style={{ height: `${Math.max(8, (day.steps / most) * 100)}%`, borderRadius: 3, backgroundColor: HEALTH_RED }} />}
        </View>
        <Txt size={9} weight="semibold" color={index === 6 ? 'ink' : 'ink3'}>{day.letter}</Txt>
      </View>)}
    </View>
  </Pressable>;
}

/** One day of Apple Health in your history: all-day steps and walking distance. There's no route, so it has no page of its own. */
export function HealthDayRow({ day, unit, last }: { day: DailySteps; unit: Unit; last?: boolean }) {
  const date = new Date(`${day.day}T12:00:00`);
  return <View style={[styles.dayRow, !last && styles.dayLine]} accessibilityLabel={`${date.toDateString()}: ${day.steps} steps from Apple Health`}>
    <View style={{ width: 44, alignItems: 'center' }}>
      <Text style={score(26)}>{date.getDate()}</Text>
      <Text style={styles.dayMonth}>{date.toLocaleDateString('en-GB', { month: 'short' })}</Text>
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={score(26)}>{day.steps.toLocaleString('en-GB')}</Text>
        <Txt size={12} weight="semibold" color="ink2">steps</Txt>
      </View>
      <Txt size={12} color="ink2" num numberOfLines={1} style={{ marginTop: 2 }}>
        <Txt size={12} weight="bold">All day</Txt>
        {day.distanceMetres != null ? ` · ${formatDistanceNumber(day.distanceMetres, unit)} ${unit} walked` : ''}
        <Txt size={12} weight="bold" style={{ color: HEALTH_RED }}> · Apple Health</Txt>
      </Txt>
    </View>
    <View style={styles.dayBadge}><HealthMark size={16} /></View>
  </View>;
}

/** Connects Apple Health: Apple's permission sheet, then Jump's side, a first sync and background wake-ups. */
export function useConnectAppleHealth(onConnected?: () => void) {
  const queryClient = useQueryClient();
  const sync = useAppleHealthSync();
  const connect = useMutation({
    mutationFn: async () => {
      await requestAppleHealth();
      return post<AppleHealthStatus>('/apple-health/connect');
    },
    onSuccess(next) {
      queryClient.setQueryData(['apple-health'], next);
      if (!next.connected) return;
      sync.mutate(next);
      void startBackgroundSync();
      onConnected?.();
    },
  });
  return { connect, sync };
}

/** Keeps the background wake-ups registered for anyone connected, every time Jump starts. */
export function useAppleHealthBackground() {
  const status = useAppleHealthStatus();
  const connected = Boolean(status.data?.connected);
  useEffect(() => { if (connected) void startBackgroundSync(); }, [connected]);
}

/** Pulls new Apple Health workouts when Jump opens or comes back to the front, with a thin bar while it works. */
export function AppleHealthSyncBar({ hidden }: { hidden?: boolean }) {
  const status = useAppleHealthStatus();
  const [imported, setImported] = useState(0);
  const sync = useAppleHealthSync(setImported);
  const lastAttempt = useRef(0);
  const data = status.data;

  useEffect(() => {
    if (!data?.connected) return;
    const run = () => {
      if (sync.isPending || Date.now() - lastAttempt.current < STALE_AFTER_MS) return;
      lastAttempt.current = Date.now();
      sync.mutate(data);
    };
    run();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') run(); });
    return () => subscription.remove();
  }, [data, sync]);

  useEffect(() => {
    if (!imported) return;
    const timer = setTimeout(() => setImported(0), 4000);
    return () => clearTimeout(timer);
  }, [imported]);

  if (hidden || (!sync.isPending && !imported)) return null;
  return <View style={styles.bar} accessibilityLiveRegion="polite">
    <HealthMark size={16} />
    <Text style={styles.barText}>{sync.isPending ? 'Syncing from Apple Health…' : `${imported} new ${imported === 1 ? 'activity' : 'activities'} from Apple Health`}</Text>
  </View>;
}

/** One row on the Connections screen: connect Apple Health, or when it last synced. iPhone only. */
export function AppleHealthConnection() {
  const queryClient = useQueryClient();
  const status = useAppleHealthStatus();
  const { connect, sync } = useConnectAppleHealth();
  const disconnect = useMutation({
    mutationFn: () => api<AppleHealthStatus>('/apple-health', { method: 'DELETE' }),
    onSuccess(next) {
      queryClient.setQueryData(['apple-health'], next);
      refreshProgress(queryClient);
      void stopBackgroundSync();
    },
  });
  const share = useMutation({
    mutationFn: (shareSteps: boolean) => patch<AppleHealthStatus>('/apple-health', { shareSteps }),
    onSuccess: (next) => queryClient.setQueryData(['apple-health'], next),
  });
  const askDisconnect = async () => {
    if (await confirm({ title: 'Disconnect Apple Health?', message: 'Jump deletes the workouts and daily steps it imported from Apple Health, and they stop counting in competitions that are still running. Nothing in Apple Health itself changes.', confirmLabel: 'Disconnect', destructive: true })) disconnect.mutate();
  };
  if (!appleHealthAvailable() || status.isPending) return null;
  const data = status.data;
  return <View style={styles.connectionBlock}><View style={styles.connectionTop}>
    <View style={styles.badge}><HealthMark /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Txt size={14} weight="bold">Apple Health</Txt>
      <Txt size={12} color="ink2">
        {!data?.connected ? 'Import workouts and your daily steps from iPhone and Apple Watch'
          : sync.isPending ? 'Syncing…'
            : data.lastSyncedAt ? `Synced ${formatRelative(data.lastSyncedAt)}` : 'Connected'}
      </Txt>
      <ErrorNotice error={connect.error ?? sync.error ?? disconnect.error ?? share.error} />
    </View>
    {!data?.connected
      ? <Pressable disabled={connect.isPending} onPress={() => connect.mutate()} style={[styles.connect, connect.isPending && { opacity: 0.6 }]} hitSlop={8}>
        <Text style={styles.connectText}>{connect.isPending ? 'Connecting…' : 'Connect'}</Text>
      </Pressable>
      : <Pressable disabled={disconnect.isPending} onPress={() => void askDisconnect()} hitSlop={8}><Txt size={13} weight="semibold" color="ink2">{disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}</Txt></Pressable>}
  </View>
    {data?.connected && <View style={styles.shareRow}>
      <View style={{ flex: 1 }}>
        <Txt size={13} weight="semibold">Post my daily steps to Rant</Txt>
        <Txt size={12} color="ink2" leading={1.4}>Once a day at 9pm, for days with at least 500 steps. Your followers see it.</Txt>
      </View>
      <Switch value={data.shareSteps !== false} disabled={share.isPending} onValueChange={(on) => share.mutate(on)} trackColor={{ true: colors.track, false: colors.line }} thumbColor={colors.white} accessibilityLabel="Post my daily steps to Rant" />
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  via: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, padding: 12, paddingLeft: 14 },
  big: { fontFamily: fontFamily('bold'), fontSize: 22, lineHeight: 26, letterSpacing: -0.4, color: colors.ink, fontVariant: ['tabular-nums'], marginTop: 2 },
  week: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 44 },
  weekColumn: { alignItems: 'center', gap: 3, height: '100%' },
  weekBar: { flex: 1, width: 8, borderRadius: 3, backgroundColor: colors.inkWash, overflow: 'hidden', justifyContent: 'flex-end' },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4 },
  dayLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  dayMonth: { fontFamily: fontFamily('bold'), fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: colors.ink2 },
  dayBadge: { width: 30, height: 30, borderRadius: 9, backgroundColor: HEALTH_RED, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, backgroundColor: HEALTH_RED, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
  barText: { fontFamily: fontFamily('bold'), fontSize: 13, color: colors.white },
  connectionBlock: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingVertical: 16, gap: 12 },
  connectionTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 48 },
  badge: { width: 36, height: 36, borderRadius: 10, backgroundColor: HEALTH_RED, alignItems: 'center', justifyContent: 'center' },
  connect: { height: 36, justifyContent: 'center', borderRadius: radius.base, backgroundColor: colors.ink, paddingHorizontal: 12 },
  connectText: { fontFamily: fontFamily('bold', 'wide'), fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.white },
});
