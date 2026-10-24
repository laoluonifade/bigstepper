import { Redirect, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlobalBoard } from '@/components/GlobalBoard';
import { JumpLogo } from '@/components/icons';
import { Button, Footer, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, GUTTER } from '@/lib/theme';

/**
 * The app opens at `/`. Signed in, that's home; signed out, it's the global leaderboard, so the first thing
 * you see is who's moving this week, with the way to join them pinned underneath.
 */
export default function Index() {
  const { status } = useAuth();
  const insets = useSafeAreaInsets();
  if (status === 'signed-in') return <Redirect href="/dashboard" />;
  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <View style={[styles.bar, { paddingTop: insets.top, height: insets.top + 54 }]}>
      <JumpLogo height={24} />
      <Button variant="quiet" size="sm" title="Log in" onPress={() => router.push('/login')} />
    </View>
    <GlobalBoard guest />
    <Footer style={{ gap: 6 }}>
      <Button title="Join free" full onPress={() => router.push('/register')} />
      <Txt size={12} color="ink3" align="center">Every verified walk, run and ride puts you on the board.</Txt>
    </Footer>
  </View>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, backgroundColor: colors.paper },
});
