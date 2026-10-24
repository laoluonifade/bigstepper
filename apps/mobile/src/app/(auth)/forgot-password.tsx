import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AuthHeading, AuthScreen } from '@/components/auth';
import { Button, ErrorNotice, Notice, TextField, TextLink } from '@/components/ui';
import { post } from '@/lib/api';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const request = useMutation({ mutationFn: () => post<{ success: boolean }>('/auth/reset-password/request', { email: email.trim() }) });

  if (request.isSuccess) {
    return <AuthScreen>
      <AuthHeading eyebrow="Request received" title="Check your inbox">If an account uses that email, a reset link has been issued. It expires in one hour.</AuthHeading>
      <Notice tone="neutral" title="Nothing arrived?">Check your spam folder, or wait a minute and request another link.</Notice>
      <View style={{ gap: 16, marginTop: 24 }}>
        <Button full variant="secondary" title="I have a reset code" onPress={() => router.push('/reset-password')} />
        <TextLink title="Back to log in" onPress={() => router.dismissTo('/login')} />
      </View>
    </AuthScreen>;
  }

  return <AuthScreen>
    <AuthHeading eyebrow="Account recovery" title="Reset your password">Enter the email you signed up with and we’ll issue a reset link.</AuthHeading>
    <View style={{ gap: 20 }}>
      <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="send" onSubmitEditing={() => email.trim() && request.mutate()} />
      <ErrorNotice error={request.error} />
      <Button full title={request.isPending ? 'Sending…' : 'Send reset link'} loading={request.isPending} disabled={!email.trim()} onPress={() => request.mutate()} />
      <TextLink title="Back to log in" onPress={() => router.back()} />
    </View>
  </AuthScreen>;
}
