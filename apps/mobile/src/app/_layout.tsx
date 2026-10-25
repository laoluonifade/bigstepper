import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { reloadAppAsync } from 'expo';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BOOT_INTRO_MS, BootScreen } from '@/components/BootScreen';
import { DialogHost } from '@/components/DialogHost';
import { Toaster } from '@/components/Toaster';
import { AuthProvider, useAuth } from '@/lib/auth';
import { detachRecorder, restoreRecorder, useRecorder } from '@/lib/recorder';
import { listenForPush, registerForPush } from '@/lib/push';
import { colors, FONT_FILES, scheme, systemSchemeChanged } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

function Routes({ fontsReady }: { fontsReady: boolean }) {
  const { status, user } = useAuth();
  const queryClient = useQueryClient();
  const signedIn = status === 'signed-in';
  const ready = fontsReady && status !== 'checking';
  // The animated logo plays its intro in full even when the app is ready sooner, then fades over it.
  const [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIntroDone(true), BOOT_INTRO_MS);
    return () => clearTimeout(timer);
  }, []);

  // The recorder outlives screens; it picks up a run in progress as soon as we know who's signed in.
  useEffect(() => {
    if (user) void restoreRecorder(user.id, queryClient);
    else if (status === 'signed-out') void detachRecorder();
  }, [queryClient, status, user]);

  // Signed in: this phone gets pushes, and tapping one opens what it's about.
  useEffect(() => {
    if (!user) return;
    void registerForPush();
    return listenForPush(queryClient);
    // Once per runner signing in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // On "System default", follow the phone when it switches between light and dark: colours are fixed
  // per launch, so restart into the new one when Jump comes back to the front, never mid-activity.
  const phase = useRecorder().phase;
  const live = useRef(false);
  live.current = phase === 'recording' || phase === 'paused' || phase === 'finishing' || phase === 'locating';
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && systemSchemeChanged() && !live.current) void reloadAppAsync('System theme changed');
    });
    return () => subscription.remove();
  }, []);

  return <>
    {ready && <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>}
    {/* The native splash hands over to the animated logo as soon as it's on screen. */}
    {!(ready && introDone) && <BootScreen onShown={() => void SplashScreen.hideAsync()} />}
  </>;
}

export default function RootLayout() {
  const [fontsReady, fontError] = useFonts(FONT_FILES);
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }));
  return <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.paper }}>
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          {/* A font that fails to load falls back to the system face rather than blocking the app. */}
          <Routes fontsReady={fontsReady || Boolean(fontError)} />
          <Toaster />
          <DialogHost />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>;
}
