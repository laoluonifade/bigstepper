import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HEALTH_PINK, HealthMark, useConnectAppleHealth, useDailySteps } from '@/components/apple-health';
import { CheckIcon, CycleIcon, FinishFlagIcon, RunIcon, UsersIcon, WalkIcon } from '@/components/icons';
import { Button, ErrorNotice, haptic } from '@/components/ui';
import { skipHealth } from '@/lib/onboarding';
import { brand, fontFamily, radius, wideLabel } from '@/lib/theme';

type Step = 'why' | 'how' | 'done';

const WHY = [
  { icon: WalkIcon, title: 'Every step counts', body: 'Your daily steps go straight into step competitions and your weekly goal.' },
  { icon: RunIcon, title: 'Walks, runs and rides sync themselves', body: 'Recorded on your Apple Watch or another app? They land in Jump on their own.' },
  { icon: UsersIcon, title: 'Show up on the board', body: 'Friends see your steps on the Rant each evening, and you see theirs.' },
];

const ASKS = [
  { icon: WalkIcon, label: 'Steps' },
  { icon: RunIcon, label: 'Walking + Running Distance' },
  { icon: CycleIcon, label: 'Cycling Distance' },
  { icon: FinishFlagIcon, label: 'Workouts and Workout Routes' },
];

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * iPhone, after sign-in: connect Apple Health before using Jump. Apple doesn't let an app require Health
 * access, so "Not now" lets the runner through, but only until the app next opens.
 */
