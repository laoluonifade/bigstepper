import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '@/components/TabBar';
import { colors } from '@/lib/theme';

/** The web's mobile tab bar, drawn the same way: Home, Compete, the raised Run button, Rant and You. */
export default function TabsLayout() {
  return <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.paper } }}>
    <Tabs.Screen name="dashboard" />
    <Tabs.Screen name="competitions" />
    <Tabs.Screen name="run" />
    <Tabs.Screen name="feed" />
    <Tabs.Screen name="you" />
  </Tabs>;
}
