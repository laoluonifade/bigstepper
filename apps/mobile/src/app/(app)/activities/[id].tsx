import { estimatedCalories } from '@jump/shared/calories';
import { describeReason } from '@jump/shared/copy';
import { activityName, formatDateTime, formatDistance, formatDistanceNumber, formatDuration, formatPace, formatSpeed } from '@jump/shared/format';
import { fromSteps, shownMetres } from '@jump/shared/progress';
import { metricOf } from '@jump/shared/scoring';
import type { Activity, Unit } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { CheckIcon, FeedIcon, SendIcon, ShareIcon } from '@/components/icons';
import { RouteMap } from '@/components/RunMap';
import { SendActivitySheet } from '@/components/SendActivity';
import { ShareRunSheet } from '@/components/ShareRun';
import { Button, Card, CountUp, ErrorNotice, Eyebrow, HardShadow, Loading, Meter, Notice, Score, Screen, Stat, TextField, TextLink, Txt, VerificationTag } from '@/components/ui';
import { api, isApiError, post } from '@/lib/api';
import { keys, useProfile, useUnit } from '@/lib/queries';
import { colors, display, radius, wideLabel } from '@/lib/theme';
import { confirm } from '@/lib/dialog';

export default function ActivityDetailScreen() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const unit = useUnit();
  const profile = useProfile();
  const [sheet, setSheet] = useState<'share' | 'send' | null>(null);
  const activity = useQuery({
    queryKey: keys.activity(id),
    queryFn: () => api<Activity>(`/activities/${id}`),
    refetchInterval: (query) => (query.state.data?.verificationStatus === 'PENDING_VERIFICATION' ? 2500 : false),
  });
  const track = useQuery({ queryKey: ['activity-track', id], queryFn: () => api<{ points: Array<[number, number]> }>(`/activities/${id}/track`), staleTime: Infinity });
  // A just-finished activity opens its share sheet once it comes back verified.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (fresh === '1' && activity.data?.verificationStatus === 'VERIFIED' && !autoOpened.current) {
      autoOpened.current = true;
      setSheet('share');
    }
  }, [fresh, activity.data?.verificationStatus]);

  if (activity.isLoading) return <Screen><Stack.Screen options={{ title: '' }} /><Loading /></Screen>;
  if (activity.error || !activity.data) return <Screen><Stack.Screen options={{ title: 'Not found' }} /><ErrorNotice error={activity.error ?? new Error('This activity doesn’t exist.')} /></Screen>;

  const a = activity.data;
  const pending = a.verificationStatus === 'PENDING_VERIFICATION';
  const verified = a.verificationStatus === 'VERIFIED';
  const metres = shownMetres(a);
  const moving = a.movingSeconds || a.elapsedSeconds;
  const pace = a.activityType === 'cycle' ? formatSpeed(metres, moving, unit) : formatPace(metres, moving, unit);
  const trimmed = verified ? a.recordedDistanceMetres - a.validatedDistanceMetres : 0;
  const calories = estimatedCalories(a, profile.data?.weightKg);
  const route = track.data?.points ?? [];

  return <Screen refreshing={activity.isRefetching} onRefresh={() => void activity.refetch()}>
    <Stack.Screen options={{ title: formatDateTime(a.startedAt) }} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <VerificationTag status={a.verificationStatus} />
      {a.source === 'strava' ? <Txt size={12} weight="bold" style={{ color: '#FC5200' }}>via Strava</Txt> : null}
    </View>
    <Text style={display(28)}>{activityName(a.startedAt, a.activityType)}</Text>

    {/* Equal, quiet actions that fit one row on a phone. */}
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 24 }}>
      <Action label="Post" icon={<FeedIcon size={17} />} disabled={!verified} onPress={() => router.navigate({ pathname: '/feed', params: { activity: a.id } })} />
      <Action label="Share" icon={<ShareIcon size={16} />} onPress={() => setSheet('share')} />
      <Action label="Send" icon={<SendIcon size={16} />} disabled={a.verificationStatus === 'REJECTED'} onPress={() => setSheet('send')} />
    </View>

    {fresh === '1' && verified && <Animated.View entering={ZoomIn.springify()} style={{ marginBottom: 24 }}>
      <HardShadow radius={radius.md}>
        <View style={styles.counts}>
          <View style={styles.countsIcon}><CheckIcon size={22} color={colors.volt} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[wideLabel(16, 0), { fontFamily: 'ArchivoWide-Black' }]}>Verified. It counts.</Text>
            <Txt size={13}>{a.activityType === 'cycle' ? `${formatDistance(metres, unit)} can count in your active Cycling and Distance competitions. It does not count toward the running league.` : `${formatDistance(metres, unit)} counts in your active league. Eligible competitions are listed below.`}</Txt>
          </View>
        </View>
      </HardShadow>
    </Animated.View>}

    {route.length >= 2 && <RouteMap route={route} style={styles.map} />}

    <Card variant="strong" padded={false}>
      <View style={{ padding: 20 }}>
        <Eyebrow>{verified ? (fromSteps(a) ? 'Verified distance · from steps' : 'Verified distance') : pending ? 'Recorded distance · provisional' : 'Recorded distance'}</Eyebrow>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
          <Score size={80} style={a.verificationStatus === 'REJECTED' ? { color: colors.ink3, textDecorationLine: 'line-through' } : undefined}>
            <CountUp value={metres} format={(m) => formatDistanceNumber(m, unit)} />
          </Score>
          <Txt size={16} weight="semibold" color="ink2">{unit}</Txt>
        </View>
        {fromSteps(a) && <Txt size={13} color="ink2">{`Measured from ${a.validatedSteps.toLocaleString('en-GB')} steps. GPS couldn’t track this one (indoors?). It can count for your league and step-based competitions, but not paid distance scoring.`}</Txt>}
        {trimmed > 0 && !fromSteps(a) && <Txt size={13} color="ink2">{`${formatDistance(trimmed, unit)} of the ${formatDistance(a.recordedDistanceMetres, unit)} recorded didn’t pass checks.`}</Txt>}
        <View style={styles.grid}>
          {a.activityType !== 'cycle' && <>
            <Stat style={styles.cell} label={verified ? 'Verified steps' : 'Recorded steps'} value={verified ? a.validatedSteps.toLocaleString('en-GB') : a.recordedSteps.toLocaleString('en-GB')} />
            <Stat style={styles.cell} label="Step cadence" value={verified && a.validatedSteps > 0 && moving > 0 ? `${Math.round((a.validatedSteps * 60) / moving).toLocaleString('en-GB')} /min` : '–'} />
          </>}
          {calories !== null && <Stat style={styles.cell} label="Estimated calories" value={calories.toLocaleString('en-GB')} unit="kcal" />}
          <Stat style={styles.cell} label="Moving time" value={formatDuration(moving)} />
          <Stat style={styles.cell} label={a.activityType === 'cycle' ? 'Avg speed' : `Pace /${unit}`} value={pace ?? '–'} />
          <Stat style={styles.cell} label="Elapsed" value={formatDuration(a.elapsedSeconds)} />
          <Stat style={styles.cell} label="Finished" value={new Date(a.finishedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} />
        </View>
      </View>
      {verified && <View style={styles.rowLine}>
        {profile.data?.weightKg ? <Txt size={12} color="ink3">Calories are an estimate from your private body weight and verified moving time, not a device measurement.</Txt>
          : <Txt size={12} color="ink3">Want a calorie estimate? <TextLink size={12} title="Add your private body weight" onPress={() => router.navigate('/you')} />.</Txt>}
      </View>}
      {!pending && <View style={styles.rowLine}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <Eyebrow>GPS confidence</Eyebrow>
          <Txt size={13} weight="bold" num>{Math.round(a.gpsConfidence * 100)}%</Txt>
        </View>
        <Meter value={a.gpsConfidence * 100} max={100} tone={a.gpsConfidence >= 0.7 ? 'ok' : 'track'} label="GPS confidence" />
        <Txt size={12} color="ink3" style={{ marginTop: 8 }}>Share of GPS points accurate enough to use. Runs need 70% or more to verify automatically.</Txt>
      </View>}
    </Card>

    {verified && <ActivityCredits activityId={a.id} unit={unit} />}
    {pending && <Notice tone="warn" title="Checking your route" style={{ marginTop: 24 }}>This usually takes a few seconds. The distance above is provisional until it’s verified. It won’t count on leaderboards before then. This page updates by itself.</Notice>}

    {a.verificationReasons.length > 0 && <View style={{ marginTop: 32 }}>
      <View style={styles.heading}><Eyebrow>{verified ? 'Notes from verification' : 'Why this activity was flagged'}</Eyebrow></View>
      <View style={{ gap: 12 }}>
        {a.verificationReasons.map((code) => {
          const reason = describeReason(code);
          return <View key={code} style={styles.reason}>
            <View style={{ width: 10, height: 10, borderRadius: 2, marginTop: 4, backgroundColor: verified ? colors.warn : colors.bad }} />
            <View style={{ flex: 1 }}>
              <Txt size={14} weight="bold">{reason.title}</Txt>
              <Txt size={13} color="ink2" leading={1.5} style={{ marginTop: 2 }}>{reason.detail}</Txt>
            </View>
          </View>;
        })}
      </View>
    </View>}

    {(a.verificationStatus === 'FLAGGED' || a.verificationStatus === 'REJECTED') && <ReviewRequest activityId={a.id} />}
    <DeleteActivity activityId={a.id} />

    <ShareRunSheet open={sheet === 'share'} onOpenChange={(open) => setSheet(open ? 'share' : null)} activity={a} unit={unit} />
    <SendActivitySheet open={sheet === 'send'} onOpenChange={(open) => setSheet(open ? 'send' : null)} activity={a} unit={unit} />
  </Screen>;
}

