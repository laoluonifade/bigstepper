import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RecommendedJoin } from '@/components/CompeteHome';
import { PlusIcon } from '@/components/icons';
import { Screen, TextLink, Txt, useNow } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { skipOnboarding } from '@/lib/onboarding';
import { useUnit } from '@/lib/queries';
import { colors, radius } from '@/lib/theme';

/**
 * First stop after sign-up, and required: join at least one free competition (or start your own) so the
 * first run already counts. The app keeps bringing new runners back here until they're in one.
 */
export default function WelcomeScreen() {
  const user = useUser();
  const unit = useUnit();
  const now = useNow(60_000);
  const done = () => router.replace('/dashboard');
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top']}>
    <Screen>
      <Txt size={13} weight="medium" color="ink3">{`Welcome${user.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}`}</Txt>
      <Txt size={26} weight="extrabold" leading={1.2} style={{ marginTop: 2 }}>Join your first competition</Txt>
      <Txt size={14} color="ink2" style={{ marginTop: 8 }}>Jump is better with someone to beat. Pick at least one free competition to get started; your first run counts toward a rank straight away.</Txt>
      <View style={{ marginTop: 24 }}>
        <RecommendedJoin unit={unit} now={now} limit={8} title="Free to join" freeOnly onDone={done}
          // Nothing free to join yet: don't trap anyone on this screen.
          empty={<View style={styles.empty}>
            <Txt size={15} weight="bold" align="center">No open free competitions right now</Txt>
            <Txt size={13} color="ink3" align="center" style={{ marginTop: 4 }}>Start one and invite your people, or look around first.</Txt>
            <View style={{ alignItems: 'center', marginTop: 16 }}><TextLink size={13} color="ink2" title="Continue to Jump" onPress={() => { skipOnboarding(); done(); }} /></View>
          </View>} />
      </View>
      <View style={styles.own}>
        <Txt size={13} color="ink2" style={{ flex: 1 }}>Rather race your own people?</Txt>
        <Pressable onPress={() => router.push('/competitions/new')} style={styles.start} accessibilityRole="button"><PlusIcon size={14} color={colors.paper} /><Txt size={13} weight="bold" color="paper">Start one</Txt></Pressable>
      </View>
      <View style={{ alignItems: 'center', marginTop: 16 }}><TextLink size={13} color="ink2" title="Browse all competitions" onPress={() => { skipOnboarding(); router.replace('/competitions'); }} /></View>
    </Screen>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  empty: { borderRadius: radius['2xl'], borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(18,18,18,0.3)', paddingHorizontal: 16, paddingVertical: 32 },
  own: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24, borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 12 },
  start: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.full, backgroundColor: colors.ink, paddingHorizontal: 14, paddingVertical: 8 },
});
