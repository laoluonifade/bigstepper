import { Stack } from 'expo-router';
import { View } from 'react-native';
import { AppleHealthConnection } from '@/components/apple-health';
import { StravaConnection } from '@/components/strava';
import { Screen, Txt } from '@/components/ui';

/** Apps that send walks, runs and rides into Jump, in one place instead of on the profile card. */
export default function ConnectionsScreen() {
  return <Screen>
    <Stack.Screen options={{ title: 'Connections' }} />
    <Txt size={14} color="ink2" leading={1.5} style={{ marginBottom: 8 }}>
      Bring in walks, runs and rides you record with other apps and watches. Each one is checked like any Jump activity before it counts on a leaderboard.
    </Txt>
    <View>
      <StravaConnection />
      <AppleHealthConnection />
    </View>
  </Screen>;
}
