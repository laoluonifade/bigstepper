import type { AuthResponse, Gender } from '@jump/shared/types';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { AuthHeading, AuthScreen, SocialSignIn } from '@/components/auth';
import { CountryPicker, GenderSelect, PhoneField } from '@/components/pickers';
import { Button, ErrorNotice, haptic, TextField, TextLink, Txt } from '@/components/ui';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { storageKeys, writeStored } from '@/lib/local';
import { colors } from '@/lib/theme';

const STEPS = [
  { title: 'Create your account', blurb: 'Record your first run today. Free competitions never cost a thing.' },
  { title: 'About you', blurb: 'How you show up on leaderboards. You can change all of this later.' },
  { title: 'Stay in the loop', blurb: 'So we can reach you about prizes and your account. Optional.' },
] as const;

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/**
 * Sign-up in three short steps rather than one long form: the account first (email, or Apple or Google
 * under it), then who you are, then how to reach you.
 */
export default function RegisterScreen() {
  const auth = useAuth();
  const [step, setStep] = useState(0);
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

  function go(next: number) {
    haptic('select');
    register.reset();
    setStep(next);
  }

  const { title, blurb } = STEPS[step];
  return <AuthScreen>
    <View style={styles.progress} accessibilityLabel={`Step ${step + 1} of ${STEPS.length}`}>
      {STEPS.map((_, index) => <View key={index} style={[styles.segment, index <= step && { backgroundColor: colors.track }]} />)}
    </View>
    <AuthHeading eyebrow={`Step ${step + 1} of ${STEPS.length}`} title={title}>{blurb}</AuthHeading>

    <Animated.View key={step} entering={FadeInRight.duration(220)} style={{ gap: 20 }}>
      {step === 0 && <>
        <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
        <TextField label="Password" hint={password.length > 0 && password.length < 8 ? `${8 - password.length} more characters needed` : 'At least 8 characters.'}
          value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        <Button full title="Continue" disabled={!looksLikeEmail(email) || password.length < 8} onPress={() => go(1)} />
        <SocialSignIn signUp />
      </>}

      {step === 1 && <>
        <TextField label="Display name" optional hint="Shown on leaderboards." value={displayName} onChangeText={setDisplayName} autoComplete="nickname" textContentType="nickname" maxLength={80} />
        <CountryPicker label="Country of residence" value={country} onChange={setCountry} />
        <GenderSelect optional hint="Only used to choose your default avatar." value={gender} onChange={setGender} />
        <Button full title="Continue" onPress={() => go(2)} />
      </>}

      {step === 2 && <>
        <PhoneField label="WhatsApp number" optional hint="Private. Only Jump uses it." value={whatsapp} onChange={setWhatsapp} defaultCountry={country} />
        <ErrorNotice error={register.error} />
        <Button full title={register.isPending ? 'Creating account…' : 'Create account'} loading={register.isPending} onPress={() => register.mutate()} />
        {!whatsapp && <Txt size={13} color="ink3" align="center">You can leave this blank and add it later.</Txt>}
      </>}
    </Animated.View>

    {step > 0
      ? <Pressable onPress={() => go(step - 1)} hitSlop={10} style={{ alignSelf: 'flex-start', marginTop: 24 }} accessibilityRole="button">
        <Txt size={14} weight="semibold" color="ink2">← Back</Txt>
      </Pressable>
      : <Txt size={14} color="ink2" style={{ marginTop: 24 }}>Already running with us? <TextLink title="Log in" onPress={() => router.back()} /></Txt>}
  </AuthScreen>;
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.line },
});
