import { router, Stack } from 'expo-router';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Txt } from '@/components/ui';
import { colors, score } from '@/lib/theme';

/** A link to a screen that doesn't exist: the web's 404, with the lanes bending off the page. */
export default function NotFoundScreen() {
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
      <Svg viewBox="0 0 320 150" width="100%" height={140} style={{ maxWidth: 320 }}>
        {[0, 1, 2, 3].map((lane) => <Path key={lane} d={`M0 ${140 - lane * 18}C90 ${136 - lane * 20} 170 ${108 - lane * 22} 240 ${60 - lane * 14}`} fill="none" stroke={lane === 1 ? colors.track : 'rgba(18,18,18,0.15)'} strokeWidth="3" />)}
        <Path d="M262 30h40v26h-40z" fill="none" stroke={colors.ink} strokeWidth="3" />
        <Path d="M262 30v70" stroke={colors.ink} strokeWidth="3" />
        <Path d="M276 40h12M276 47h8" stroke={colors.ink} strokeWidth="3" />
      </Svg>
      <Text style={[score(80), { marginTop: 24 }]}>404</Text>
      <Txt size={24} weight="extrabold" align="center" style={{ marginTop: 12 }}>This page took a wrong turn</Txt>
      <Txt size={15} color="ink2" align="center" leading={1.55} style={{ marginTop: 8, maxWidth: 320 }}>The link may be old or mistyped. Head back and pick up the route from there.</Txt>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 28 }}>
        <Button variant="secondary" title="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Button title="Home" onPress={() => router.replace('/')} />
      </View>
    </View>
  </SafeAreaView>;
}
