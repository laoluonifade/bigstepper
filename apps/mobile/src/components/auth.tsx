import type { AuthResponse } from '@jump/shared/types';
import { useMutation } from '@tanstack/react-query';
import { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, display, fontFamily, GUTTER, radius, scheme } from '@/lib/theme';
import { JumpLogo } from './icons';
import { ErrorNotice, Eyebrow, haptic, Txt } from './ui';

/** The web's AuthLayout on a phone: the wordmark, then the form centred in what's left. */
export function AuthScreen({ children }: { children: ReactNode }) {
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top', 'bottom']}>
    {/* Both platforms pad for the keyboard: Android draws edge to edge, so the window no longer shrinks for it. */}
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <JumpLogo height={26} />
        <View style={styles.form}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export function AuthHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <View style={{ marginBottom: 28 }}>
    <Eyebrow style={{ marginBottom: 8 }}>{eyebrow}</Eyebrow>
    <Text style={display(32)} accessibilityRole="header">{title}</Text>
    {children ? typeof children === 'string' ? <Txt size={15} color="ink2" leading={1.55} style={{ marginTop: 12 }}>{children}</Txt> : <View style={{ marginTop: 12 }}>{children}</View> : null}
  </View>;
}

export function OrDivider() {
  return <View style={styles.or} importantForAccessibility="no-hide-descendants">
    <View style={styles.orLine} />
    <Txt size={13} color="ink3">or</Txt>
    <View style={styles.orLine} />
  </View>;
}

/** OAuth client ids (public). The web one is the ID token's audience; iOS also needs its own. */
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

type GoogleModule = typeof import('@react-native-google-signin/google-signin');
/** Null in Expo Go, in a build from before Google sign-in, or before the client ids are set. */
const google: GoogleModule | null = (() => {
  if (!GOOGLE_WEB_CLIENT_ID) return null;
  try {
    const module = require('@react-native-google-signin/google-signin') as GoogleModule;
    module.GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID });
    return module;
  } catch {
    return null;
  }
})();

/** The phone's region ("en-NG" → "NG"), for a new account's country. */
function deviceRegion() {
  try {
    const region = Intl.DateTimeFormat().resolvedOptions().locale.split('-').find((part) => /^[A-Z]{2}$/.test(part));
    return region ?? undefined;
  } catch {
    return undefined;
  }
}

/** "Continue with Google": Google's sheet, then the API signs in, links the account with that email, or creates one. */
export function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
  const auth = useAuth();
  const signIn = useMutation({
    mutationFn: async () => {
      if (!google) throw new Error('Google sign-in isn’t available in this version of Jump');
      await google.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await google.GoogleSignin.signIn();
      if (!google.isSuccessResponse(result)) return null; // closed the sheet
      if (!result.data.idToken) throw new Error('Google didn’t send back a sign-in. Try again.');
      return post<AuthResponse>('/auth/google', { idToken: result.data.idToken, countryCode: deviceRegion() });
    },
    onSuccess(response) {
      if (!response) return;
      haptic('success');
      auth.authenticate(response);
    },
  });
  if (!google) return null;
  return <View style={{ marginBottom: 12 }}>
    <Pressable onPress={() => signIn.mutate()} disabled={signIn.isPending} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.google, pressed && { opacity: 0.8 }]}>
      {signIn.isPending ? <ActivityIndicator color="#1F1F1F" /> : <GoogleG />}
      <Text style={styles.googleText}>{label}</Text>
    </Pressable>
    {signIn.error ? <View style={{ marginTop: 8 }}><ErrorNotice error={signIn.error} /></View> : null}
  </View>;
}

type AppleModule = typeof import('expo-apple-authentication');
/** iPhone only, and null in a build from before Sign in with Apple. */
const apple: AppleModule | null = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    return require('expo-apple-authentication') as AppleModule;
  } catch {
    return null;
  }
})();

/**
 * "Sign in with Apple", Apple's own button, as App Review requires next to Google. Apple shares the name
 * and email only the first time, so they go to the API straight away.
 */
export function AppleButton({ signUp = false }: { signUp?: boolean }) {
  const auth = useAuth();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    void apple?.isAvailableAsync().then(setAvailable).catch(() => setAvailable(false));
  }, []);
  const signIn = useMutation({
    mutationFn: async () => {
      if (!apple) throw new Error('Sign in with Apple isn’t available in this version of Jump');
      let credential: Awaited<ReturnType<AppleModule['signInAsync']>>;
      try {
        credential = await apple.signInAsync({ requestedScopes: [apple.AppleAuthenticationScope.FULL_NAME, apple.AppleAuthenticationScope.EMAIL] });
      } catch (error) {
        if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null; // closed the sheet
        throw error;
      }
      if (!credential.identityToken) throw new Error('Apple didn’t send back a sign-in. Try again.');
      const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
      return post<AuthResponse>('/auth/apple', {
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode ?? undefined,
        displayName: name || undefined,
        countryCode: deviceRegion(),
      });
    },
    onSuccess(response) {
      if (!response) return;
      haptic('success');
      auth.authenticate(response);
    },
  });
  if (!apple || !available) return null;
  const Button = apple.AppleAuthenticationButton;
  return <View style={{ marginBottom: 12 }}>
    <View style={signIn.isPending && { opacity: 0.6 }} pointerEvents={signIn.isPending ? 'none' : 'auto'}>
      <Button
        buttonType={signUp ? apple.AppleAuthenticationButtonType.SIGN_UP : apple.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={scheme === 'dark' ? apple.AppleAuthenticationButtonStyle.WHITE : apple.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={radius.base}
        style={{ height: 46, width: '100%' }}
        onPress={() => signIn.mutate()}
      />
    </View>
    {signIn.error ? <View style={{ marginTop: 8 }}><ErrorNotice error={signIn.error} /></View> : null}
  </View>;
}

/** Google's four-colour G, as their sign-in guidelines ask. */
function GoogleG() {
  return <Svg width={18} height={18} viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </Svg>;
}

const STRAVA_REVIEW_MESSAGE = 'Not available at the moment. We’re working to increase our limits, and our request is under review by Strava.';

/** Strava sign-in, paused while Strava reviews Jump's connection limits (as on the web). */
export function StravaButton({ label = 'Continue with Strava' }: { label?: string }) {
  return <View>
    <View style={styles.strava} accessibilityRole="button" accessibilityState={{ disabled: true }} accessibilityLabel={label}>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill={colors.white}><Path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" /></Svg>
      <Text style={styles.stravaText}>{label}</Text>
    </View>
    <Txt size={12} color="ink3" align="center" leading={1.5} style={{ marginTop: 8 }}>{STRAVA_REVIEW_MESSAGE}</Txt>
  </View>;
}

const styles = StyleSheet.create({
  body: { flexGrow: 1, paddingHorizontal: GUTTER + 4, paddingTop: 12, paddingBottom: 32 },
  form: { flex: 1, justifyContent: 'center', paddingVertical: 32, width: '100%', maxWidth: 420, alignSelf: 'center' },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  google: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 46, borderRadius: radius.base, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#747775' },
  googleText: { fontFamily: fontFamily('semibold'), fontSize: 15, color: '#1F1F1F' },
  strava: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, borderRadius: radius.base, backgroundColor: '#FC5200', opacity: 0.6 },
  stravaText: { fontFamily: fontFamily('bold', 'wide'), fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.white },
});
