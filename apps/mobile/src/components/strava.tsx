import { formatRelative } from '@jump/shared/format';
import type { StravaStatus } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { api, post } from '@/lib/api';
import { keys } from '@/lib/queries';
import { colors, fontFamily, radius } from '@/lib/theme';
import { ErrorNotice, Txt } from './ui';

const STRAVA_ORANGE = '#FC5200';
const STRAVA_REVIEW_MESSAGE = 'Not available at the moment. We’re working to increase our limits, and our request is under review by Strava.';
const STALE_AFTER_MS = 10 * 60 * 1000;

export function StravaMark({ size = 16, color = colors.white }: { size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" /></Svg>;
}

function refreshStravaProgress(queryClient: QueryClient) {
  for (const queryKey of [keys.activities, keys.tables, ['standings'], keys.leagues, ['club'], keys.profile]) void queryClient.invalidateQueries({ queryKey });
}

function useStravaStatus(enabled = true) {
  return useQuery({
    queryKey: ['strava'],
    queryFn: () => api<StravaStatus>('/strava'),
    enabled,
    // While the server is importing (right after connecting), check back until it's done.
    refetchInterval: (query) => (query.state.data?.connected && query.state.data.syncing ? 2000 : false),
  });
}

/** Keeps Strava in step without a button: syncs when Jump opens if the last sync is stale, with a thin bar while it works. */
export function StravaSyncBar({ hidden }: { hidden?: boolean }) {
  const queryClient = useQueryClient();
  const status = useStravaStatus();
  const attempted = useRef(false);
  const [imported, setImported] = useState(0);
  const sync = useMutation({
    mutationFn: () => post<{ imported: number; skipped: number }>('/strava/sync'),
    onSuccess(result) {
      setImported(result.imported);
      void queryClient.invalidateQueries({ queryKey: ['strava'] });
      refreshStravaProgress(queryClient);
      // Import queues verification; refresh once more after those jobs have had time to credit boards.
      if (result.imported) setTimeout(() => refreshStravaProgress(queryClient), 15_000);
    },
  });
  const data = status.data;
  const serverSyncing = Boolean(data?.connected && data.syncing);

  useEffect(() => {
    if (attempted.current || !data?.connected || data.syncing || !data.canReadActivities) return;
    if (data.lastSyncedAt && Date.now() - new Date(data.lastSyncedAt).getTime() < STALE_AFTER_MS) return;
    attempted.current = true;
    sync.mutate();
  }, [data, sync]);

  const wasSyncing = useRef(false);
  useEffect(() => {
    if (wasSyncing.current && !serverSyncing) refreshStravaProgress(queryClient);
    wasSyncing.current = serverSyncing;
  }, [serverSyncing, queryClient]);

  useEffect(() => {
    if (!imported) return;
    const timer = setTimeout(() => setImported(0), 4000);
    return () => clearTimeout(timer);
  }, [imported]);

  const syncing = sync.isPending || serverSyncing;
  if (hidden || (!syncing && !imported)) return null;
  return <View style={styles.bar} accessibilityLiveRegion="polite">
    <StravaMark />
    <Text style={styles.barText}>{syncing ? 'Syncing from Strava…' : `${imported} new ${imported === 1 ? 'activity' : 'activities'} from Strava`}</Text>
  </View>;
}

/** One compact row in the profile card: connect, or who's connected and when it last synced. */
export function StravaConnection() {
  const queryClient = useQueryClient();
  const status = useStravaStatus();
  const disconnect = useMutation({
    mutationFn: () => api<StravaStatus>('/strava', { method: 'DELETE' }),
    onSuccess: (next) => queryClient.setQueryData(['strava'], next),
  });
  if (status.isPending) return null;
  const data = status.data;
  return <View style={styles.connection}>
    <View style={styles.badge}><StravaMark /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Txt size={14} weight="bold">Strava</Txt>
      <Txt size={12} color="ink2">
        {!data?.connected ? STRAVA_REVIEW_MESSAGE
          : data.syncing ? 'Syncing…'
            : !data.canReadActivities ? 'Reconnect and allow activity access'
              : data.lastSyncedAt ? `${data.athleteName ?? 'Connected'} · synced ${formatRelative(data.lastSyncedAt)}` : data.athleteName ?? 'Connected'}
      </Txt>
      <ErrorNotice error={disconnect.error} />
    </View>
    {!data?.connected || !data.canReadActivities
      ? <View style={[styles.connect, { opacity: 0.6 }]} accessibilityState={{ disabled: true }}><Text style={styles.connectText}>Connect</Text></View>
      : <Pressable disabled={disconnect.isPending} onPress={() => disconnect.mutate()} hitSlop={8}><Txt size={13} weight="semibold" color="ink2">{disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}</Txt></Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, backgroundColor: STRAVA_ORANGE, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
  barText: { fontFamily: fontFamily('bold'), fontSize: 13, color: colors.white },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 16, marginTop: 16 },
  badge: { width: 36, height: 36, borderRadius: 18, backgroundColor: STRAVA_ORANGE, alignItems: 'center', justifyContent: 'center' },
  connect: { height: 36, justifyContent: 'center', borderRadius: radius.base, backgroundColor: STRAVA_ORANGE, paddingHorizontal: 12 },
  connectText: { fontFamily: fontFamily('bold', 'wide'), fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.white },
});
