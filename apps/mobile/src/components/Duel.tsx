import { formatDistance } from '@jump/shared/format';
import type { Unit } from '@jump/shared/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { post } from '@/lib/api';
import { duelKey, duelLine, duelPhase, isReady, sides, standing, type Duel, type DuelActivity } from '@/lib/duels';
import { colors, fontFamily, radius, score, wideLabel } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { Sheet } from './Sheet';
import { Avatar, Button, ErrorNotice, haptic, LiveDot, TextField, Txt } from './ui';

const HOLD_MS = 1_200;

/**
 * Press and hold to confirm: the button fills while held and fires once it's full. Letting go early
 * drains it, so a stray tap never commits.
 */
export function HoldButton({ label, onConfirm, disabled }: { label: string; onConfirm: () => void; disabled?: boolean }) {
  const fill = useSharedValue(0);
  const [width, setWidth] = useState(0);
  const filled = useAnimatedStyle(() => ({ width: fill.value * width }));
  const done = () => { haptic('success'); onConfirm(); };
  return <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Press and hold to confirm"
    onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    onPressIn={() => {
      haptic('medium');
      fill.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear }, (finished) => { if (finished) runOnJS(done)(); });
    }}
    onPressOut={() => { if (fill.value < 1) { cancelAnimation(fill); fill.value = withTiming(0, { duration: 180 }); } }}
    style={[styles.hold, disabled && { opacity: 0.5 }]}>
    <Animated.View style={[styles.holdFill, filled]} />
    <Text style={styles.holdText}>{label}</Text>
  </Pressable>;
}

