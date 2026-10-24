import { countryName } from '@jump/shared/countries';
import { formatDate } from '@jump/shared/format';
import { profileStats } from '@jump/shared/progress';
import type { Gender, Profile, PublicProfile, Unit } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { ReactNode, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { ActivityIcon, BellIcon, CheckIcon, ChevronRightIcon, LadderIcon, LogoutIcon, UserIcon, UsersIcon, WalletIcon } from '@/components/icons';
import { CountryPicker, GenderSelect, PhoneField } from '@/components/pickers';
import { AvatarEditor, ProfileHero, ProfileStats, ShareProfileButton } from '@/components/Profile';
import { TabScreen } from '@/components/Shell';
import { Sheet } from '@/components/Sheet';
import { StravaConnection } from '@/components/strava';
import { Button, CopyButton, ErrorNotice, haptic, Loading, Segmented, Skeleton, TextField, Txt } from '@/components/ui';
import { api, patch } from '@/lib/api';
import { useAuth, useUser } from '@/lib/auth';
import { openWeb } from '@/lib/links';
import { keys, useActivities, useNotifications, useProfile, useUnit } from '@/lib/queries';
import { colors, GUTTER, radius } from '@/lib/theme';
import { toast } from '@/lib/toast';

const LEGAL = [{ to: '/terms', label: 'Terms of Service' }, { to: '/privacy', label: 'Privacy Policy' }, { to: '/safety', label: 'Safety & Acceptable Use' }] as const;

export default function YouScreen() {
  const user = useUser();
  const { logout } = useAuth();
  const profile = useProfile();
  const activities = useActivities();
  const unit = useUnit();
  const unread = useNotifications().data?.filter((item) => !item.readAt).length ?? 0;
  const stats = useMemo(() => profileStats(activities.data ?? []), [activities.data]);
  // Follower counts come from the public profile.
  const social = useQuery({ queryKey: ['runner', profile.data?.username ?? ''], queryFn: () => api<PublicProfile>(`/users/${encodeURIComponent(profile.data!.username)}`), enabled: Boolean(profile.data?.username) });
  const [sheet, setSheet] = useState<'profile' | 'personal' | 'email' | null>(null);
  const save = useSaveProfile();

  if (profile.isLoading) return <TabScreen banners={false}><Loading /></TabScreen>;
  if (profile.error || !profile.data) return <TabScreen banners={false}><ErrorNotice error={profile.error} onRetry={() => void profile.refetch()} /></TabScreen>;
  const me = profile.data;
  const emailOn = [me.emailActivityEnabled, me.emailDigestEnabled].filter(Boolean).length;
  const sections: Array<{ href: Href; label: string; icon: ReactNode; badge?: number }> = [
    { href: '/activities', label: 'Your activity', icon: <ActivityIcon size={18} /> },
    { href: '/leagues', label: 'My league', icon: <LadderIcon size={18} /> },
    { href: '/notifications', label: 'Notifications', icon: <BellIcon size={18} />, badge: unread },
    { href: '/wallet', label: 'Wallet', icon: <WalletIcon size={18} /> },
    { href: '/rewards', label: 'Rewards', icon: <WalletIcon size={18} /> },
    { href: '/prizes', label: 'Prizes', icon: <Txt size={16} weight="black">★</Txt> },
    { href: '/creator', label: 'Creator', icon: <UserIcon size={18} /> },
    { href: '/runners', label: 'Find runners', icon: <UsersIcon size={18} /> },
  ];

  return <TabScreen refreshing={profile.isRefetching} onRefresh={() => { void profile.refetch(); void social.refetch(); }}>
    <ProfileHero
      avatar={<AvatarEditor profile={me} />}
      displayName={me.displayName}
      verified={Boolean(me.verifiedAt)}
      username={me.username}
      meta={`${countryName(me.countryCode)} · Joined ${formatDate(me.createdAt, { month: 'short', year: 'numeric' })}`}
      bio={me.bio ?? <Pressable onPress={() => setSheet('profile')}><Txt size={14} color="ink3">Add a short bio →</Txt></Pressable>}
      counts={{ activities: stats.activities, followers: social.data?.followers ?? 0, following: social.data?.following ?? 0 }}
      actions={<>
        <Button size="sm" variant="secondary" full style={{ flex: 1 }} title="Edit profile" onPress={() => setSheet('profile')} />
        <ShareProfileButton username={me.username} displayName={me.displayName} />
      </>}
    >
      {activities.isLoading ? <Skeleton style={{ height: 80, marginTop: 20 }} /> : <ProfileStats stats={stats} unit={unit} />}
      <StravaConnection />
    </ProfileHero>

    <View style={{ gap: 28, marginTop: 32 }}>
      <Group>
        {sections.map((item) => <Row key={item.label} onPress={() => router.push(item.href)}>
          <View style={{ width: 24, alignItems: 'center' }}>{item.icon}</View>
          <Txt size={15} weight="semibold" style={{ flex: 1 }}>{item.label}</Txt>
          {item.badge ? <View style={styles.badge}><Txt size={11} weight="bold" num>{item.badge > 9 ? '9+' : item.badge}</Txt></View> : null}
          <ChevronRightIcon size={16} color={colors.ink3} />
        </Row>)}
      </Group>

      <Group title="Preferences">
        <Row>
          <Txt size={14} weight="semibold" style={{ flex: 1 }}>Distance units</Txt>
          <Segmented<Unit> size="sm" label="Distance units" value={me.preferredUnit} onChange={(value) => save.mutate({ preferredUnit: value })} options={[{ value: 'km', label: 'km' }, { value: 'mi', label: 'miles' }]} />
        </Row>
        <Row onPress={() => setSheet('email')}>
          <Txt size={14} weight="semibold" style={{ flex: 1 }}>Email updates</Txt>
          <Txt size={13} color="ink3">{emailOn === 2 ? 'All on' : emailOn === 1 ? '1 of 2 on' : 'Off'}</Txt>
          <ChevronRightIcon size={16} color={colors.ink3} />
        </Row>
        <Row onPress={() => setSheet('personal')}>
          <Txt size={14} weight="semibold">Personal details</Txt>
          <Txt size={13} color="ink3" numberOfLines={1} align="right" style={{ flex: 1 }}>{`${countryName(me.countryCode)}${me.whatsappNumber ? ' · WhatsApp' : ''}${me.weightKg ? ` · ${me.weightKg} kg` : ''}`}</Txt>
          <ChevronRightIcon size={16} color={colors.ink3} />
        </Row>
      </Group>

      <Group title="Account">
        <Row>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt size={14} weight="semibold">Email</Txt>
            <Txt size={13} color="ink3" numberOfLines={1}>{user.email}</Txt>
          </View>
          {user.emailVerified
            ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><CheckIcon size={14} color={colors.ok} /><Txt size={12} weight="semibold" color="ok">Verified</Txt></View>
            : <Pressable onPress={() => router.push('/verify-email')} hitSlop={8}><Txt size={13} weight="bold" style={{ textDecorationLine: 'underline' }}>Verify</Txt></Pressable>}
        </Row>
        <Row>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt size={14} weight="semibold">Runner handle</Txt>
            <Txt size={13} color="ink3" numberOfLines={1}>{`@${me.username} · clubs add you with this`}</Txt>
          </View>
          <CopyButton value={`@${me.username}`} label="Copy" />
        </Row>
        <Row onPress={() => router.push({ pathname: '/runners/[username]', params: { username: me.username } })}>
          <Txt size={14} weight="semibold" style={{ flex: 1 }}>See your public profile</Txt>
          <ChevronRightIcon size={16} color={colors.ink3} />
        </Row>
        <Row onPress={() => void openWeb('/forgot-password')}>
          <Txt size={14} weight="semibold" style={{ flex: 1 }}>Change password</Txt>
          <ChevronRightIcon size={16} color={colors.ink3} />
        </Row>
      </Group>

      <Pressable onPress={() => { haptic(); void logout(); }} style={({ pressed }) => [styles.logout, pressed && { backgroundColor: colors.badWash }]} accessibilityRole="button">
        <LogoutIcon size={16} color={colors.bad} /><Txt size={14} weight="bold" color="bad">Log out</Txt>
      </Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 16, rowGap: 4 }}>
        {LEGAL.map((link) => <Pressable key={link.to} onPress={() => void openWeb(link.to)} hitSlop={6}><Txt size={12} color="ink3">{link.label}</Txt></Pressable>)}
      </View>
    </View>

    {sheet === 'profile' && <EditProfileSheet profile={me} onClose={() => setSheet(null)} />}
    {sheet === 'personal' && <PersonalSheet profile={me} onClose={() => setSheet(null)} />}
    {sheet === 'email' && <EmailSheet profile={me} onClose={() => setSheet(null)} />}
  </TabScreen>;
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  const rows = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return <View>
    {title ? <Txt size={12} weight="semibold" color="ink3" style={{ marginBottom: 8, paddingHorizontal: 4 }}>{title}</Txt> : null}
    <View style={styles.group}>{rows.map((row, index) => <View key={index} style={index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line } : undefined}>{row}</View>)}</View>
  </View>;
}

