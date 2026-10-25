import { useQuery } from '@tanstack/react-query';
import { router, Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { onboardingSkipped, ONBOARDING_REQUIRED_SINCE } from '@/lib/onboarding';
import { useNotifications, useProfile } from '@/lib/queries';
import { setAppBadge } from '@/lib/push';
import { StandingNudge } from '@/components/StandingNudge';
import { colors, fontFamily } from '@/lib/theme';

/** Screens a runner can use before joining their first competition: the ways into one, and account basics. */
const ONBOARDING_PATHS = ['/welcome', '/competitions', '/clubs', '/you', '/verify-email', '/payments'];

/** New runners go to Welcome until they're in at least one competition (joined or hosting). */
function useOnboardingGate() {
  const pathname = usePathname();
  const profile = useProfile();
  const mine = useQuery({ queryKey: ['tables', 'mine'], queryFn: () => api<Array<{ joined: boolean }>>('/tables/mine') });
  const fresh = profile.data && new Date(profile.data.createdAt).getTime() >= ONBOARDING_REQUIRED_SINCE;
  const needed = Boolean(fresh && mine.data && !mine.data.some((row) => row.joined) && !onboardingSkipped())
    && !ONBOARDING_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  useEffect(() => {
    if (needed) router.replace('/welcome');
  }, [needed]);
}

/** Screens opened straight from a link still have the tabs underneath to go back to. */
export const unstable_settings = { initialRouteName: '(tabs)' };

/** Signed-in screens: the tabs, and everything that pushes over them with a native header and back gesture. */
export default function AppLayout() {
  useOnboardingGate();
  // The app icon's badge follows the unread count as notifications are read here.
  const unread = useNotifications().data?.filter((item) => !item.readAt).length;
  useEffect(() => { if (unread !== undefined) setAppBadge(unread); }, [unread]);
  return <>
  <Stack screenOptions={{
    headerStyle: { backgroundColor: colors.paper },
    headerShadowVisible: false,
    headerTintColor: colors.ink,
    headerTitleStyle: { fontFamily: fontFamily('extrabold', 'wide'), fontSize: 15 },
    headerBackButtonDisplayMode: 'minimal',
    headerTitleAlign: 'center',
    contentStyle: { backgroundColor: colors.paper },
  }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false }} />
    <Stack.Screen name="messages/[username]" options={{ title: '' }} />
    <Stack.Screen name="clubs/[id]/chat" options={{ title: 'Club chat' }} />
    <Stack.Screen name="competitions/new" options={{ title: 'New competition', presentation: 'modal' }} />
    <Stack.Screen name="payments/return" options={{ title: 'Payment', presentation: 'modal' }} />
  </Stack>
  {/* A few seconds after opening the app: where you stand in one of your races. */}
  <StandingNudge />
  </>;
}