function Action({ label, icon, onPress, disabled }: { label: string; icon: ReactNode; onPress: () => void; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.action, disabled && { opacity: 0.4 }, pressed && { borderColor: colors.ink }]}>
    {icon}<Txt size={14} weight="semibold">{label}</Txt>
  </Pressable>;
}

function ActivityCredits({ activityId, unit }: { activityId: string; unit: Unit }) {
  const credits = useQuery({
    queryKey: ['activity-credits', activityId],
    queryFn: () => api<Array<{ code: string; title: string; scoringMethod: string; creditedDistanceMetres: number; creditedSteps: number; completionTimeSeconds: number | null }>>(`/activities/${activityId}/credits`),
  });
  return <Card style={{ padding: 20, marginTop: 24 }}>
    <Text style={wideLabel(16, 0)}>Competition credits</Text>
    <ErrorNotice error={credits.error} onRetry={() => void credits.refetch()} />
    {credits.isLoading ? <Txt size={13} color="ink2" style={{ marginTop: 8 }}>Checking joined competitions…</Txt>
      : !credits.data?.length ? <Txt size={13} color="ink2" style={{ marginTop: 8 }}>No competition credited this activity. It counts in competitions you’ve joined when it’s the right kind of activity and falls inside their dates.</Txt>
        : <View style={{ marginTop: 12 }}>{credits.data.map((credit, index) => {
          // What this one activity added: its time for a race against the clock, else distance and steps.
          const score = metricOf(credit.scoringMethod).aggregate === 'fastest' && credit.completionTimeSeconds
            ? formatDuration(credit.completionTimeSeconds)
            : [formatDistance(credit.creditedDistanceMetres, unit), credit.creditedSteps ? `${credit.creditedSteps.toLocaleString('en-GB')} steps` : null].filter(Boolean).join(' · ');
          return <Pressable key={credit.code} onPress={() => router.push(`/competitions/${credit.code}`)} style={[styles.credit, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
            <Txt size={13} weight="bold" numberOfLines={1} style={{ flex: 1, textDecorationLine: 'underline' }}>{credit.title}</Txt>
            <Txt size={13} color="ink2" num>{score}</Txt>
          </Pressable>;
        })}</View>}
  </Card>;
}

/** Remove an activity and recalculate any standings it affected. */
function DeleteActivity({ activityId }: { activityId: string }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api(`/activities/${activityId}`, { method: 'DELETE' }),
    onSuccess() {
      queryClient.removeQueries({ queryKey: keys.activity(activityId) });
      void queryClient.invalidateQueries({ queryKey: keys.activities });
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
      void queryClient.invalidateQueries({ queryKey: keys.myLeagues });
      router.back();
    },
  });
  return <View style={{ marginTop: 40, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 24 }}>
    <ErrorNotice error={remove.error} />
    <Pressable disabled={remove.isPending} hitSlop={8} onPress={() => void confirm({ title: 'Delete this activity?', message: 'It’s removed for good, along with its distance in any active competitions and, for walks or runs, your league. This can’t be undone.', cancelLabel: 'Keep it', confirmLabel: 'Delete activity', destructive: true })
      .then((ok) => { if (ok) remove.mutate(); })}>
      <Txt size={13} weight="semibold" color="bad" style={{ textDecorationLine: 'underline' }}>{remove.isPending ? 'Deleting…' : 'Delete this activity'}</Txt>
    </Pressable>
  </View>;
}

