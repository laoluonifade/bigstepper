import { ordinal } from '@jump/shared/format';
import { formatGap, hasScored } from '@jump/shared/scoring';
import type { Unit } from '@jump/shared/types';
import { useQueryClient } from '@tanstack/react-query';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { Storage } from '@/lib/kv';
import { useUnit } from '@/lib/queries';
import { useRecorder } from '@/lib/recorder';
import { brand, colors, fontFamily, scheme, wideLabel } from '@/lib/theme';
import type { MyCompetition } from './CompeteHome';
import { CloseIcon } from './icons';
import { haptic, Txt } from './ui';

const DELAY_MS = 5_000;
const SHOW_MS = 12_000;
/** At most one nudge this often, however often the app is opened. */
const EVERY_MS = 30 * 60_000;
const LAST_KEY = 'jump_nudge_at';
const LIVE = ['OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED'];
/** Not over the things it would interrupt: the competition itself, recording, a chat, onboarding. */
const QUIET = [/^\/competitions\/[^/]+$/, /^\/run/, /^\/messages\/.+/, /\/chat$/, /^\/welcome/];

type Nudge = { code: string; title: string; line: string };

const first = (name: string | null) => (name ?? 'someone').trim().split(/\s+/)[0];
const noun = (type: string) => ({ RUN: 'run', WALK: 'walk', CYCLING: 'ride' } as Record<string, string>)[type] ?? 'activity';

/** Where you stand in one competition, in a line: the same words as the daily push. */
export function nudgeFor(table: MyCompetition, unit: Unit): Nudge {
  const method = table.scoringMethod;
  // `== null`: before the API sends the neighbours, they're missing (undefined), not null.
  const mine = table.myScore == null ? null : Number(table.myScore);
  const ahead = table.aheadScore == null ? null : Number(table.aheadScore);
  const behind = table.behindScore == null ? null : Number(table.behindScore);
  const verb = noun(table.challengeType);
  if (mine === null || !hasScored(method, mine) || !table.myRank) {
    return { code: table.code, title: `${table.title} is on`, line: `Your first ${verb} puts you on the board.` };
  }
  if (table.myRank === 1) {
    const line = behind === null || !hasScored(method, behind) ? 'Out in front. Keep it that way.'
      : behind === mine ? `Level with ${first(table.behindName)}. One more ${verb} takes it.`
        : `${formatGap(table, behind, mine, unit)} ahead of ${first(table.behindName)}. Keep the gap.`;
    return { code: table.code, title: `You’re leading ${table.title}`, line };
  }
  const line = ahead === null || !hasScored(method, ahead) ? `One ${verb} could move you up.`
    : ahead === mine ? `Level with ${first(table.aheadName)}. One ${verb} breaks the tie.`
      : `${formatGap(table, mine, ahead, unit)} behind ${first(table.aheadName)} for ${ordinal(table.myRank - 1)}. Go get it.`;
  return { code: table.code, title: `You’re ${ordinal(table.myRank)} in ${table.title}`, line };
}

/**
 * The booster: a few seconds after you open the app (anywhere but the places it would interrupt), a
 * card with where you stand in one of your live competitions, picked at random. Close it, tap it to
 * see the board, or Go to record. At most once every half hour.
 */
export function StandingNudge() {
  const insets = useSafeAreaInsets();
  const unit = useUnit();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const recorder = useRecorder();
  const [nudge, setNudge] = useState<Nudge | null>(null);
  // The latest of these, for the timer to read when it fires.
  const context = useRef({ pathname, phase: recorder.phase, unit });
  context.current = { pathname, phase: recorder.phase, unit };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void show(), DELAY_MS);
    };
    async function show() {
      const { pathname: path, phase, unit: shownUnit } = context.current;
      if (QUIET.some((pattern) => pattern.test(path)) || phase === 'recording' || phase === 'paused') return;
      let last = 0;
      try { last = Number(Storage.getItemSync(LAST_KEY) ?? 0); } catch { /* storage unavailable */ }
      if (Date.now() - last < EVERY_MS) return;
      const mine = await queryClient.fetchQuery({ queryKey: ['tables', 'mine'], queryFn: () => api<MyCompetition[]>('/tables/mine'), staleTime: 60_000 }).catch(() => null);
      const live = (mine ?? []).filter((table) => table.joined && LIVE.includes(table.status) && table.entrants > 1
        && (!table.startsAt || new Date(table.startsAt).getTime() <= Date.now())
        && (!table.scoringClosesAt || new Date(table.scoringClosesAt).getTime() > Date.now()));
      if (!live.length) return;
      try { Storage.setItemSync(LAST_KEY, String(Date.now())); } catch { /* fine */ }
      haptic('tap');
      setNudge(nudgeFor(live[Math.floor(Math.random() * live.length)], shownUnit));
    }
    schedule();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') schedule();
      else if (timer) { clearTimeout(timer); timer = null; }
    });
    return () => { if (timer) clearTimeout(timer); subscription.remove(); };
  }, [queryClient]);

  useEffect(() => {
    if (!nudge) return;
    const timer = setTimeout(() => setNudge(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [nudge]);
  // Navigating into the competition (or starting to record) puts it away.
  useEffect(() => { if (nudge && QUIET.some((pattern) => pattern.test(pathname))) setNudge(null); }, [pathname, nudge]);

  if (!nudge) return null;
  return <Animated.View entering={FadeInUp.springify().damping(16)} exiting={FadeOutUp.duration(180)} style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
    <Pressable onPress={() => { haptic(); setNudge(null); router.push(`/competitions/${nudge.code}`); }} accessibilityRole="button" accessibilityLabel={`${nudge.title}. ${nudge.line}`}
      style={({ pressed }) => [styles.card, scheme === 'dark' && { borderWidth: 1, borderColor: colors.line }, pressed && { opacity: 0.92 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[wideLabel(12, 0.06), { color: brand.volt, fontFamily: fontFamily('bold', 'wide') }]}>{nudge.title}</Text>
        <Txt size={14} leading={1.35} style={{ color: brand.paper, marginTop: 4 }} numberOfLines={2}>{nudge.line}</Txt>
      </View>
      <Pressable onPress={() => { haptic('medium'); setNudge(null); router.navigate('/run'); }} hitSlop={6} accessibilityRole="button" accessibilityLabel="Go: record now"
        style={({ pressed }) => [styles.go, pressed && { transform: [{ scale: 0.94 }] }]}>
        <Text style={[wideLabel(12, 0.06), { color: brand.ink, fontFamily: fontFamily('extrabold', 'wide') }]}>Go</Text>
      </Pressable>
      <Pressable onPress={() => { haptic(); setNudge(null); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss" style={styles.close}>
        <CloseIcon size={14} color={brand.onInkMuted} />
      </Pressable>
    </Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 50 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, backgroundColor: brand.ink, paddingVertical: 14, paddingLeft: 16, paddingRight: 30,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  go: { width: 48, height: 48, borderRadius: 24, backgroundColor: brand.volt, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', top: 8, right: 8, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
});