function Row({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  return onPress
    ? <Pressable onPress={() => { haptic(); onPress(); }} style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(18,18,18,0.03)' }]} accessibilityRole="button">{children}</Pressable>
    : <View style={styles.row}>{children}</View>;
}

function useSaveProfile(onSaved?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: Partial<Profile>) => patch<Profile>('/me', changes),
    onSuccess(updated) {
      queryClient.setQueryData(keys.profile, updated);
      // Your name and handle also appear on leaderboards and member lists.
      void queryClient.invalidateQueries({ predicate: (query) => ['standings', 'result', 'leagues', 'club', 'runner', 'tables', 'leaderboard', 'feed', 'feed-post', 'feed-comments', 'messages'].includes(String(query.queryKey[0])) });
      haptic('success');
      toast({ tone: 'ok', message: 'Saved' });
      onSaved?.();
    },
  });
}

/** Only the fields that actually differ from what's saved. */
function changedFields(profile: Profile, draft: Partial<Profile>) {
  return Object.fromEntries(Object.entries(draft).filter(([key, value]) => (profile[key as keyof Profile] ?? null) !== (value ?? null))) as Partial<Profile>;
}

const weightProblem = (weightKg: number | null) => (weightKg !== null && (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 300 || !Number.isInteger(weightKg * 10)) ? 'Enter a weight from 20 to 300 kg, to one decimal place.' : undefined);

