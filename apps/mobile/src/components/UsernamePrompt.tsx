import type { Profile } from '@jump/shared/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { patch, WEB_URL } from '@/lib/api';
import { Storage } from '@/lib/kv';
import { keys, useProfile } from '@/lib/queries';
import { toast } from '@/lib/toast';
import { Sheet } from './Sheet';
import { Button, ErrorNotice, haptic, TextField, Txt } from './ui';

const SNOOZE_KEY = 'jump_username_snoozed_at';
/** "Not now" asks again after this long. */
const SNOOZE_MS = 3 * 24 * 60 * 60_000;
/** Not over sign-up, onboarding or a run in progress. */
const QUIET = [/^\/setup/, /^\/welcome/, /^\/run/, /^\/verify-email/, /^\/payments/];

function snoozed() {
  try {
    const at = Number(Storage.getItemSync(SNOOZE_KEY));
    return Number.isFinite(at) && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/**
 * Sign-up hands out "emailname_3f9a2c". Until the runner picks their own, this asks once a launch (or
 * every few days if they put it off), starting from that name without the random tail.
 */
export function UsernamePrompt() {
  const profile = useProfile().data;
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(snoozed);
  const wanted = profile?.usernameChosen === false && !dismissed && !QUIET.some((path) => path.test(pathname));
  // Wait a moment after launch so it doesn't land on top of the first screen as it draws.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    const timer = setTimeout(() => setOpen(true), 1_500);
    return () => clearTimeout(timer);
  }, [wanted]);
  if (!profile || !wanted) return null;
  const later = () => {
    try { Storage.setItemSync(SNOOZE_KEY, String(Date.now())); } catch { /* asks again next launch */ }
    setOpen(false);
    setDismissed(true);
  };
  return <UsernameSheet profile={profile} open={open} onLater={later} onDone={() => { setOpen(false); setDismissed(true); }} />;
}

function UsernameSheet({ profile, open, onLater, onDone }: { profile: Profile; open: boolean; onLater: () => void; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState(profile.username.replace(/_[0-9a-f]{6}$/, ''));
  const error = !/^[a-z0-9_]{2,30}$/.test(username) ? '2–30 characters: lowercase letters, numbers and underscores.' : undefined;
  const save = useMutation({
    mutationFn: () => patch<Profile>('/me', { username }),
    onSuccess(updated) {
      queryClient.setQueryData(keys.profile, updated);
      void queryClient.invalidateQueries({ predicate: (query) => ['standings', 'leagues', 'club', 'runner', 'tables', 'leaderboard', 'feed', 'messages'].includes(String(query.queryKey[0])) });
      haptic('success');
      toast({ tone: 'ok', message: `You're @${updated.username}` });
      onDone();
    },
  });
  return <Sheet open={open} onOpenChange={(next) => !next && onLater()} title="Pick your username"
    description="It's how runners find you, how clubs add you, and your profile link."
    footer={<View style={{ flexDirection: 'row', gap: 8 }}>
      <Button variant="secondary" full style={{ flex: 1 }} title="Not now" onPress={onLater} />
      <Button variant="dark" full style={{ flex: 1 }} title={save.isPending ? 'Saving…' : 'Save'} loading={save.isPending} disabled={Boolean(error)} onPress={() => save.mutate()} />
    </View>}>
    <View style={{ gap: 12 }}>
      <TextField label="Username" error={error} maxLength={30} autoCapitalize="none" autoCorrect={false} autoFocus
        value={username} onChangeText={(text) => setUsername(text.toLowerCase().replace(/\s+/g, ''))} left={<Txt size={16} color="ink3">@</Txt>} />
      <Txt size={13} color="ink3">{`${WEB_URL.replace(/^https?:\/\//, '')}/runners/${username || 'you'}`}</Txt>
      <ErrorNotice error={save.error} />
    </View>
  </Sheet>;
}
