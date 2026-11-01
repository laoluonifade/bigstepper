import { formatDistanceNumber, formatRelative } from '@jump/shared/format';
import type { AppleHealthStatus, DailySteps, Unit } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { api, post } from '@/lib/api';
import { appleHealthAvailable, requestAppleHealth, syncAppleHealth } from '@/lib/apple-health';
import { confirm } from '@/lib/dialog';
import { keys } from '@/lib/queries';
import { colors, fontFamily, radius } from '@/lib/theme';
import { ErrorNotice, Txt } from './ui';

const HEALTH_RED = '#FF2D55';
const STALE_AFTER_MS = 10 * 60 * 1000;

export function HealthMark({ size = 18, color = colors.white }: { size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Path d="M12 21.4 10.6 20.1C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.6L12 21.4Z" /></Svg>;
}

function refreshProgress(queryClient: QueryClient) {
  for (const queryKey of [keys.activities, keys.tables, ['standings'], keys.leagues, ['club'], keys.profile, ['activity-calendar'], ['activity-summary']]) void queryClient.invalidateQueries({ queryKey });
}

function useAppleHealthStatus() {
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

function useDailySteps() {
  const status = useAppleHealthStatus();
  return useQuery({
    queryKey: ['apple-health', 'days'],
    queryFn: () => api<DailySteps[]>('/apple-health/days?limit=30'),
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
  return <Pressable onPress={() => router.push('/activities')} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.9 }]} accessibilityRole="button"
    accessibilityLabel={`Steps today, ${(today?.steps ?? 0).toLocaleString('en-GB')}, from Apple Health`}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Txt size={15} weight="bold">Steps today</Txt>
      <View style={styles.via}><HealthMark size={11} color={HEALTH_RED} /><Txt size={12} weight="bold" style={{ color: HEALTH_RED }}>Apple Health</Txt></View>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginTop: 4 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.big}>{(today?.steps ?? 0).toLocaleString('en-GB')}</Text>
        <Txt size={13} color="ink2" num numberOfLines={1} style={{ marginTop: 2 }}>
          {today?.distanceMetres != null ? <Txt size={13} weight="bold" num>{`${formatDistanceNumber(today.distanceMetres, unit)} ${unit}`}</Txt> : null}
          {`${today?.distanceMetres != null ? ' walked · ' : ''}7-day avg ${average.toLocaleString('en-GB')}`}
        </Txt>
      </View>
      <View style={styles.week} accessible={false}>
        {week.map((day, index) => <View key={day.key} style={styles.weekColumn}>
          <View style={[styles.weekBar, index === 6 && { borderWidth: 1, borderColor: colors.ink3 }]}>
            {day.steps > 0 && <View style={{ height: `${Math.max(8, (day.steps / most) * 100)}%`, borderRadius: 4, backgroundColor: HEALTH_RED }} />}
          </View>
          <Txt size={9} weight="semibold" color={index === 6 ? 'ink' : 'ink3'}>{day.letter}</Txt>
        </View>)}
      </View>
    </View>
  </Pressable>;
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
  const sync = useAppleHealthSync();
  const connect = useMutation({
    mutationFn: async () => {
      await requestAppleHealth();
      return post<AppleHealthStatus>('/apple-health/connect');
    },
    onSuccess(next) {
      queryClient.setQueryData(['apple-health'], next);
      if (next.connected) sync.mutate(next);
    },
  });
  const disconnect = useMutation({
    mutationFn: () => api<AppleHealthStatus>('/apple-health', { method: 'DELETE' }),
    onSuccess(next) {
      queryClient.setQueryData(['apple-health'], next);
      refreshProgress(queryClient);
    },
  });
  const askDisconnect = async () => {
    if (await confirm({ title: 'Disconnect Apple Health?', message: 'Jump deletes the workouts and daily steps it imported from Apple Health, and they stop counting in competitions that are still running. Nothing in Apple Health itself changes.', confirmLabel: 'Disconnect', destructive: true })) disconnect.mutate();
  };
  if (!appleHealthAvailable() || status.isPending) return null;
  const data = status.data;
  return <View style={styles.connection}>
    <View style={styles.badge}><HealthMark /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Txt size={14} weight="bold">Apple Health</Txt>
      <Txt size={12} color="ink2">
        {!data?.connected ? 'Import workouts and your daily steps from iPhone and Apple Watch'
          : sync.isPending ? 'Syncing…'
            : data.lastSyncedAt ? `Synced ${formatRelative(data.lastSyncedAt)}` : 'Connected'}
      </Txt>
      <ErrorNotice error={connect.error ?? sync.error ?? disconnect.error} />
    </View>
    {!data?.connected
      ? <Pressable disabled={connect.isPending} onPress={() => connect.mutate()} style={[styles.connect, connect.isPending && { opacity: 0.6 }]} hitSlop={8}>
        <Text style={styles.connectText}>{connect.isPending ? 'Connecting…' : 'Connect'}</Text>
      </Pressable>
      : <Pressable disabled={disconnect.isPending} onPress={() => void askDisconnect()} hitSlop={8}><Txt size={13} weight="semibold" color="ink2">{disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}</Txt></Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  via: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tile: { borderRadius: 20, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, padding: 14 },
  big: { fontFamily: fontFamily('bold'), fontSize: 28, lineHeight: 32, letterSpacing: -0.5, color: colors.ink, fontVariant: ['tabular-nums'] },
  week: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 56 },
  weekColumn: { alignItems: 'center', gap: 4, height: '100%' },
  weekBar: { flex: 1, width: 10, borderRadius: 4, backgroundColor: colors.inkWash, overflow: 'hidden', justifyContent: 'flex-end' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, backgroundColor: HEALTH_RED, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
  barText: { fontFamily: fontFamily('bold'), fontSize: 13, color: colors.white },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingVertical: 16 },
  badge: { width: 36, height: 36, borderRadius: 10, backgroundColor: HEALTH_RED, alignItems: 'center', justifyContent: 'center' },
  connect: { height: 36, justifyContent: 'center', borderRadius: radius.base, backgroundColor: colors.ink, paddingHorizontal: 12 },
  connectText: { fontFamily: fontFamily('bold', 'wide'), fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.white },
});
