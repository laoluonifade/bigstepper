import { formatRelative } from '@jump/shared/format';
import type { AppleHealthStatus } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { api, post } from '@/lib/api';
import { appleHealthAvailable, requestAppleHealth, syncAppleHealth } from '@/lib/apple-health';
import { keys } from '@/lib/queries';
import { colors, fontFamily, radius } from '@/lib/theme';
import { ErrorNotice, Txt } from './ui';

const HEALTH_RED = '#FF2D55';
const STALE_AFTER_MS = 10 * 60 * 1000;

export function HealthMark({ size = 18, color = colors.white }: { size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Path d="M12 21.4 10.6 20.1C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.6L12 21.4Z" /></Svg>;
}

function refreshProgress(queryClient: QueryClient) {
  for (const queryKey of [keys.activities, keys.tables, ['standings'], keys.leagues, ['club'], keys.profile]) void queryClient.invalidateQueries({ queryKey });
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

/** One compact row in the profile card: connect Apple Health, or when it last synced. iPhone only. */
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
    onSuccess: (next) => queryClient.setQueryData(['apple-health'], next),
  });
  if (!appleHealthAvailable() || status.isPending) return null;
  const data = status.data;
  return <View style={styles.connection}>
    <View style={styles.badge}><HealthMark /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Txt size={14} weight="bold">Apple Health</Txt>
      <Txt size={12} color="ink2">
        {!data?.connected ? 'Import walks, runs and rides from Apple Watch and other apps'
          : sync.isPending ? 'Syncing…'
            : data.lastSyncedAt ? `Synced ${formatRelative(data.lastSyncedAt)}` : 'Connected'}
      </Txt>
      <ErrorNotice error={connect.error ?? sync.error ?? disconnect.error} />
    </View>
    {!data?.connected
      ? <Pressable disabled={connect.isPending} onPress={() => connect.mutate()} style={[styles.connect, connect.isPending && { opacity: 0.6 }]} hitSlop={8}>
        <Text style={styles.connectText}>{connect.isPending ? 'Connecting…' : 'Connect'}</Text>
      </Pressable>
      : <Pressable disabled={disconnect.isPending} onPress={() => disconnect.mutate()} hitSlop={8}><Txt size={13} weight="semibold" color="ink2">{disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}</Txt></Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, backgroundColor: HEALTH_RED, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
  barText: { fontFamily: fontFamily('bold'), fontSize: 13, color: colors.white },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 16, marginTop: 16 },
  badge: { width: 36, height: 36, borderRadius: 10, backgroundColor: HEALTH_RED, alignItems: 'center', justifyContent: 'center' },
  connect: { height: 36, justifyContent: 'center', borderRadius: radius.base, backgroundColor: colors.ink, paddingHorizontal: 12 },
  connectText: { fontFamily: fontFamily('bold', 'wide'), fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.white },
});