/** Accept, decline, cancel or get ready: whatever this duel needs from the viewer next. */
export function DuelActions({ duel, viewerId, size = 'sm' }: { duel: Duel; viewerId: string; size?: 'sm' | 'md' }) {
  const queryClient = useQueryClient();
  const side = sides(duel, viewerId);
  const act = useMutation({
    mutationFn: (action: 'accept' | 'decline' | 'cancel' | 'ready') => post<{ status: string }>(`/duels/${duel.id}/${action}`),
    onSuccess(result, action) {
      if (action === 'ready' && result.status === 'LIVE') haptic('success');
      if (action === 'ready' && result.status !== 'LIVE') toast({ tone: 'ok', message: `${side?.them.displayName ?? 'They'} will get a ping. It starts when they’re ready too.` });
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: duelKey(duel.id) });
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
  if (!side) return null;
  const phase = duelPhase(duel);
  const waitingOn = side.them.displayName.split(' ')[0];
  let body = null;
  if (phase === 'pending' && !side.challenger) {
    body = <View style={{ gap: 8 }}>
      <HoldButton label="Hold to accept" disabled={act.isPending} onConfirm={() => act.mutate('accept')} />
      <Button size={size} variant="quiet" title="Decline" disabled={act.isPending} onPress={() => act.mutate('decline')} />
    </View>;
  } else if (phase === 'pending') {
    body = <View style={styles.row}>
      <Txt size={13} color="ink2" style={{ flex: 1 }}>{`Waiting for ${waitingOn} to accept`}</Txt>
      <Button size="sm" variant="quiet" title="Cancel" disabled={act.isPending} onPress={() => act.mutate('cancel')} />
    </View>;
  } else if (phase === 'accepted') {
    const meReady = isReady(side.mineReady);
    const themReady = isReady(side.theirsReady);
    body = <View style={{ gap: 8 }}>
      <Txt size={13} color="ink2">{meReady ? `You’re ready. Waiting for ${waitingOn}…` : themReady ? `${waitingOn} is ready. Tap to start the clock.` : 'Tap when you’re dressed and outside. It starts once you’re both ready.'}</Txt>
      {!meReady && <Button size={size} variant="volt" full title="I’m ready" loading={act.isPending} onPress={() => act.mutate('ready')} />}
    </View>;
  }
  if (!body) return null;
  return <View style={{ marginTop: 12, gap: 6 }}>{body}<ErrorNotice error={act.error} /></View>;
}

const PHASE_LABEL = { pending: 'Challenge', accepted: 'Accepted', countdown: 'Starting', live: 'Live', settling: 'Finishing', finished: 'Final', declined: 'Declined', cancelled: 'Cancelled', expired: 'Expired' } as const;

/** A duel as a card: what it is, who's in it and where it stands. Tapping opens the duel. */
export function DuelCard({ duel, viewerId, unit, actions = true }: { duel: Duel; viewerId: string; unit: Unit; actions?: boolean }) {
  const phase = duelPhase(duel);
  const done = standing(duel);
  const showScores = phase === 'finished';
  const person = (who: 'challenger' | 'opponent') => {
    const runner = duel[who];
    const won = phase === 'finished' && duel.winnerId === runner.userId;
    return <View style={styles.person}>
      <View style={[styles.face, won && { borderColor: colors.volt, borderWidth: 3 }]}><Avatar name={runner.displayName} src={runner.avatarUrl} avatarStyle={runner.avatarStyle} size={44} round /></View>
      <Txt size={13} weight="bold" numberOfLines={1} align="center">{runner.userId === viewerId ? 'You' : runner.displayName.split(' ')[0]}</Txt>
      {showScores ? <Text style={[score(18), { textAlign: 'center' }]}>{formatDistance(done[who].metres, unit)}</Text> : null}
      {won ? <Txt size={11} weight="bold" upper color="ink2">🏆 Winner</Txt> : null}
    </View>;
  };
  return <Pressable onPress={() => router.push(`/duels/${duel.id}`)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]} accessibilityRole="button" accessibilityLabel={`Duel: ${duelLine(duel, unit)}`}>
    <View style={styles.row}>
      <Text style={wideLabel(11)}>⚔️ Duel</Text>
      <View style={[styles.pill, phase === 'live' || phase === 'countdown' ? { backgroundColor: colors.track } : phase === 'finished' ? { backgroundColor: colors.volt } : null]}>
        {phase === 'live' ? <LiveDot live color={colors.paper} size={7} /> : null}
        <Text style={[styles.pillText, (phase === 'live' || phase === 'countdown') && { color: colors.paper }, phase === 'finished' && { color: colors.onAccent }]}>{PHASE_LABEL[phase]}</Text>
      </View>
    </View>
    <Text style={[score(26), { marginTop: 6 }]} numberOfLines={1} adjustsFontSizeToFit>{duelLine(duel, unit)}</Text>
    <View style={[styles.row, { marginTop: 10, alignItems: 'flex-start' }]}>
      {person('challenger')}
      <Text style={styles.vs}>VS</Text>
      {person('opponent')}
    </View>
    {phase === 'finished' && duel.winnerId === null ? <Txt size={13} weight="semibold" align="center" style={{ marginTop: 6 }}>It’s a draw</Txt> : null}
    {phase === 'live' || phase === 'countdown' || phase === 'settling' ? <Txt size={13} weight="semibold" align="center" style={{ marginTop: 8, textDecorationLine: 'underline' }}>Watch it live</Txt> : null}
    {actions ? <DuelActions duel={duel} viewerId={viewerId} /> : null}
  </Pressable>;
}

const ACTIVITIES: Array<[DuelActivity, string]> = [['run', 'Run'], ['walk', 'Walk'], ['cycle', 'Ride'], ['any', 'Any']];
const DISTANCES = [1, 3, 5, 10];
const MINUTES = [15, 30, 45, 60];

