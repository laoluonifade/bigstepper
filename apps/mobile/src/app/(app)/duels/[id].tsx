import { formatDistance } from '@jump/shared/format';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { DuelActions } from '@/components/Duel';
import { Avatar, Button, ErrorNotice, LiveDot, Skeleton, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { DUEL_VERB, duelKey, duelLine, duelPhase, sides, standing, type DuelPerson, type DuelView } from '@/lib/duels';
import { useUnit } from '@/lib/queries';
import { useRecorder, type ActivityKind } from '@/lib/recorder';
import { colors, display, GUTTER, radius, score, wideLabel } from '@/lib/theme';
import { toast } from '@/lib/toast';

const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * One duel, for the two in it and anyone watching: the countdown, both runners' distance against the
 * target while it's live (about ten seconds behind), and the result.
 */
export default function DuelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useUser();
  const unit = useUnit();
  const recorder = useRecorder();
  const [now, setNow] = useState(Date.now());
  const duel = useQuery({
    queryKey: duelKey(id),
    queryFn: () => api<DuelView>(`/duels/${id}`),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const phase = duelPhase(data);
      return phase === 'live' || phase === 'countdown' || phase === 'settling' ? 4_000 : phase === 'pending' || phase === 'accepted' ? 8_000 : false;
    },
  });
  const data = duel.data;
  // The phone's clock, corrected to the server's, so the countdown is the same on both phones.
  const skew = data ? new Date(data.now).getTime() - duel.dataUpdatedAt : 0;
  const serverNow = now + skew;
  const phase = data ? duelPhase(data, serverNow) : null;
  useEffect(() => {
    if (phase !== 'countdown' && phase !== 'live' && phase !== 'settling') return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [phase]);

  if (duel.isLoading) return <View style={{ flex: 1, padding: GUTTER, backgroundColor: colors.paper }}><Skeleton style={{ height: 320 }} /></View>;
  if (!data || !phase) return <View style={{ flex: 1, padding: GUTTER, backgroundColor: colors.paper }}><ErrorNotice error={duel.error} onRetry={() => void duel.refetch()} /></View>;

  const side = sides(data, user.id);
  const standings = standing(data);
  const recording = recorder.phase === 'recording' || recorder.phase === 'paused' || recorder.phase === 'locating';
  const kinds: ActivityKind[] = data.activity === 'any' ? ['run', 'walk', 'cycle'] : [data.activity];
  const leader = standings.challenger.metres === standings.opponent.metres ? null : standings.challenger.metres > standings.opponent.metres ? data.challengerId : data.opponentId;
  const startsIn = data.startsAt ? new Date(data.startsAt).getTime() - serverNow : 0;
  const endsIn = data.endsAt ? new Date(data.endsAt).getTime() - serverNow : 0;

  async function startRecording(kind: ActivityKind) {
    const problem = await recorder.start(kind);
    if (problem === 'background-denied') toast({ tone: 'warn', message: 'Allow location “Always” so your duel keeps counting with the screen off.' });
    router.push('/run');
  }

  const lane = (who: 'challenger' | 'opponent', runner: DuelPerson) => {
    const mine = runner.userId === user.id;
    const { metres, reachedAt } = standings[who];
    const share = Math.min(1, metres / data.targetMetres);
    const won = phase === 'finished' && data.winnerId === runner.userId;
    const ahead = (phase === 'live' || phase === 'settling') && leader === runner.userId;
    return <View style={[styles.lane, (won || ahead) && { borderColor: colors.ink, borderWidth: 2 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar name={runner.displayName} src={runner.avatarUrl} avatarStyle={runner.avatarStyle} size={40} round />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={15} weight="bold" numberOfLines={1}>{mine ? 'You' : runner.displayName}</Txt>
          <Txt size={12} color="ink3" numberOfLines={1}>{won ? '🏆 Winner' : reachedAt ? `Reached ${formatDistance(data.targetMetres, unit)}` : ahead ? 'In front' : `@${runner.username}`}</Txt>
        </View>
        <Text style={score(30)}>{formatDistance(metres, unit)}</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(share * 100, metres > 0 ? 2 : 0)}%`, backgroundColor: who === 'challenger' ? colors.track : colors.volt }]} /></View>
    </View>;
  };

  return <ScrollView style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={{ padding: GUTTER, paddingBottom: 48, gap: 16 }}>
    <Stack.Screen options={{ title: 'Duel' }} />
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {phase === 'live' ? <LiveDot live /> : null}
        <Text style={wideLabel(11)}>{`⚔️ ${data.challenger.displayName.split(' ')[0]} vs ${data.opponent.displayName.split(' ')[0]}`}</Text>
      </View>
      <Text style={display(30)}>{duelLine(data, unit)}</Text>
      <Txt size={13} color="ink2">First to the distance wins. If nobody gets there, the farthest when time’s up wins.</Txt>
    </View>

    {phase === 'countdown' ? <Animated.View key={Math.ceil(startsIn / 1000)} entering={ZoomIn.duration(250)} style={styles.clock}>
      <Text style={[score(96), { color: colors.onAccent }]}>{startsIn > 1000 ? Math.ceil(startsIn / 1000) : 'GO'}</Text>
      <Text style={[wideLabel(12), { color: colors.onAccent }]}>Start moving</Text>
    </Animated.View> : null}
    {phase === 'live' ? <View style={[styles.clock, { backgroundColor: colors.ink }]}>
      <Text style={[score(64), { color: colors.paper }]}>{clock(endsIn)}</Text>
      <Text style={[wideLabel(12), { color: colors.volt }]}>Left on the clock</Text>
    </View> : null}
    {phase === 'settling' ? <View style={[styles.clock, { backgroundColor: colors.card }]}>
      <Text style={wideLabel(14)}>Time’s up</Text>
      <Txt size={13} color="ink2" align="center">Counting the last metres from both phones…</Txt>
    </View> : null}
    {phase === 'finished' ? <View style={[styles.clock, { backgroundColor: data.winnerId ? colors.volt : colors.card }]}>
      <Text style={[display(26), { color: data.winnerId ? colors.onAccent : colors.ink, textAlign: 'center' }]}>
        {data.winnerId === null ? 'It’s a draw' : data.winnerId === user.id ? 'You won 🏆' : `${(data.winnerId === data.challengerId ? data.challenger : data.opponent).displayName.split(' ')[0]} won 🏆`}
      </Text>
      {data.winnerId === user.id ? <Txt size={13} align="center" style={{ color: colors.onAccent }}>It’s in your trophy cabinet.</Txt> : null}
    </View> : null}
    {phase === 'declined' || phase === 'cancelled' || phase === 'expired' ? <View style={[styles.clock, { backgroundColor: colors.card }]}>
      <Text style={wideLabel(14)}>{phase === 'declined' ? 'Declined' : phase === 'cancelled' ? 'Called off' : 'Expired'}</Text>
      <Txt size={13} color="ink2" align="center">{phase === 'expired' ? 'Nobody got it started in time.' : 'This duel won’t go ahead.'}</Txt>
    </View> : null}

    {lane('challenger', data.challenger)}
    {lane('opponent', data.opponent)}

    {side && (phase === 'countdown' || phase === 'live') ? <View style={{ gap: 8 }}>
      {recording
        ? <Button full variant="dark" title="Recording · open your run" onPress={() => router.push('/run')} />
        : kinds.map((kind) => <Button key={kind} full variant="primary" title={`Start my ${DUEL_VERB[kind].toLowerCase()}`} onPress={() => void startRecording(kind)} />)}
      <Txt size={12} color="ink3" align="center">Only what you record during the duel counts. Keep recording until the clock runs out.</Txt>
    </View> : null}
    <DuelActions duel={data} viewerId={user.id} size="md" />
    {side ? <Button variant="quiet" title={`Message ${side.them.displayName.split(' ')[0]}`} onPress={() => router.push(`/messages/${side.them.username}`)} /> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  clock: { alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius['2xl'], borderWidth: 2, borderColor: colors.edge, backgroundColor: colors.volt, paddingVertical: 22, paddingHorizontal: 16 },
  lane: { gap: 12, borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, padding: 14 },
  track: { height: 12, borderRadius: 6, backgroundColor: colors.inkWash, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
});
