import type { Gender, Profile } from '@jump/shared/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AuthHeading, AuthScreen } from '@/components/auth';
import { CountryPicker, GenderSelect, PhoneField } from '@/components/pickers';
import { Button, ErrorNotice, haptic, Loading, TextField } from '@/components/ui';
import { UsernameField, useUsernameCheck } from '@/components/UsernameField';
import { patch } from '@/lib/api';
import { keys, useProfile } from '@/lib/queries';

/**
 * After signing up with Apple or Google, which only share a name and email: the rest of the profile,
 * username first, before picking a first competition.
 */
export default function SetupScreen() {
  const profile = useProfile();
  if (!profile.data) return <Loading />;
  return <SetupForm profile={profile.data} />;
}

function SetupForm({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState(profile.username.replace(/_[0-9a-f]{6}$/, ''));
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [country, setCountry] = useState(profile.countryCode);
  const [gender, setGender] = useState<Gender | ''>(profile.gender ?? '');
  const [whatsapp, setWhatsapp] = useState(profile.whatsappNumber ?? '');
  const check = useUsernameCheck(username, profile.username);
  const save = useMutation({
    mutationFn: () => patch<Profile>('/me', {
      username,
      displayName: displayName.trim(),
      countryCode: country,
      ...(gender ? { gender } : {}),
      ...(whatsapp ? { whatsappNumber: whatsapp } : {}),
    }),
    onSuccess(updated) {
      queryClient.setQueryData(keys.profile, updated);
      haptic('success');
      router.replace('/welcome');
    },
  });
  return <AuthScreen>
    <AuthHeading eyebrow="Almost there" title="Finish your profile">How you show up on leaderboards. You can change all of this later.</AuthHeading>
    <View style={{ gap: 20 }}>
      <UsernameField value={username} onChange={setUsername} current={profile.username} autoFocus />
      <TextField label="Display name" hint="Shown on leaderboards." maxLength={80} autoComplete="name" textContentType="name" value={displayName} onChangeText={setDisplayName} />
      <CountryPicker label="Country of residence" value={country} onChange={setCountry} />
      <GenderSelect optional hint="Only used to choose your default avatar." value={gender} onChange={setGender} />
      <PhoneField label="WhatsApp number" optional hint="Private. Only Jump uses it, to reach you about prizes." value={whatsapp} onChange={setWhatsapp} defaultCountry={country} />
      <ErrorNotice error={save.error} />
      <Button full title={save.isPending ? 'Saving…' : 'Continue'} loading={save.isPending} disabled={!check.ok || !displayName.trim()} onPress={() => save.mutate()} />
    </View>
  </AuthScreen>;
}