function SheetActions({ disabled, pending, onCancel, onSave }: { disabled: boolean; pending: boolean; onCancel: () => void; onSave: () => void }) {
  return <View style={{ flexDirection: 'row', gap: 8 }}>
    <Button variant="secondary" full style={{ flex: 1 }} title="Cancel" onPress={onCancel} />
    <Button variant="dark" full style={{ flex: 1 }} title={pending ? 'Saving…' : 'Save'} loading={pending} disabled={disabled} onPress={onSave} />
  </View>;
}

function EditProfileSheet({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [countryCode, setCountryCode] = useState(profile.countryCode);
  const [gender, setGender] = useState<Gender | ''>(profile.gender ?? '');
  const [whatsappNumber, setWhatsappNumber] = useState(profile.whatsappNumber ?? '');
  const [weight, setWeight] = useState(profile.weightKg === null || profile.weightKg === undefined ? '' : String(profile.weightKg));
  const save = useSaveProfile(onClose);
  const usernameError = !/^[a-z0-9_]{2,30}$/.test(username) ? '2–30 characters: lowercase letters, numbers and underscores.' : undefined;
  const nameError = !displayName.trim() ? 'Your name can’t be empty.' : undefined;
  const weightKg = weight === '' ? null : Number(weight);
  const weightError = weightProblem(weightKg);
  const changes = changedFields(profile, { displayName: displayName.trim(), username, bio: bio.trim() || null, countryCode, gender: gender || null, whatsappNumber: whatsappNumber || null, weightKg });
  const disabled = Boolean(usernameError || nameError || weightError) || !Object.keys(changes).length;
  return <Sheet open onOpenChange={(open) => !open && onClose()} title="Edit profile" footer={<SheetActions disabled={disabled} pending={save.isPending} onCancel={onClose} onSave={() => save.mutate(changes)} />}>
    <View style={{ gap: 20 }}>
      <TextField label="Display name" error={nameError} hint="Shown on leaderboards." maxLength={80} value={displayName} onChangeText={setDisplayName} />
      <TextField label="Username" error={usernameError} hint="Your profile link." maxLength={30} autoCapitalize="none" autoCorrect={false} value={username} onChangeText={(text) => setUsername(text.toLowerCase())} left={<Txt size={16} color="ink3">@</Txt>} />
      <TextField label="Bio" hint={`${bio.length}/160`} multiline maxLength={160} placeholder="Chasing a sub-25 5K. Lagos Road Runners." value={bio} onChangeText={setBio} style={{ minHeight: 88 }} />
      <CountryPicker label="Country of residence" value={countryCode} onChange={setCountryCode} />
      <GenderSelect optional hint="Private. Used to choose your default avatar if you haven’t uploaded a photo." value={gender} onChange={setGender} />
      <PhoneField label="WhatsApp number" optional hint="Only Jump uses it, to reach you about prizes and your account." value={whatsappNumber} defaultCountry={countryCode} onChange={setWhatsappNumber} />
      <TextField label="Body weight · kg" optional error={weightError} hint="Used only to estimate calories on your activities." keyboardType="decimal-pad" value={weight} onChangeText={setWeight} />
      <ErrorNotice error={save.error} />
    </View>
  </Sheet>;
}

function PersonalSheet({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [countryCode, setCountryCode] = useState(profile.countryCode);
  const [gender, setGender] = useState<Gender | ''>(profile.gender ?? '');
  const [whatsappNumber, setWhatsappNumber] = useState(profile.whatsappNumber ?? '');
  const [weight, setWeight] = useState(profile.weightKg === null || profile.weightKg === undefined ? '' : String(profile.weightKg));
  const save = useSaveProfile(onClose);
  const weightKg = weight === '' ? null : Number(weight);
  const weightError = weightProblem(weightKg);
  const changes = changedFields(profile, { countryCode, gender: gender || null, whatsappNumber: whatsappNumber || null, weightKg });
  return <Sheet open onOpenChange={(open) => !open && onClose()} title="Personal details" description="These details are private. Gender only changes the style of your default avatar."
    footer={<SheetActions disabled={Boolean(weightError) || !Object.keys(changes).length} pending={save.isPending} onCancel={onClose} onSave={() => save.mutate(changes)} />}>
    <View style={{ gap: 20 }}>
      <CountryPicker label="Country of residence" value={countryCode} onChange={setCountryCode} />
      <GenderSelect optional hint="Private. Used to choose your default avatar if you haven’t uploaded a photo." value={gender} onChange={setGender} />
      <PhoneField label="WhatsApp number" optional hint="Only Jump uses it, to reach you about prizes and your account." value={whatsappNumber} defaultCountry={countryCode} onChange={setWhatsappNumber} />
      <TextField label="Body weight · kg" optional error={weightError} hint="Used only to estimate calories on your activities." keyboardType="decimal-pad" value={weight} onChangeText={setWeight} />
      <ErrorNotice error={save.error} />
    </View>
  </Sheet>;
}

function EmailSheet({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [activity, setActivity] = useState(profile.emailActivityEnabled);
  const [digest, setDigest] = useState(profile.emailDigestEnabled);
  const save = useSaveProfile(onClose);
  const changes = changedFields(profile, { emailActivityEnabled: activity, emailDigestEnabled: digest });
  return <Sheet open onOpenChange={(open) => !open && onClose()} title="Email updates" footer={<SheetActions disabled={!Object.keys(changes).length} pending={save.isPending} onCancel={onClose} onSave={() => save.mutate(changes)} />}>
    <Toggle checked={activity} onChange={setActivity} title="Activity and people" body="Messages, follows, Rant interactions, competition progress and results." />
    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />
    <Toggle checked={digest} onChange={setDigest} title="Competition picks" body="Popular open competitions every three days." />
    <Txt size={12} color="ink3" style={{ marginTop: 12 }}>Account-security and payment emails always arrive.</Txt>
    <ErrorNotice error={save.error} />
  </Sheet>;
}

function Toggle({ checked, onChange, title, body }: { checked: boolean; onChange: (value: boolean) => void; title: string; body: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14 }}>
    <View style={{ flex: 1 }}>
      <Txt size={14} weight="semibold">{title}</Txt>
      <Txt size={13} color="ink3" style={{ marginTop: 2 }}>{body}</Txt>
    </View>
    <Switch value={checked} onValueChange={onChange} trackColor={{ true: colors.ink, false: colors.line }} thumbColor={colors.white} accessibilityLabel={title} />
  </View>;
}

const styles = StyleSheet.create({
  group: { borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: GUTTER, paddingVertical: 10 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.track, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius['2xl'], paddingVertical: 12 },
});
