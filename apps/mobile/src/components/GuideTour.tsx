import { router } from 'expo-router';
import { ComponentRef, RefObject, useContext, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Storage } from '@/lib/kv';
import { brand, fontFamily, radius, wideLabel } from '@/lib/theme';
import { BottomBarInset, Button, haptic, Txt } from './ui';

const SEEN_KEY = 'jump_tour_events_leaderboard_v2';
/** The duels pop-up goes first; the tour waits for a later open rather than stacking on top of it. */
const DUEL_LAUNCH_KEY = 'jump_seen_duel_launch';
const PAD = 6;

const read = (key: string) => { try { return Storage.getItemSync(key); } catch { return '1'; } };
const markSeen = () => { try { Storage.setItemSync(SEEN_KEY, '1'); } catch { /* shows again next time */ } };

type Frame = { x: number; y: number; width: number; height: number };

/**
 * A two-step tour on Home, once per phone: where the leaderboard lives now, then the new Events. The
 * screen dims around what it's pointing at, with a short card and a way on.
 */
export function GuideTour({ leaderboard }: { leaderboard: RefObject<ComponentRef<typeof View> | null> }) {
  const { width, height } = useWindowDimensions();
  const barInset = useContext(BottomBarInset);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [frame, setFrame] = useState<Frame | null>(null);

  // Home moves as its cards load, so the card is measured until it has stayed put for a moment, and keeps
  // being followed while the tour is open. Only then does the spotlight go on.
  useEffect(() => {
    if (read(SEEN_KEY) === '1' || read(DUEL_LAUNCH_KEY) !== '1') return;
    let last: Frame | null = null;
    let steady = 0;
    let shown = false;
    const started = Date.now();
    const timer = setInterval(() => {
      if (shown && read(SEEN_KEY) === '1') { clearInterval(timer); return; }
      leaderboard.current?.measureInWindow((x, y, w, h) => {
        if (!w || !h) return;
        const now = { x, y, width: w, height: h };
        const same = last && Math.abs(last.y - y) < 1 && Math.abs(last.height - h) < 1;
        steady = same ? steady + 1 : 0;
        last = now;
        if (shown) { if (!same) setFrame(now); return; }
        if (steady >= 3 && Date.now() - started > 1800 && y > 0 && y + h < height) {
          shown = true;
          setFrame(now);
          setStep(1);
        }
      });
    }, 300);
    return () => clearInterval(timer);
  }, [leaderboard, height]);

  if (!step) return null;
  const finish = () => { markSeen(); setStep(0); };
  const next = () => { haptic('select'); setStep(2); };

  const hole = step === 1 && frame ? { x: frame.x - PAD, y: frame.y - PAD, w: frame.width + PAD * 2, h: frame.height + PAD * 2 } : null;
  // The card goes on whichever side of the spotlight has room, so it never sits on top of it.
  const roomBelow = hole ? height - (hole.y + hole.h) - barInset : 0;
  const cardTop = hole && roomBelow > 230 ? hole.y + hole.h + 14 : undefined;
  const cardBottom = hole && cardTop === undefined ? height - hole.y + 14 : undefined;
  // The Compete tab is the second of five across the floating bar.
  const competeX = width * 0.3;

  return <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={finish}>
    <Animated.View entering={FadeIn.duration(200)} style={StyleSheet.absoluteFill}>
      {hole ? <>
        <View style={[styles.dim, { left: 0, right: 0, top: 0, height: hole.y }]} />
        <View style={[styles.dim, { left: 0, right: 0, top: hole.y + hole.h, bottom: 0 }]} />
        <View style={[styles.dim, { left: 0, width: hole.x, top: hole.y, height: hole.h }]} />
        <View style={[styles.dim, { left: hole.x + hole.w, right: 0, top: hole.y, height: hole.h }]} />
        <View pointerEvents="none" style={[styles.ring, { left: hole.x, top: hole.y, width: hole.w, height: hole.h }]} />
      </> : <View style={[styles.dim, StyleSheet.absoluteFill]} />}

      {step === 1 ? <Animated.View key="one" entering={FadeInDown.duration(260)} style={[styles.card, { top: cardTop, bottom: cardBottom }]}>
        <Text style={[wideLabel(11), { color: brand.track }]}>1 of 2</Text>
        <Txt size={20} weight="extrabold" style={{ color: brand.paper, marginTop: 4 }}>The leaderboard lives here now</Txt>
        <Txt size={14} leading={1.45} style={{ color: brand.onInkMuted, marginTop: 6 }}>Your rank this week and the gap to the runner just ahead. Tap the card any time for the full board.</Txt>
        <View style={styles.actions}>
          <Pressable onPress={finish} hitSlop={8}><Txt size={13} weight="semibold" style={{ color: brand.onInkMuted }}>Skip</Txt></Pressable>
          <Button variant="volt" size="sm" title="Next" onPress={next} />
        </View>
      </Animated.View> : <>
        <Animated.View key="two" entering={FadeInDown.duration(260)} style={[styles.card, { bottom: barInset + 30 }]}>
          <View style={styles.newTag}><Text style={[wideLabel(10), { color: brand.ink }]}>New</Text></View>
          <Txt size={20} weight="extrabold" style={{ color: brand.paper, marginTop: 8 }}>Events are here</Txt>
          <Txt size={14} leading={1.45} style={{ color: brand.onInkMuted, marginTop: 6 }}>Clubs now post runs, rides and race days. Find ones near you under Compete, get your pass, and we’ll remind you before each one.</Txt>
          <View style={styles.actions}>
            <Pressable onPress={finish} hitSlop={8}><Txt size={13} weight="semibold" style={{ color: brand.onInkMuted }}>Done</Txt></Pressable>
            <Button variant="volt" size="sm" title="Show me" onPress={() => { finish(); router.navigate({ pathname: '/competitions', params: { lens: 'events' } }); }} />
          </View>
        </Animated.View>
        <View pointerEvents="none" style={[styles.pointer, { left: competeX - 10, bottom: barInset + 14 }]} />
      </>}
    </Animated.View>
  </Modal>;
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.68)' },
  ring: { position: 'absolute', borderRadius: 22, borderWidth: 3, borderColor: brand.volt },
  card: { position: 'absolute', left: 16, right: 16, borderRadius: radius['2xl'], borderWidth: 2, borderColor: brand.ink, backgroundColor: '#141416', padding: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  newTag: { alignSelf: 'flex-start', transform: [{ rotate: '-3deg' }], borderRadius: radius.base, borderWidth: 2, borderColor: brand.ink, backgroundColor: brand.volt, paddingHorizontal: 8, paddingVertical: 3 },
  pointer: { position: 'absolute', width: 20, height: 20, backgroundColor: '#141416', borderRightWidth: 2, borderBottomWidth: 2, borderColor: brand.ink, transform: [{ rotate: '45deg' }] },
});