function Chips<T extends string | number>({ options, value, onChange, label }: { options: Array<[T, string]>; value: T | null; onChange: (value: T) => void; label: (value: T) => string }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    {options.map(([option, text]) => {
      const on = option === value;
      return <Pressable key={String(option)} onPress={() => { haptic('select'); onChange(option); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label(option)}
        style={[styles.chip, on && { backgroundColor: colors.ink, borderColor: colors.ink }]}>
        <Text style={[styles.chipText, on && { color: colors.paper }]}>{text}</Text>
      </Pressable>;
    })}
  </View>;
}

/** Set up a duel from a DM: what, how far and how long. It lands in the chat with a hold-to-accept. */
export function DuelComposer({ open, onOpenChange, username, name, unit, onSent }: { open: boolean; onOpenChange: (open: boolean) => void; username: string; name: string; unit: Unit; onSent?: () => void }) {
  const [activity, setActivity] = useState<DuelActivity>('run');
  const [km, setKm] = useState<number | null>(5);
  const [customKm, setCustomKm] = useState('');
  const [minutes, setMinutes] = useState<number | null>(30);
  const [customMinutes, setCustomMinutes] = useState('');
  const distance = km ?? Number(customKm.replace(',', '.'));
  const time = minutes ?? Number(customMinutes);
  const valid = Number.isFinite(distance) && distance >= 0.5 && distance <= 200 && Number.isInteger(time) && time >= 5 && time <= 600;
  const send = useMutation({
    mutationFn: () => post<{ id: string }>('/duels', { username, activity, targetMetres: Math.round(distance * 1000), minutes: time }),
    onSuccess() {
      haptic('success');
      toast({ tone: 'ok', message: `Duel sent. ${name.split(' ')[0]} gets a push and an email.` });
      onOpenChange(false);
      onSent?.();
    },
  });
  return <Sheet open={open} onOpenChange={onOpenChange} title={`Duel ${name.split(' ')[0]}`}
    description="First to the distance wins. If time runs out, whoever went farthest wins. The winner gets it in their trophy cabinet."
    footer={<Button full variant="primary" title={valid ? `Send · ${duelLine({ activity, targetMetres: Math.round(distance * 1000), minutes: time }, unit)}` : 'Send duel'} disabled={!valid} loading={send.isPending} onPress={() => send.mutate()} />}>
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Text style={wideLabel(11)}>Activity</Text>
        <Chips options={ACTIVITIES} value={activity} onChange={setActivity} label={(value) => `Activity ${value}`} />
      </View>
      <View style={{ gap: 8 }}>
        <Text style={wideLabel(11)}>Distance</Text>
        <Chips options={DISTANCES.map((value) => [value, `${value} km`] as [number, string])} value={km} onChange={(value) => { setKm(value); setCustomKm(''); }} label={(value) => `${value} km`} />
        <TextField keyboardType="decimal-pad" placeholder="Other distance in km" value={customKm} onChangeText={(text) => { setCustomKm(text); setKm(null); }} accessibilityLabel="Other distance in kilometres" />
      </View>
      <View style={{ gap: 8 }}>
        <Text style={wideLabel(11)}>Time limit</Text>
        <Chips options={MINUTES.map((value) => [value, `${value} min`] as [number, string])} value={minutes} onChange={(value) => { setMinutes(value); setCustomMinutes(''); }} label={(value) => `${value} minutes`} />
        <TextField keyboardType="number-pad" placeholder="Other time in minutes" value={customMinutes} onChangeText={(text) => { setCustomMinutes(text.replace(/\D/g, '')); setMinutes(null); }} accessibilityLabel="Other time in minutes" />
      </View>
      <ErrorNotice error={send.error} />
    </View>
  </Sheet>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  card: { minWidth: 240, borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, padding: 14 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.full, backgroundColor: colors.inkWash, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontFamily: fontFamily('extrabold', 'wide'), fontSize: 9.5, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.ink },
  person: { flex: 1, alignItems: 'center', gap: 4 },
  face: { borderRadius: 30, borderWidth: 1.5, borderColor: colors.edge, padding: 1 },
  vs: { fontFamily: fontFamily('black', 'wide'), fontSize: 16, color: colors.track, marginTop: 14 },
  hold: { height: 48, borderRadius: radius.xl, borderWidth: 2, borderColor: colors.edge, backgroundColor: colors.paper, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.volt },
  holdText: { fontFamily: fontFamily('extrabold', 'wide'), fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.ink },
  chip: { borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontFamily: fontFamily('bold'), fontSize: 14, color: colors.ink },
});
