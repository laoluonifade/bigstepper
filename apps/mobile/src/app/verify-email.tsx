import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { AuthHeading, AuthScreen } from '@/components/auth';
import { Button, ErrorNotice, Loading, Notice, TextField, Txt } from '@/components/ui';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { storageKeys, writeStored } from '@/lib/local';

/** Opened from the verification email (with a token) or from the app. Works signed in or out. */
export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const auth = useAuth();
  const [manualToken, setManualToken] = useState('');
  const started = useRef(false);
  const verify = useMutation({
    mutationFn: (token: string) => post<{ success: boolean }>('/auth/verify-email', { token }),
    onSuccess() {
      if (auth.user) {
        writeStored(storageKeys.verifyPrompt(auth.user.id), false);
        auth.updateUser({ emailVerified: true });
      }
    },
  });
  const resend = useMutation({ mutationFn: () => post<{ success: boolean; alreadyVerified: boolean }>('/auth/verify-email/resend') });

  useEffect(() => {
    if (params.token && !started.current) {
      started.current = true;
      verify.mutate(params.token);
    }
  }, [params.token, verify]);

  const done = () => (router.canGoBack() ? router.back() : router.replace(auth.user ? '/dashboard' : '/login'));
  const header = <Stack.Screen options={{ headerShown: Boolean(auth.user), title: 'Verify email', headerBackButtonDisplayMode: 'minimal' }} />;

  if (verify.isSuccess || auth.user?.emailVerified || resend.data?.alreadyVerified) {
    return <AuthScreen>
      {header}
      <AuthHeading eyebrow="All set" title="Email verified">{verify.isSuccess ? 'You can now enter paid competitions when they’re available.' : `${auth.user?.email ?? 'Your email'} is already verified.`}</AuthHeading>
      <Button full title={auth.user ? 'Done' : 'Log in'} onPress={done} />
    </AuthScreen>;
  }

  if (params.token && verify.isPending) return <AuthScreen>{header}<Loading label="Verifying your email" /></AuthScreen>;

  return <AuthScreen>
    {header}
    <AuthHeading eyebrow="Account" title="Verify your email">
      {auth.user
        ? <Txt size={15} color="ink2" leading={1.55}>We sent a link to <Txt size={15} weight="semibold">{auth.user.email}</Txt>. Open it on any device to verify. Check spam if it’s not in your inbox.</Txt>
        : 'Open the link in your verification email. If you have a code instead, paste it below.'}
    </AuthHeading>
    {verify.error && params.token && !manualToken ? <Notice tone="warn" title="That link didn’t work" style={{ marginBottom: 24 }}>
      {`It may have expired or already been used.${auth.user ? ' Send a fresh one below.' : ' Log in to send a fresh one.'}`}
    </Notice> : null}
    {auth.user && <View style={{ marginBottom: 32, gap: 16 }}>
      <Button full variant="secondary" loading={resend.isPending} title={resend.isPending ? 'Sending…' : resend.isSuccess ? 'Send another email' : 'Resend verification email'} onPress={() => resend.mutate()} />
      {resend.isSuccess && !resend.data.alreadyVerified && <Notice tone="ok">Sent. The new link replaces any earlier ones.</Notice>}
      <ErrorNotice error={resend.error} />
    </View>}
    <View style={{ gap: 20 }}>
      <TextField label="Verification code" value={manualToken} onChangeText={setManualToken} autoCapitalize="none" autoCorrect={false} style={{ fontFamily: 'JetBrainsMono-Regular', fontSize: 14 }} />
      <ErrorNotice error={params.token && !manualToken ? null : verify.error} />
      <Button full title={verify.isPending ? 'Verifying…' : 'Verify email'} loading={verify.isPending} disabled={!manualToken.trim()} onPress={() => verify.mutate(manualToken.trim())} />
    </View>
  </AuthScreen>;
}
