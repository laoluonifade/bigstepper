import { formatDistanceNumber, formatDuration } from '@jump/shared/format';
import { router } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OPEN_PAYMENT_STATUSES, useSavedPayments } from '@/lib/payments';
import { useNotifications, useUnit, useUnreadMessages } from '@/lib/queries';
import { movingSeconds, useRecorder } from '@/lib/recorder';
import { brand, colors, GUTTER, radius, scheme, score } from '@/lib/theme';
import { ArrowRightIcon, BellIcon, FeedIcon, JumpLogo, SearchIcon } from './icons';
import { StravaSyncBar } from './strava';
import { IconButton, LiveDot, Screen, Txt, useNow } from './ui';

/** The web's mobile top bar: the wordmark, then search, messages and notifications. */
export function TopBar({ right }: { right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const unreadMessages = useUnreadMessages().data?.count ?? 0;
  const unread = useNotifications().data?.filter((item) => !item.readAt).length ?? 0;
  return <View style={[styles.topBar, { paddingTop: insets.top, height: insets.top + 54 }]}>
    <Pressable onPress={() => router.navigate('/dashboard')} accessibilityRole="link" accessibilityLabel="Jump home" hitSlop={8}>
      <JumpLogo height={24} />
    </Pressable>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {right}
      <IconButton label="Find runners" icon={<SearchIcon size={20} />} onPress={() => router.push('/runners')} />
      <IconButton label={`Messages${unreadMessages ? `, ${unreadMessages} unread` : ''}`} icon={<FeedIcon size={20} />} badge={unreadMessages} onPress={() => router.push('/messages')} />
      <IconButton label={`Notifications${unread ? `, ${unread} unread` : ''}`} icon={<BellIcon size={20} />} badge={unread} onPress={() => router.push('/notifications')} />
    </View>
  </View>;
}

/** A tab's page: the top bar, the shell's status banners, then the content scrolling under them. */
export function TabScreen({ children, refreshing, onRefresh, banners = true, overlay }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void; banners?: boolean; /** Floats over the scrolling content, e.g. a create button. */ overlay?: ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <TopBar />
    <Screen refreshing={refreshing} onRefresh={onRefresh} contentStyle={{ paddingTop: 20, paddingBottom: 40 }}>
      {banners && <>
        <LiveRunBar />
        <PendingPaymentsBar />
        <StravaSyncBar />
      </>}
      {children}
    </Screen>
    {overlay}
  </View>;
}

/** While an activity records, every tab shows it so the runner can jump back. */
export function LiveRunBar() {
  const recorder = useRecorder();
  const unit = useUnit();
  const live = recorder.phase === 'recording' || recorder.phase === 'paused';
  const now = useNow(1000, live);
  if (!live) return null;
  return <Pressable onPress={() => router.navigate('/run')} accessibilityRole="button" accessibilityLabel="Back to your activity"
    style={({ pressed }) => [styles.liveBar, pressed && { opacity: 0.85 }]}>
    <LiveDot live={recorder.phase === 'recording'} color={recorder.phase === 'recording' ? brand.track : brand.paper} />
    <Txt size={11} weight="bold" upper tracking={0.14} style={{ color: brand.paper }}>{recorder.phase === 'recording' ? 'Recording' : 'Paused'}</Txt>
    <View style={{ flex: 1 }} />
    <Text style={[score(22), { color: brand.volt }]}>{formatDistanceNumber(recorder.distanceMetres, unit)}<Text style={{ fontSize: 12, color: 'rgba(242,239,232,0.6)' }}> {unit}</Text></Text>
    <Text style={[score(22), { color: brand.paper }]}>{formatDuration(movingSeconds(recorder.session, now))}</Text>
    <ArrowRightIcon size={18} color={brand.paper} />
  </Pressable>;
}

function PendingPaymentsBar() {
  const payments = useSavedPayments();
  const open = payments.filter((payment) => OPEN_PAYMENT_STATUSES.includes(payment.lastStatus));
  const review = payments.filter((payment) => payment.lastStatus === 'RECONCILIATION_REQUIRED');
  if (open.length === 0 && review.length === 0) return null;
  const first = open[0] ?? review[0];
  return <Pressable onPress={() => router.push('/payments/return')} accessibilityRole="button" style={({ pressed }) => [styles.paymentBar, pressed && { opacity: 0.85 }]}>
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warn }} />
    <Txt size={14} style={{ flex: 1 }}>
      <Txt size={14} weight="bold">{open.length > 0 ? 'Payment being confirmed. ' : 'A payment needs review. '}</Txt>
      <Txt size={14} color="ink2">{`${open.length + review.length === 1 ? `Entry to ${first.tableTitle}` : `${open.length + review.length} entries`}: check status`}</Txt>
    </Txt>
    <ArrowRightIcon size={18} />
  </Pressable>;
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, backgroundColor: colors.paper },
  liveBar: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, borderWidth: 2, borderColor: scheme === 'dark' ? colors.line : brand.ink, backgroundColor: scheme === 'dark' ? '#1E1E21' : brand.ink, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 24 },
  paymentBar: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.warnWash, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 24 },
});
