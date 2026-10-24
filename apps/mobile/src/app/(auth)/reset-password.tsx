import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AuthHeading, AuthScreen } from '@/components/auth';
import { Button, ErrorNotice, TextField } from '@/components/ui';
import { post } from '@/lib/api';

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(params.token ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const reset = useMutation({ mutationFn: () => post<{ success: boolean }>('/auth/reset-password/complete', { token: token.trim(), password }) });
  const mismatch = confirm.length > 0 && confirm !== password;

  if (reset.isSuccess) {
    return <AuthScreen>
      <AuthHeading eyebrow="Done" title="Password updated">For your security, every device has been signed out. Log in with your new password.</AuthHeading>
      <Button full title="Log in" onPress={() => router.dismissTo('/login')} />
    </AuthScreen>;
  }

  return <AuthScreen>
    <AuthHeading eyebrow="Account recovery" title="Choose a new password" />
    <View style={{ gap: 20 }}>
      {!params.token && <TextField label="Reset code" hint="From your reset email." value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} style={{ fontFamily: 'JetBrainsMono-Regular', fontSize: 14 }} />}
      <TextField label="New password" hint="At least 8 characters." value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <TextField label="Confirm new password" error={mismatch ? 'Passwords don’t match.' : undefined} value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <ErrorNotice error={reset.error} />
      <Button full title={reset.isPending ? 'Saving…' : 'Update password'} loading={reset.isPending} disabled={mismatch || password.length < 8 || !token.trim()} onPress={() => reset.mutate()} />
    </View>
  </AuthScreen>;
}
