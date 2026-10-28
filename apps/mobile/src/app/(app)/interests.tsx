import type { Profile } from '@jump/shared/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIcon, CalendarIcon, CheckIcon, CrownIcon, CycleIcon, FlameIcon, RunIcon, UsersIcon, WalkIcon } from '@/components/icons';
import { Button, ErrorNotice, Footer, haptic, Screen, TextLink, Txt } from '@/components/ui';
import { patch } from '@/lib/api';
import { skipInterests } from '@/lib/onboarding';
import { keys } from '@/lib/queries';
import { brand, colors, radius, wideLabel } from '@/lib/theme';

const INTERESTS = [
  { value: 'run', label: 'Running', icon: RunIcon },
  { value: 'walk', label: 'Walking', icon: WalkIcon },
  { value: 'cycle', label: 'Cycling', icon: CycleIcon },
  { value: 'compete', label: 'Winning prizes', icon: CrownIcon },
  { value: 'events', label: 'Club runs and events', icon: CalendarIcon },
  { value: 'fitness', label: 'Getting fitter', icon: FlameIcon },
  { value: 'steps', label: 'Daily steps', icon: ActivityIcon },
  { value: 'friends', label: 'Moving with friends', icon: UsersIcon },
] as const;

/** Right after sign-up: what brought you here, so Jump knows what to show you more of. */
export default function InterestsScreen() {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<string[]>([]);
  const next = () => router.replace('/welcome');
  const save = useMutation({
    mutationFn: () => patch<Profile>('/me', { interests: picked }),
    onSuccess(updated) { haptic('success'); queryClient.setQueryData(keys.profile, updated); next(); },
  });
  const toggle = (value: string) => { haptic('select'); setPicked((now) => (now.includes(value) ? now.filter((item) => item !== value) : [...now, value])); };

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top']}>
    <Screen footer={<Footer>
      <Button full size="lg" variant="primary" title={picked.length ? 'Continue' : 'Pick at least one'} disabled={!picked.length} loading={save.isPending} onPress={() => save.mutate()} />
      <View style={{ alignItems: 'center', marginTop: 10 }}><TextLink size={13} color="ink3" title="Skip for now" onPress={() => { skipInterests(); next(); }} /></View>
    </Footer>}>
      <Text style={[wideLabel(11), { color: colors.ink3 }]}>One quick question</Text>
      <Txt size={28} weight="extrabold" leading={1.15} style={{ marginTop: 6, letterSpacing: -0.4 }}>What brings you to Jump?</Txt>
      <Txt size={14} color="ink2" style={{ marginTop: 8 }}>Pick everything that fits. It helps us show you more of what you came for.</Txt>
      <View style={styles.grid}>
        {INTERESTS.map(({ value, label, icon: Icon }) => {
          const on = picked.includes(value);
          return <Pressable key={value} onPress={() => toggle(value)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}
            style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && { transform: [{ scale: 0.97 }] }]}>
            <View style={[styles.icon, on && { backgroundColor: brand.ink }]}><Icon size={20} color={on ? brand.volt : colors.ink} /></View>
            <Txt size={14} weight="bold" numberOfLines={2} style={[{ flex: 1 }, on && { color: brand.ink }]}>{label}</Txt>
            {on ? <View style={styles.check}><CheckIcon size={12} color={brand.volt} /></View> : null}
          </Pressable>;
        })}
      </View>
      <ErrorNotice error={save.error} />
    </Screen>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24, marginBottom: 16 },
  option: { width: '48%', flexGrow: 1, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card },
  optionOn: { backgroundColor: brand.volt, borderColor: brand.ink, borderWidth: 2 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.inkWash },
  check: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: brand.ink, alignItems: 'center', justifyContent: 'center' },
});
