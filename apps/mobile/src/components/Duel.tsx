import { formatDistance } from '@jump/shared/format';
import type { AvatarStyle, Unit } from '@jump/shared/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { post } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { useProfile } from '@/lib/queries';
import { DUEL_VERB, duelKey, duelLine, duelPhase, isReady, sides, standing, type Duel, type DuelActivity } from '@/lib/duels';
import { brand, colors, fontFamily, radius, score, wideLabel } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { Sheet } from './Sheet';
import { CrownIcon, DuelIcon } from './icons';
import { Sticker } from './Stickers';
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

const PHASE_LABEL = { pending: 'Challenge', accepted: 'Accepted', countdown: 'Starting', live: 'Live', settling: 'Finishing', finished: 'Final', declined: 'Declined', cancelled: 'Called off', expired: 'Expired' } as const;
const RING = { challenger: brand.track, opponent: brand.volt } as const;

/** The jagged burst behind "VS". */
function VsBurst({ size }: { size: number }) {
  const points = Array.from({ length: 24 }, (_, index) => {
    const r = index % 2 ? size * 0.36 : size * 0.5;
    const angle = (Math.PI * 2 * index) / 24 - Math.PI / 2;
    return `${(size / 2 + r * Math.cos(angle)).toFixed(1)},${(size / 2 + r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] }}>
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Polygon points={points} fill={brand.track} stroke={brand.ink} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
    <Text style={{ fontFamily: fontFamily('black', 'wide'), fontSize: size * 0.3, color: brand.ink, letterSpacing: -0.5 }}>VS</Text>
  </View>;
}

/** Speed lanes and two glows, orange from one corner and volt from the other: the arena's floor. */
function ArenaBackdrop() {
  return <Svg style={StyleSheet.absoluteFill} viewBox="0 0 300 300" preserveAspectRatio="none">
    <Defs>
      <RadialGradient id="duelLeft" cx="0" cy="0" r="220" gradientUnits="userSpaceOnUse"><Stop offset="0" stopColor={brand.track} stopOpacity="0.45" /><Stop offset="1" stopColor={brand.track} stopOpacity="0" /></RadialGradient>
      <RadialGradient id="duelRight" cx="300" cy="300" r="220" gradientUnits="userSpaceOnUse"><Stop offset="0" stopColor={brand.volt} stopOpacity="0.3" /><Stop offset="1" stopColor={brand.volt} stopOpacity="0" /></RadialGradient>
    </Defs>
    <Rect width="300" height="300" fill="url(#duelLeft)" />
    <Rect width="300" height="300" fill="url(#duelRight)" />
    {Array.from({ length: 9 }, (_, lane) => <Path key={lane} d={`M${-60 + lane * 46} 300 L${60 + lane * 46} 0`} stroke="rgba(242,239,232,0.06)" strokeWidth={10} />)}
  </Svg>;
}

/**
 * The two of them squared up: faces in their colours either side of a VS burst, the challenge on a tilted
 * sticker, and once it's going, a tug-of-war bar of who's pulling ahead. Always dark, like a fight poster.
 */
export function DuelArena({ duel, viewerId, unit, big = false, live }: { duel: Duel; viewerId: string; unit: Unit; big?: boolean; live?: { challenger: number; opponent: number } }) {
  const phase = duelPhase(duel);
  const done = standing(duel);
  const metres = live ?? (phase === 'finished' ? { challenger: done.challenger.metres, opponent: done.opponent.metres } : null);
  const face = big ? 84 : 58;
  const km = formatDistance(duel.targetMetres, unit).split(' ');
  const fighter = (who: 'challenger' | 'opponent', tilt: number) => {
    const runner = duel[who];
    const won = phase === 'finished' && duel.winnerId === runner.userId;
    const lost = phase === 'finished' && duel.winnerId !== null && !won;
    return <View style={{ flex: 1, alignItems: 'center', opacity: lost ? 0.45 : 1 }}>
      <View style={{ height: big ? 32 : 22, justifyContent: 'flex-end' }}>{won ? <CrownIcon size={big ? 26 : 18} color={brand.volt} /> : null}</View>
      <View style={{ borderRadius: face, borderWidth: big ? 4 : 3, borderColor: RING[who], padding: 2, transform: [{ rotate: `${tilt}deg` }] }}>
        <Avatar name={runner.displayName} src={runner.avatarUrl} avatarStyle={runner.avatarStyle} size={face} round />
      </View>
      <View style={[styles.nameTag, { backgroundColor: RING[who], transform: [{ rotate: `${-tilt}deg` }] }]}>
        <Text style={styles.nameText} numberOfLines={1}>{runner.userId === viewerId ? 'You' : runner.displayName.split(' ')[0]}</Text>
      </View>
      {metres ? <Text style={[score(big ? 30 : 22), { color: brand.paper, marginTop: 4 }]}>{formatDistance(metres[who], unit)}</Text> : null}
    </View>;
  };
  const total = metres ? metres.challenger + metres.opponent : 0;
  const lit = phase === 'live' || phase === 'countdown';
  return <View style={[styles.arena, big && { borderRadius: 22, paddingVertical: 18 }]}>
    <ArenaBackdrop />
    <View style={styles.row}>
      <View style={styles.duelTag}><DuelIcon size={13} color={brand.ink} strokeWidth={2.6} /><Text style={styles.duelTagText}>Duel</Text></View>
      <View style={[styles.pill, lit ? { backgroundColor: brand.track } : phase === 'finished' ? { backgroundColor: brand.volt } : null]}>
        {phase === 'live' ? <LiveDot live color={brand.ink} size={7} /> : null}
        <Text style={[styles.pillText, (lit || phase === 'finished') && { color: brand.ink }]}>{PHASE_LABEL[phase]}</Text>
      </View>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 6 }}>
      {fighter('challenger', -4)}
      <View style={{ marginTop: big ? 44 : 30 }}><VsBurst size={big ? 70 : 52} /></View>
      {fighter('opponent', 4)}
    </View>
    <View style={{ alignItems: 'center', marginTop: big ? 16 : 10 }}>
      <Sticker p={brand} bg={brand.volt} tilt={-2} padded={false}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 16, paddingVertical: 6 }}>
          <Text style={[score(big ? 46 : 34), { color: brand.ink }]}>{km[0]}<Text style={{ fontSize: big ? 22 : 16 }}>{` ${km[1] ?? ''}`}</Text></Text>
          <Text style={styles.terms}>{`${DUEL_VERB[duel.activity]}\n${duel.minutes} min`}</Text>
        </View>
      </Sticker>
    </View>
    {metres ? <View style={styles.tug}>
      <View style={{ flex: total ? Math.max(metres.challenger, total * 0.04) : 1, backgroundColor: brand.track }} />
      <View style={styles.tugMid} />
      <View style={{ flex: total ? Math.max(metres.opponent, total * 0.04) : 1, backgroundColor: brand.volt }} />
    </View> : null}
    {phase === 'finished' && duel.winnerId === null ? <Text style={[styles.banner, { color: brand.paper }]}>It’s a draw</Text> : null}
    {!big && (lit || phase === 'settling') ? <Text style={[styles.banner, { color: brand.volt }]}>Tap to watch it live →</Text> : null}
  </View>;
}

/** A duel in a chat or the feed: the arena, then whatever it needs from you. Tapping opens the duel. */
export function DuelCard({ duel, viewerId, unit, actions = true }: { duel: Duel; viewerId: string; unit: Unit; actions?: boolean }) {
  return <Pressable onPress={() => router.push(`/duels/${duel.id}`)} style={({ pressed }) => [{ minWidth: 260 }, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]} accessibilityRole="button" accessibilityLabel={`Duel: ${duelLine(duel, unit)}`}>
    <DuelArena duel={duel} viewerId={viewerId} unit={unit} />
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
        style={[styles.chip, on && { backgroundColor: brand.volt, borderColor: brand.ink, borderWidth: 2, transform: [{ rotate: '-2deg' }] }]}>
        <Text style={[styles.chipText, on && { color: brand.ink, fontFamily: fontFamily('black', 'wide'), fontSize: 13 }]}>{text}</Text>
      </Pressable>;
    })}
  </View>;
}

/** Set up a duel from a DM: what, how far and how long. It lands in the chat with a hold-to-accept. */
export function DuelComposer({ open, onOpenChange, them, unit, onSent }: { open: boolean; onOpenChange: (open: boolean) => void; them: { username: string; name: string; avatarUrl: string | null; avatarStyle?: AvatarStyle }; unit: Unit; onSent?: () => void }) {
  const { username, name } = them;
  const user = useUser();
  const profile = useProfile().data;
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
      {/* What they'll get, updating as you pick. */}
      <DuelArena viewerId={user.id} unit={unit} duel={{
        id: 'preview', status: 'PENDING', activity, targetMetres: valid ? Math.round(distance * 1000) : 5_000, minutes: valid ? time : 30,
        challengerId: user.id, opponentId: 'them',
        challenger: { userId: user.id, username: profile?.username ?? '', displayName: profile?.displayName ?? 'You', avatarUrl: profile?.avatarUrl ?? null, avatarStyle: profile?.gender === 'male' ? 'masculine' : profile?.gender === 'female' ? 'feminine' : 'neutral' },
        opponent: { userId: 'them', username, displayName: name, avatarUrl: them.avatarUrl, avatarStyle: them.avatarStyle },
        acceptedAt: null, challengerReadyAt: null, opponentReadyAt: null, startsAt: null, endsAt: null, expiresAt: '', settledAt: null,
        challengerMetres: null, opponentMetres: null, challengerReachedAt: null, opponentReachedAt: null, winnerId: null,
      }} />
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
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.full, backgroundColor: 'rgba(242,239,232,0.14)', paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontFamily: fontFamily('extrabold', 'wide'), fontSize: 9.5, letterSpacing: 0.6, textTransform: 'uppercase', color: brand.paper },
  hold: { height: 54, borderRadius: radius.xl, borderWidth: 2, borderColor: brand.ink, backgroundColor: brand.volt, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: brand.track },
  holdText: { fontFamily: fontFamily('black', 'wide'), fontSize: 14, letterSpacing: 1, textTransform: 'uppercase', color: brand.ink },
  arena: { borderRadius: 18, borderWidth: 2, borderColor: brand.ink, backgroundColor: brand.ink, overflow: 'hidden', padding: 14 },
  duelTag: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, backgroundColor: brand.volt, paddingHorizontal: 9, paddingVertical: 4, transform: [{ rotate: '-3deg' }] },
  duelTagText: { fontFamily: fontFamily('black', 'wide'), fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: brand.ink },
  nameTag: { marginTop: -8, borderRadius: 7, borderWidth: 1.5, borderColor: brand.ink, paddingHorizontal: 8, paddingVertical: 2, maxWidth: '92%' },
  nameText: { fontFamily: fontFamily('black', 'wide'), fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase', color: brand.ink },
  terms: { fontFamily: fontFamily('black', 'wide'), fontSize: 10, lineHeight: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: brand.ink },
  tug: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 14, borderWidth: 1.5, borderColor: brand.paper },
  tugMid: { width: 3, backgroundColor: brand.ink },
  banner: { fontFamily: fontFamily('black', 'wide'), fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center', marginTop: 12 },
  chip: { borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontFamily: fontFamily('bold'), fontSize: 14, color: colors.ink },
});
