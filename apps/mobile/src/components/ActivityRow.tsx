import { activityName, formatDistance, formatDistanceNumber, formatDuration, formatPace, formatSpeed, formatTime } from '@jump/shared/format';
import { shownMetres } from '@jump/shared/progress';
import type { Activity, Unit } from '@jump/shared/types';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, GUTTER, radius, score } from '@/lib/theme';
import { CheckIcon, ChevronRightIcon, CycleIcon, RunIcon } from './icons';
import { Sheet } from './Sheet';
import { haptic, Txt, VerificationTag } from './ui';

export function ActivityBadge({ type, size = 36 }: { type: 'walk' | 'run' | 'cycle'; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: type === 'run' ? colors.track : colors.volt }}>
    {type === 'cycle' ? <CycleIcon size={size / 2.1} /> : <RunIcon size={size / 2.1} color={type === 'run' ? colors.paper : colors.ink} />}
  </View>;
}

export function ActivityRow({ activity, unit, last }: { activity: Activity; unit: Unit; last?: boolean }) {
  const started = new Date(activity.startedAt);
  const metres = shownMetres(activity);
  const seconds = activity.movingSeconds || activity.elapsedSeconds;
  const pace = activity.activityType === 'cycle' ? formatSpeed(metres, seconds, unit) : formatPace(metres, seconds, unit);
  const rejected = activity.verificationStatus === 'REJECTED';
  return <Pressable onPress={() => router.push(`/activities/${activity.id}`)} accessibilityRole="button"
    style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && { backgroundColor: colors.inkWash }]}>
    <View style={{ width: 44, alignItems: 'center' }}>
      <Text style={score(26)}>{started.getDate()}</Text>
      <Text style={styles.month}>{started.toLocaleDateString('en-GB', { month: 'short' })}</Text>
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={[score(26), rejected && { color: colors.ink3, textDecorationLine: 'line-through' }]}>{formatDistanceNumber(metres, unit)}</Text>
        <Txt size={12} weight="semibold" color="ink2">{unit}</Txt>
      </View>
      <Txt size={12} color="ink2" num numberOfLines={1} style={{ marginTop: 2 }}>
        <Txt size={12} weight="bold">{activity.activityType === 'cycle' ? 'Ride' : activity.activityType === 'run' ? 'Run' : 'Walk'}</Txt>
        {` · ${formatTime(activity.startedAt)} · ${formatDuration(seconds)}${pace ? ` · ${pace}${activity.activityType === 'cycle' ? '' : ` /${unit}`}` : ''}`}
        {activity.source === 'strava' ? <Txt size={12} weight="bold" style={{ color: '#FC5200' }}> · Strava</Txt> : null}
      </Txt>
    </View>
    <VerificationTag status={activity.verificationStatus} />
    <ChevronRightIcon size={16} color={colors.ink3} />
  </Pressable>;
}

/** All your activities, newest first, to attach one to a post or message. */
export function ActivityPicker({ open, onOpenChange, activities, unit, selectedId, title = 'Share an activity', onPick }: {
  open: boolean; onOpenChange: (open: boolean) => void; activities: Activity[]; unit: Unit; selectedId?: string; title?: string; onPick: (activity: Activity) => void;
}) {
  return <Sheet open={open} onOpenChange={onOpenChange} title={title}>
    {activities.map((activity) => <Pressable key={activity.id} onPress={() => { haptic(); onPick(activity); onOpenChange(false); }}
      style={({ pressed }) => [styles.pick, (pressed || selectedId === activity.id) && { backgroundColor: colors.inkWash }]}>
      <ActivityBadge type={activity.activityType} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={14} weight="semibold" numberOfLines={1}>{activityName(activity.startedAt, activity.activityType)}</Txt>
        <Txt size={12} color="ink3">{new Date(activity.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: new Date(activity.startedAt).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })}</Txt>
      </View>
      <Txt size={14} weight="bold" num>{formatDistance(shownMetres(activity), unit)}</Txt>
      {selectedId === activity.id ? <CheckIcon size={16} color={colors.track} /> : null}
    </Pressable>)}
    {!activities.length && <Txt size={13} color="ink3" align="center" style={{ paddingVertical: 32 }}>Record or import an activity to share it.</Txt>}
  </Sheet>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  month: { fontFamily: fontFamily('bold'), fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: colors.ink2 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.xl, paddingHorizontal: 8, paddingVertical: 8, marginHorizontal: -8 },
});