function ReviewRequest({ activityId }: { activityId: string }) {
  const [reason, setReason] = useState('');
  const request = useMutation({ mutationFn: () => post(`/activities/${activityId}/review-request`, { reason: reason.trim() }) });
  const alreadyPending = isApiError(request.error, 409);
  const length = reason.trim().length;
  if (request.isSuccess || alreadyPending) {
    return <Notice tone="ok" title={alreadyPending ? 'A review is already pending' : 'Review requested'} style={{ marginTop: 32 }}>A person on our team will look at this activity. If it’s approved, it’ll be credited to your competitions automatically.</Notice>;
  }
  return <View style={{ marginTop: 32 }}>
    <View style={styles.heading}><Eyebrow>Think we got it wrong?</Eyebrow></View>
    <Card style={{ padding: 20, gap: 16 }}>
      <TextField label="Tell us what happened" multiline maxLength={500} value={reason} onChangeText={setReason}
        hint={`${length}/500 · e.g. “I ran under a bridge for part of the route and lost signal.”`}
        error={length > 0 && length < 10 ? 'A little more detail please, at least 10 characters.' : undefined} />
      <ErrorNotice error={request.error} />
      <Button variant="secondary" title={request.isPending ? 'Sending…' : 'Request a review'} loading={request.isPending} disabled={length < 10} onPress={() => request.mutate()} />
    </Card>
  </View>;
}

const styles = StyleSheet.create({
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: radius.full, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  counts: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: radius.md, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.volt, paddingHorizontal: 20, paddingVertical: 16 },
  countsIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  map: { height: 220, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.ink, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 20, marginTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 20 },
  cell: { width: '50%', paddingRight: 12 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingHorizontal: 20, paddingVertical: 14 },
  heading: { borderBottomWidth: 2, borderBottomColor: colors.ink, paddingBottom: 8, marginBottom: 12 },
  reason: { flexDirection: 'row', gap: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, padding: 16 },
  credit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
});
