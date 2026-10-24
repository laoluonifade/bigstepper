import type { AuthResponse, Gender } from '@jump/shared/types';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AuthHeading, AuthScreen, OrDivider, StravaButton } from '@/components/auth';
import { CountryPicker, GenderSelect, PhoneField } from '@/components/pickers';
import { Button, ErrorNotice, TextField, TextLink, Txt } from '@/components/ui';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { storageKeys, writeStored } from '@/lib/local';

export default function RegisterScreen() {
  const auth = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('NG');
  const [gender, setGender] = useState<Gender | ''>('');
  const [whatsapp, setWhatsapp] = useState('');
  const register = useMutation({
    mutationFn: () => post<AuthResponse>('/auth/register', {
      email: email.trim(),
      password,
      countryCode: country,
      ...(gender ? { gender } : {}),
      ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      ...(whatsapp ? { whatsappNumber: whatsapp } : {}),
    }),
    onSuccess(response) {
      writeStored(storageKeys.verifyPrompt(response.user.id), true);
      // The onboarding gate takes new runners straight to picking competitions.
      auth.authenticate(response);
    },
  });

  return <AuthScreen>
    <AuthHeading eyebrow="Free to join" title="Create your account">Record your first run today. Free competitions never cost a thing.</AuthHeading>
    <View style={{ gap: 20 }}>
      <TextField label="Display name" optional hint="Shown on leaderboards. You can change it later." value={displayName} onChangeText={setDisplayName} autoComplete="nickname" textContentType="nickname" maxLength={80} />
      <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <CountryPicker label="Country of residence" value={country} onChange={setCountry} />
      <GenderSelect optional hint="Only used to choose your default avatar. You can change this later." value={gender} onChange={setGender} />
      <PhoneField label="WhatsApp number" optional hint="Private. Only Jump uses it, to reach you about prizes and your account." value={whatsapp} onChange={setWhatsapp} defaultCountry={country} />
      <TextField label="Password" hint={password.length > 0 && password.length < 8 ? `${8 - password.length} more characters needed` : 'At least 8 characters.'}
        value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <ErrorNotice error={register.error} />
      <Button full title={register.isPending ? 'Creating account…' : 'Create account'} loading={register.isPending} disabled={!email.trim() || password.length < 8} onPress={() => register.mutate()} />
    </View>
    <OrDivider />
    <StravaButton label="Sign up with Strava" />
    <Txt size={14} color="ink2" style={{ marginTop: 24 }}>Already running with us? <TextLink title="Log in" onPress={() => router.back()} /></Txt>
  </AuthScreen>;
}