export default function HealthOnboarding() {
  const [step, setStep] = useState<Step>('why');
  const { connect } = useConnectAppleHealth(() => { haptic('success'); setStep('done'); });
  const days = useDailySteps();
  const steps = days.data?.find((day) => day.day === today())?.steps;
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const later = () => { skipHealth(); leave(); };

  return <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
    <View style={styles.dots} accessibilityLabel={`Step ${step === 'why' ? 1 : step === 'how' ? 2 : 3} of 3`}>
      {(['why', 'how', 'done'] as const).map((key) => <View key={key} style={[styles.dot, key === step && styles.dotOn]} />)}
    </View>
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      {step === 'why' && <Animated.View key="why" entering={FadeIn.duration(250)}>
        <Animated.View entering={ZoomIn.springify().damping(13)} style={styles.heart}><HealthMark size={48} color="#FFFFFF" /></Animated.View>
        <Text style={[wideLabel(11), styles.eyebrow]}>One last step</Text>
        <Text style={styles.headline}>CONNECT{'\n'}APPLE HEALTH</Text>
        <Text style={styles.sub}>Jump is built around your steps. Without Health, most of the app stays empty.</Text>
        <View style={styles.list}>
          {WHY.map(({ icon: Icon, title, body }, index) => <Animated.View key={title} entering={FadeInDown.delay(150 + index * 90)} style={styles.row}>
            <View style={styles.rowIcon}><Icon size={18} color={brand.ink} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{title}</Text>
              <Text style={styles.rowBody}>{body}</Text>
            </View>
          </Animated.View>)}
        </View>
      </Animated.View>}

      {step === 'how' && <Animated.View key="how" entering={FadeIn.duration(250)}>
        <Text style={[wideLabel(11), styles.eyebrow, { marginTop: 8 }]}>Next, Apple asks</Text>
        <Text style={styles.headline}>TURN ON{'\n'}ALL</Text>
        <Text style={styles.sub}>Apple shows a list of what Jump can read. Tap “Turn On All” at the top, then “Allow”.</Text>
        <View style={styles.sheet} accessible accessibilityLabel="Apple Health will ask to read steps, walking and running distance, cycling distance, and workouts">
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Health Access</Text>
            <View style={styles.turnOn}><Text style={styles.turnOnText}>Turn On All</Text></View>
          </View>
          {ASKS.map(({ icon: Icon, label }, index) => <Animated.View key={label} entering={FadeInDown.delay(120 + index * 80)} style={styles.ask}>
            <Icon size={16} color={HEALTH_PINK} />
            <Text style={styles.askText} numberOfLines={1}>{label}</Text>
            <View style={styles.toggle}><View style={styles.knob} /></View>
          </Animated.View>)}
        </View>
        <Text style={styles.note}>Jump only reads. It never writes to or changes your Health data.</Text>
        <ErrorNotice error={connect.error} />
      </Animated.View>}

      {step === 'done' && <Animated.View key="done" entering={FadeIn.duration(250)} style={{ alignItems: 'center' }}>
        <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.heart, { backgroundColor: brand.volt }]}><CheckIcon size={44} color={brand.ink} /></Animated.View>
        <Text style={[wideLabel(11), styles.eyebrow]}>You’re live</Text>
        <Text style={styles.count}>{steps === undefined ? '…' : steps.toLocaleString('en-GB')}</Text>
        <Text style={[wideLabel(11), { color: 'rgba(242,239,232,0.55)', textAlign: 'center' }]}>{steps === undefined ? 'syncing your steps' : 'steps today'}</Text>
        <Text style={[styles.sub, { marginTop: 18 }]}>From now on your steps and workouts count on Jump by themselves. Open the app any time to see where you stand.</Text>
      </Animated.View>}
    </ScrollView>

    <View style={styles.footer}>
      {step === 'why' && <Button full size="lg" variant="volt" title="Continue" onPress={() => { haptic('select'); setStep('how'); }} />}
      {step === 'how' && <Button full size="lg" variant="volt" title={connect.isPending ? 'Connecting…' : 'Connect Apple Health'} disabled={connect.isPending}
        icon={<HealthMark size={18} color={brand.ink} />} onPress={() => connect.mutate()} />}
      {step === 'done' && <Button full size="lg" variant="volt" title="Let’s go" onPress={leave} />}
      {step !== 'done' && <Pressable onPress={later} hitSlop={8} style={styles.later} accessibilityRole="button">
        <Text style={[wideLabel(12), { color: 'rgba(242,239,232,0.5)' }]}>Not now</Text>
      </Pressable>}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#141416' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(242,239,232,0.2)' },
  dotOn: { width: 22, backgroundColor: brand.volt },
  body: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 24 },
  heart: { alignSelf: 'center', width: 92, height: 92, borderRadius: 28, backgroundColor: HEALTH_PINK, borderWidth: 3, borderColor: brand.paper, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: brand.volt, textAlign: 'center', marginTop: 22 },
  headline: { fontFamily: fontFamily('black', 'wide'), fontSize: 36, lineHeight: 38, color: brand.paper, textAlign: 'center', marginTop: 10, letterSpacing: -0.5 },
  sub: { fontFamily: fontFamily('medium'), fontSize: 15, lineHeight: 21, color: 'rgba(242,239,232,0.75)', textAlign: 'center', marginTop: 10, alignSelf: 'center', maxWidth: 320 },
  list: { gap: 16, marginTop: 28 },
  row: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  rowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: brand.volt, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: fontFamily('bold'), fontSize: 15, color: brand.paper },
  rowBody: { fontFamily: fontFamily('medium'), fontSize: 13.5, lineHeight: 19, color: 'rgba(242,239,232,0.65)', marginTop: 2 },
  sheet: { marginTop: 26, borderRadius: radius.xl, backgroundColor: '#1F1F22', borderWidth: 1, borderColor: 'rgba(242,239,232,0.1)', overflow: 'hidden' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(242,239,232,0.08)' },
  sheetTitle: { fontFamily: fontFamily('bold'), fontSize: 15, color: brand.paper },
  turnOn: { borderRadius: 999, borderWidth: 2, borderColor: brand.volt, paddingHorizontal: 10, paddingVertical: 4 },
  turnOnText: { fontFamily: fontFamily('bold'), fontSize: 13, color: brand.volt },
  ask: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(242,239,232,0.08)' },
  askText: { flex: 1, fontFamily: fontFamily('medium'), fontSize: 14, color: brand.paper },
  toggle: { width: 42, height: 26, borderRadius: 13, backgroundColor: '#34C759', padding: 2, alignItems: 'flex-end' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' },
  note: { fontFamily: fontFamily('medium'), fontSize: 12.5, lineHeight: 18, color: 'rgba(242,239,232,0.5)', textAlign: 'center', marginTop: 14 },
  count: { fontFamily: fontFamily('black', 'narrow'), fontSize: 64, lineHeight: 68, color: brand.paper, marginTop: 10, fontVariant: ['tabular-nums'] },
  footer: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 8 },
  later: { alignSelf: 'center', padding: 10, marginTop: 6 },
});
