import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { Storage } from '@/lib/kv';
import { useProfile } from '@/lib/queries';
import { brand, fontFamily, radius, wideLabel } from '@/lib/theme';
import { ArenaBackdrop, VsBurst } from './Duel';
import { CrownIcon, DuelIcon, FinishFlagIcon } from './icons';
import { Avatar, Button, haptic, HardShadow } from './ui';

const SEEN_KEY = 'jump_seen_duel_launch';

const seen = () => { try { return Storage.getItemSync(SEEN_KEY) === '1'; } catch { return true; } };
const markSeen = () => { try { Storage.setItemSync(SEEN_KEY, '1'); } catch { /* shows again next time */ } };

const STEPS = [
  { icon: DuelIcon, text: 'Open any chat and tap the swords. Pick the distance and the clock.' },
  { icon: FinishFlagIcon, text: 'They hold to accept. You both tap Ready and the race goes live.' },
  { icon: CrownIcon, text: 'First there wins, or the farthest when time runs out. The win goes in your trophy cabinet.' },
];

/** The once-per-phone "Duels are live" pop: a fight poster with you in the orange corner. */
export function DuelLaunch() {
  const profile = useProfile();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (seen()) return;
    const timer = setTimeout(() => { setOpen(true); haptic('medium'); }, 1200);
    return () => clearTimeout(timer);
  }, []);

  const close = () => { markSeen(); setOpen(false); };
  const go = () => { close(); router.push('/messages'); };
  const me = profile.data;

  return <Modal visible={open} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
    <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close">
      <Animated.View entering={ZoomIn.springify().damping(14)} style={{ width: '100%', maxWidth: 400 }}>
        <Pressable onPress={() => undefined}>
          <HardShadow offset={5} radius={radius['2xl']} color={brand.volt}>
            <View style={styles.card}>
              <View style={styles.poster}>
                <ArenaBackdrop />
                <Animated.View entering={FadeIn.delay(250)} style={[styles.tag, { transform: [{ rotate: '-4deg' }] }]}>
                  <Text style={[wideLabel(11), { color: brand.ink }]}>New on Jump</Text>
                </Animated.View>
                <View style={styles.faceoff}>
                  <View style={[styles.ring, { borderColor: brand.track }]}>
                    <Avatar name={me?.displayName ?? 'You'} src={me?.avatarUrl} size={72} round />
                  </View>
                  <Animated.View entering={ZoomIn.delay(350).springify()}><VsBurst size={84} /></Animated.View>
                  <View style={[styles.ring, styles.mystery, { borderColor: brand.volt }]}>
                    <Text style={{ fontFamily: fontFamily('black', 'wide'), fontSize: 34, color: brand.volt }}>?</Text>
                  </View>
                </View>
                <Text style={styles.headline}>DUELS{'\n'}ARE LIVE</Text>
                <Text style={styles.sub}>Race anyone on Jump, head to head, wherever you both are.</Text>
              </View>
              <View style={styles.steps}>
                {STEPS.map(({ icon: Icon, text }, index) => <View key={index} style={styles.step}>
                  <View style={styles.stepIcon}><Icon size={18} color={brand.ink} /></View>
                  <Text style={styles.stepText}>{text}</Text>
                </View>)}
                <View style={{ gap: 10, marginTop: 6 }}>
                  <Button full size="lg" variant="volt" title="Challenge someone" icon={<DuelIcon size={18} color={brand.ink} />} onPress={go} />
                  <Pressable onPress={close} hitSlop={8} style={{ alignSelf: 'center', padding: 6 }}>
                    <Text style={[wideLabel(12), { color: 'rgba(242,239,232,0.6)' }]}>Maybe later</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </HardShadow>
        </Pressable>
      </Animated.View>
    </Pressable>
  </Modal>;
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { borderRadius: radius['2xl'], borderWidth: 2, borderColor: brand.ink, backgroundColor: '#141416', overflow: 'hidden' },
  poster: { alignItems: 'center', paddingTop: 22, paddingBottom: 20, paddingHorizontal: 18, overflow: 'hidden' },
  tag: { backgroundColor: brand.volt, borderRadius: radius.base, borderWidth: 2, borderColor: brand.ink, paddingHorizontal: 10, paddingVertical: 4 },
  faceoff: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18 },
  ring: { width: 84, height: 84, borderRadius: 42, borderWidth: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.ink },
  mystery: { backgroundColor: '#1E1E21' },
  headline: { fontFamily: fontFamily('black', 'wide'), fontSize: 38, lineHeight: 40, color: brand.paper, textAlign: 'center', marginTop: 16, letterSpacing: -0.5 },
  sub: { fontFamily: fontFamily('medium'), fontSize: 14, lineHeight: 20, color: 'rgba(242,239,232,0.75)', textAlign: 'center', marginTop: 8, maxWidth: 280 },
  steps: { gap: 12, padding: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(242,239,232,0.1)' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: brand.volt, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, fontFamily: fontFamily('medium'), fontSize: 13.5, lineHeight: 19, color: brand.paper },
});
