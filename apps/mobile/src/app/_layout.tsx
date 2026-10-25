import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BOOT_INTRO_MS, BootScreen } from '@/components/BootScreen';
import { DialogHost } from '@/components/DialogHost';
import { Toaster } from '@/components/Toaster';
import { AuthProvider, useAuth } from '@/lib/auth';
import { detachRecorder, restoreRecorder } from '@/lib/recorder';
import { colors, FONT_FILES } from '@/lib/theme';

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
          <StatusBar style="dark" />
          {/* A font that fails to load falls back to the system face rather than blocking the app. */}
          <Routes fontsReady={fontsReady || Boolean(fontError)} />
          <Toaster />
          <DialogHost />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>;
}
