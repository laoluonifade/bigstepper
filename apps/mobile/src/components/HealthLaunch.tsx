import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { appleHealthAvailable } from '@/lib/apple-health';
import { Storage } from '@/lib/kv';
import { brand, fontFamily, radius, wideLabel } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { HEALTH_PINK, HealthMark, useAppleHealthStatus, useConnectAppleHealth } from './apple-health';
import { duelLaunchSeen } from './DuelLaunch';
import { FinishFlagIcon, RunIcon } from './icons';
import { Button, ErrorNotice, haptic, HardShadow } from './ui';

const SEEN_KEY = 'jump_seen_health_launch';

const seen = () => { try { return Storage.getItemSync(SEEN_KEY) === '1'; } catch { return true; } };
const markSeen = () => { try { Storage.setItemSync(SEEN_KEY, '1'); } catch { /* shows again next time */ } };

const STEPS = [
  { icon: RunIcon, text: 'Every step and kilometre counts in your step and walking competitions, from the moment you connect.' },
  { icon: FinishFlagIcon, text: 'Walks, runs and rides from your Apple Watch land in Jump by themselves.' },
  { icon: HeartIcon, text: 'One Rant each evening with your day’s steps. Turn it off any time in Connections.' },
];

function HeartIcon({ size, color }: { size: number; color: string }) {
  return <HealthMark size={size} color={color} />;
}

/** The once-per-phone "Apple Health is live" pop, for iPhone users who haven't connected it. Waits for the Duels pop to be seen first. */
export function HealthLaunch() {
  const status = useAppleHealthStatus();
  const [open, setOpen] = useState(false);
  const close = () => { markSeen(); setOpen(false); };
  const { connect } = useConnectAppleHealth(() => {
    close();
    toast({ tone: 'ok', message: 'Apple Health connected. Your steps are syncing.' });
  });
  const ready = status.data !== undefined && !status.data.connected;

  useEffect(() => {
    if (!ready || seen() || !duelLaunchSeen() || !appleHealthAvailable()) return;
    const timer = setTimeout(() => { setOpen(true); haptic('medium'); }, 1200);
    return () => clearTimeout(timer);
  }, [ready]);

  return <Modal visible={open} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
    <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close">
      <Animated.View entering={ZoomIn.springify().damping(14)} style={{ width: '100%', maxWidth: 400 }}>
        <Pressable onPress={() => undefined}>
          <HardShadow offset={5} radius={radius['2xl']} color={HEALTH_PINK}>
            <View style={styles.card}>
              <View style={styles.poster}>
                <Animated.View entering={FadeIn.delay(250)} style={[styles.tag, { transform: [{ rotate: '-4deg' }] }]}>
                  <Text style={[wideLabel(11), { color: brand.ink }]}>New on Jump</Text>
                </Animated.View>
                <Animated.View entering={ZoomIn.delay(300).springify()} style={styles.heart}>
                  <HealthMark size={44} color="#FFFFFF" />
                </Animated.View>
                <Text style={styles.count}>8,432</Text>
                <Text style={[wideLabel(11), { color: 'rgba(242,239,232,0.55)' }]}>steps today</Text>
                <Text style={styles.headline}>APPLE HEALTH{'\n'}IS LIVE</Text>
                <Text style={styles.sub}>Connect it once and every step you take counts on Jump.</Text>
              </View>
              <View style={styles.steps}>
                {STEPS.map(({ icon: Icon, text }, index) => <View key={index} style={styles.step}>
                  <View style={styles.stepIcon}><Icon size={18} color={brand.ink} /></View>
                  <Text style={styles.stepText}>{text}</Text>
                </View>)}
                <ErrorNotice error={connect.error} />
                <View style={{ gap: 10, marginTop: 6 }}>
                  <Button full size="lg" variant="volt" title={connect.isPending ? 'Connecting…' : 'Connect Apple Health'} disabled={connect.isPending}
                    icon={<HealthMark size={18} color={brand.ink} />} onPress={() => connect.mutate()} />
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
  poster: { alignItems: 'center', paddingTop: 22, paddingBottom: 20, paddingHorizontal: 18 },
  tag: { backgroundColor: brand.volt, borderRadius: radius.base, borderWidth: 2, borderColor: brand.ink, paddingHorizontal: 10, paddingVertical: 4 },
  heart: { width: 84, height: 84, borderRadius: 26, backgroundColor: HEALTH_PINK, borderWidth: 3, borderColor: brand.paper, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  count: { fontFamily: fontFamily('black', 'narrow'), fontSize: 44, lineHeight: 48, color: brand.paper, marginTop: 12, fontVariant: ['tabular-nums'] },
  headline: { fontFamily: fontFamily('black', 'wide'), fontSize: 34, lineHeight: 36, color: brand.paper, textAlign: 'center', marginTop: 14, letterSpacing: -0.5 },
  sub: { fontFamily: fontFamily('medium'), fontSize: 14, lineHeight: 20, color: 'rgba(242,239,232,0.75)', textAlign: 'center', marginTop: 8, maxWidth: 280 },
  steps: { gap: 12, padding: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(242,239,232,0.1)' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: brand.volt, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, fontFamily: fontFamily('medium'), fontSize: 13.5, lineHeight: 19, color: brand.paper },
});
