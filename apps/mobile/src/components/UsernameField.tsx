import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { TextField, Txt } from './ui';

const VALID = /^[a-z0-9_]{2,30}$/;

/** A username as people type it: lowercase, no spaces or @. */
export const cleanUsername = (text: string) => text.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');

/** Checks a username a moment after typing stops. `ok` is true once it's valid and free. */
export function useUsernameCheck(username: string, current?: string) {
  const [settled, setSettled] = useState(username);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(username), 400);
    return () => clearTimeout(timer);
  }, [username]);
  const valid = VALID.test(username);
  const check = useQuery({
    queryKey: ['username-available', settled],
    queryFn: () => api<{ available: boolean }>(`/usernames/${encodeURIComponent(settled)}/available`),
    enabled: VALID.test(settled) && settled !== current,
    staleTime: 30_000,
  });
  const mine = username === current;
  const checking = valid && !mine && (settled !== username || check.isFetching);
  const taken = valid && !mine && settled === username && check.data?.available === false;
  const error = username && !valid ? '2–30 characters: lowercase letters, numbers and underscores.' : taken ? 'That username is taken. Try another.' : undefined;
  return { error, checking, ok: valid && (mine || (!checking && check.data?.available === true)) };
}

/** The username box with its @, and whether it's free as you type. */
export function UsernameField({ value, onChange, current, autoFocus }: { value: string; onChange: (value: string) => void; current?: string; autoFocus?: boolean }) {
  const { error, checking, ok } = useUsernameCheck(value, current);
  return <TextField label="Username" error={error} hint={checking ? 'Checking…' : ok && value !== current ? 'Available' : 'How runners find you, and your profile link.'}
    maxLength={30} autoCapitalize="none" autoCorrect={false} autoComplete="username-new" textContentType="username" autoFocus={autoFocus}
    value={value} onChangeText={(text) => onChange(cleanUsername(text))} left={<Txt size={16} color="ink3">@</Txt>} />;
}
