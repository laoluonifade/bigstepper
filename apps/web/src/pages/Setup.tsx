import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { FormEvent, useState } from 'react';
import { CountryPicker, PhoneField } from '../components/CountryPicker';
import { GenderSelect } from '../components/GenderSelect';
import { UsernameField, useUsernameCheck } from '../components/UsernameField';
import { ErrorNotice, Field, Loading } from '../components/ui';
import { patch } from '../lib/api';
import { keys, useProfile } from '../lib/queries';
import type { Gender, Profile } from '../lib/types';

/**
 * After signing up with Google, which only shares a name and email: the rest of the profile, username
 * first, before picking a first competition.
 */
export function SetupPage() {
  const profile = useProfile();
  if (!profile.data) return <Loading />;
  return <SetupForm profile={profile.data} />;
}

function SetupForm({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
      void navigate({ to: '/interests' });
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (check.ok && displayName.trim()) save.mutate();
  }
  return <div className="mx-auto max-w-[420px] animate-rise py-6">
    <p className="eyebrow mb-2">Almost there</p>
    <h1 className="display text-[34px]">Finish your profile</h1>
    <p className="mt-3 text-[15px] leading-relaxed text-ink-2">How you show up on leaderboards. You can change all of this later.</p>
    <form className="mt-8 space-y-5" onSubmit={submit}>
      <UsernameField value={username} onChange={setUsername} current={profile.username} autoFocus />
      <Field label="Display name" hint="Shown on leaderboards.">
        {(props) => <input {...props} className="field" name="displayName" autoComplete="name" maxLength={80} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />}
      </Field>
      <Field label="Country of residence">
        {(props) => <CountryPicker id={props.id} value={country} onChange={setCountry} required />}
      </Field>
      <Field label="Gender" optional hint="Only used to choose your default avatar.">
        {(props) => <GenderSelect id={props.id} value={gender} onChange={setGender} />}
      </Field>
      <Field label="WhatsApp number" optional hint="Private. Only Jump uses it, to reach you about prizes.">
        {(props) => <PhoneField id={props.id} value={whatsapp} onChange={setWhatsapp} defaultCountry={country} />}
      </Field>
      <ErrorNotice error={save.error} />
      <button className="btn-primary w-full" disabled={!check.ok || !displayName.trim() || save.isPending}>{save.isPending ? 'Saving…' : 'Continue'}</button>
    </form>
  </div>;
}
