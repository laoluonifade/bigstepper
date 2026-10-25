import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { floatingTabInset, TabBar } from '@/components/TabBar';
import { BottomBarInset } from '@/components/ui';
import { colors } from '@/lib/theme';

/**
 * Home, Compete, Run, Rant and You. Android keeps the web's full-width bar; iOS gets it as a floating
 * Liquid Glass capsule.
 */
export default function TabsLayout() {
  // On iOS the bar floats over the screens; they leave this much room at the bottom.
  const inset = floatingTabInset(useSafeAreaInsets().bottom);
  return <BottomBarInset.Provider value={inset}><Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.paper } }}>
    <Tabs.Screen name="dashboard" />
    <Tabs.Screen name="competitions" />
    <Tabs.Screen name="run" />
    <Tabs.Screen name="feed" />
    <Tabs.Screen name="you" />
  </Tabs></BottomBarInset.Provider>;
}
