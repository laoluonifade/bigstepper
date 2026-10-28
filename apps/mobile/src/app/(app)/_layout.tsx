import { useQuery } from '@tanstack/react-query';
import { router, Stack, usePathname, type Href } from 'expo-router';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { INTERESTS_REQUIRED_SINCE, interestsWereSkipped, onboardingSkipped, ONBOARDING_REQUIRED_SINCE } from '@/lib/onboarding';
import { useNotifications, useProfile } from '@/lib/queries';
import { setAppBadge } from '@/lib/push';
import { StandingNudge } from '@/components/StandingNudge';
import { TrophyCelebration } from '@/components/Trophies';
import { ReportHost } from '@/components/Safety';
import { UsernamePrompt } from '@/components/UsernamePrompt';
import { colors, fontFamily } from '@/lib/theme';

/** Screens a runner can use before joining their first competition: the ways into one, and account basics. */
const ONBOARDING_PATHS = ['/interests', '/welcome', '/competitions', '/clubs', '/you', '/verify-email', '/payments'];

/**
 * New runners finish their profile first (Apple and Google sign-ups arrive without a username), then go
 * to Welcome until they're in at least one competition (joined or hosting).
 */
function useOnboardingGate() {
  const pathname = usePathname();
  const profile = useProfile();
  const mine = useQuery({ queryKey: ['tables', 'mine'], queryFn: () => api<Array<{ joined: boolean }>>('/tables/mine') });
  const fresh = profile.data && new Date(profile.data.createdAt).getTime() >= ONBOARDING_REQUIRED_SINCE;
  const setup = Boolean(fresh && profile.data?.usernameChosen === false) && pathname !== '/setup';
  const asked = Boolean(profile.data && new Date(profile.data.createdAt).getTime() >= INTERESTS_REQUIRED_SINCE);
  const interests = !setup && pathname !== '/setup' && pathname !== '/interests' && asked && (profile.data?.interests ?? []).length === 0 && !interestsWereSkipped();
  const welcome = !setup && !interests && pathname !== '/setup' && Boolean(fresh && mine.data && !mine.data.some((row) => row.joined) && !onboardingSkipped())
    && !ONBOARDING_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  useEffect(() => {
    if (setup) router.replace('/setup' as Href);
    else if (interests) router.replace('/interests' as Href);
    else if (welcome) router.replace('/welcome');
  }, [setup, interests, welcome]);
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
    <Stack.Screen name="setup" options={{ headerShown: false, gestureEnabled: false }} />
    <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false }} />
    <Stack.Screen name="interests" options={{ headerShown: false, gestureEnabled: false }} />
    <Stack.Screen name="messages/[username]" options={{ title: '' }} />
    <Stack.Screen name="clubs/[id]/chat" options={{ title: 'Club chat' }} />
    <Stack.Screen name="competitions/new" options={{ title: 'New competition', presentation: 'modal' }} />
    <Stack.Screen name="events/edit" options={{ title: 'Event', presentation: 'modal' }} />
    <Stack.Screen name="events/guests" options={{ title: 'Guest list' }} />
    <Stack.Screen name="events/scan" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
    <Stack.Screen name="payments/return" options={{ title: 'Payment', presentation: 'modal' }} />
  </Stack>
  {/* A few seconds after opening the app: where you stand in one of your races. */}
  <StandingNudge />
  {/* A new podium finish: the medal drops in, once. */}
  <TrophyCelebration />
  {/* Still on the generated sign-up username: pick your own. */}
  <UsernamePrompt />
  <ReportHost />
  </>;
}
