import type { AuthResponse } from '@jump/shared/types';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { AuthHeading, AuthScreen, SocialSignIn } from '@/components/auth';
import { Button, ErrorNotice, Notice, TextField, TextLink, Txt, type TextFieldRef } from '@/components/ui';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function LoginScreen() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<TextFieldRef>(null);
  const login = useMutation({
    mutationFn: () => post<AuthResponse>('/auth/login', { email: email.trim(), password }),
    onSuccess: auth.authenticate,
  });
  const submit = () => {
    if (email.trim() && password) login.mutate();
  };

  return <AuthScreen>
    <AuthHeading eyebrow="Welcome back" title="Log in" />
    {auth.status === 'unreachable' && <Notice tone="warn" title="Can’t reach Jump" style={{ marginBottom: 24 }} action={<Button variant="secondary" size="sm" title="Try again" onPress={auth.retry} />}>
      Check your connection. You’re still signed in; we just couldn’t confirm it.
    </Notice>}
    {auth.expired && !login.error && <Notice tone="warn" title="Your session ended" style={{ marginBottom: 24 }}>Log in again to pick up where you left off.</Notice>}
    <View style={{ gap: 20 }}>
      <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} submitBehavior="submit" />
      <TextField ref={passwordRef} label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} />
      <ErrorNotice error={login.error} />
      <Button full title={login.isPending ? 'Logging in…' : 'Log in'} loading={login.isPending} disabled={!email.trim() || !password} onPress={submit} />
    </View>
    <View style={{ marginTop: 16, alignItems: 'flex-end' }}>
      <TextLink title="Forgot password?" onPress={() => router.push('/forgot-password')} />
    </View>
    <SocialSignIn />
    <View style={{ marginTop: 28, alignItems: 'center' }}>
      <Txt size={14} color="ink2">New here? <TextLink title="Create an account" onPress={() => router.push('/register')} /></Txt>
    </View>
  </AuthScreen>;
}
