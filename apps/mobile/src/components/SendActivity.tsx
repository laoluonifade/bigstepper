import { formatDistance } from '@jump/shared/format';
import { shownMetres } from '@jump/shared/progress';
import type { Activity, Unit } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { api, post } from '@/lib/api';
import { useProfile } from '@/lib/queries';
import { colors, fontFamily, radius } from '@/lib/theme';
import { CheckIcon, SearchIcon } from './icons';
import { Sheet } from './Sheet';
import { Avatar, Button, ErrorNotice, haptic, Skeleton, Txt } from './ui';

type Person = { username: string; displayName: string; avatarUrl: string | null; isMe?: boolean };

/** "Send to…" for an activity: people you follow and who follow you, or anyone by username. */
export function SendActivitySheet({ open, onOpenChange, activity, unit }: { open: boolean; onOpenChange: (open: boolean) => void; activity: Activity; unit: Unit }) {
  const profile = useProfile();
  const queryClient = useQueryClient();
  const username = profile.data?.username;
  const [term, setTerm] = useState('');
  const [note, setNote] = useState('');
  const [chosen, setChosen] = useState<Person | null>(null);
  const [sentTo, setSentTo] = useState<Person | null>(null);
  const searching = term.trim().replace(/^@/, '').length >= 2;
  const following = useQuery({ queryKey: ['connections', username, 'following'], queryFn: () => api<Person[]>(`/users/${encodeURIComponent(username!)}/following`), enabled: open && Boolean(username) });
  const followers = useQuery({ queryKey: ['connections', username, 'followers'], queryFn: () => api<Person[]>(`/users/${encodeURIComponent(username!)}/followers`), enabled: open && Boolean(username) });
  const results = useQuery({ queryKey: ['runner-search', term.trim()], queryFn: () => api<Person[]>(`/users/search?q=${encodeURIComponent(term.trim())}`), enabled: open && searching, staleTime: 30_000 });
  const people = useMemo(() => {
    const source = searching ? results.data ?? [] : [...(following.data ?? []), ...(followers.data ?? [])];
    const seen = new Set<string>();
    return source.filter((person) => !person.isMe && person.username !== username && !seen.has(person.username) && seen.add(person.username));
  }, [searching, results.data, following.data, followers.data, username]);
  const loading = searching ? results.isLoading : following.isLoading || followers.isLoading;
  const send = useMutation({
    mutationFn: (to: Person) => post(`/messages/${encodeURIComponent(to.username)}`, { body: note.trim(), activityId: activity.id }),
    onSuccess(_result, to) {
      haptic('success');
      setSentTo(to);
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });
  const reset = () => { setSentTo(null); setChosen(null); setNote(''); send.reset(); };

  return <Sheet open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }} title={`Send ${activity.activityType === 'cycle' ? 'ride' : activity.activityType} · ${formatDistance(shownMetres(activity), unit)}`}
    footer={sentTo ? undefined : <View>
      <ErrorNotice error={send.error} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput style={styles.note} placeholder="Add a note (optional)" placeholderTextColor={colors.ink3} maxLength={1000} value={note} onChangeText={setNote} accessibilityLabel="Add a note" />
        <Button title={send.isPending ? 'Sending…' : 'Send'} loading={send.isPending} disabled={!chosen} onPress={() => chosen && send.mutate(chosen)} />
      </View>
    </View>}>
    {sentTo ? <View style={{ alignItems: 'center', paddingVertical: 24 }}>
      <View style={styles.sent}><CheckIcon size={26} color={colors.paper} /></View>
      <Txt size={16} weight="bold" style={{ marginTop: 12 }}>Sent to {sentTo.displayName}</Txt>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
        <Button size="sm" title="Open chat" onPress={() => { onOpenChange(false); router.push(`/messages/${sentTo.username}`); }} />
        <Button size="sm" variant="secondary" title="Send to someone else" onPress={reset} />
      </View>
    </View> : <>
      <View style={styles.search}>
        <SearchIcon size={16} color={colors.ink3} />
        <TextInput style={styles.searchInput} placeholder="Search by name or @username" placeholderTextColor={colors.ink3} value={term} onChangeText={setTerm} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search runners" />
      </View>
      <Txt size={12} weight="bold" upper tracking={0.08} color="ink3" style={{ marginTop: 12, marginBottom: 4 }}>{searching ? 'Results' : 'Following and followers'}</Txt>
      <View style={{ minHeight: 180 }}>
        {loading ? <View style={{ gap: 8, paddingVertical: 8 }}>{[0, 1, 2].map((key) => <Skeleton key={key} style={{ height: 48 }} />)}</View>
          : !people.length ? <Txt size={14} color="ink3" align="center" style={{ paddingVertical: 32 }}>{searching ? 'No runners match that.' : 'Follow runners to see them here, or search above.'}</Txt>
            : people.map((person) => {
              const picked = chosen?.username === person.username;
              return <Pressable key={person.username} onPress={() => { haptic(); setChosen(picked ? null : person); }} accessibilityRole="radio" accessibilityState={{ checked: picked }}
                style={({ pressed }) => [styles.person, (picked || pressed) && { backgroundColor: colors.inkWash }]}>
                <Avatar name={person.displayName} src={person.avatarUrl} size={42} round />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt size={15} weight="semibold" numberOfLines={1}>{person.displayName}</Txt>
                  <Txt size={13} color="ink3" numberOfLines={1}>@{person.username}</Txt>
                </View>
                <View style={[styles.tick, picked && { borderColor: colors.track, backgroundColor: colors.track }]}>{picked ? <CheckIcon size={14} color={colors.paper} /> : null}</View>
              </Pressable>;
            })}
      </View>
    </>}
  </Sheet>;
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: radius.full, backgroundColor: 'rgba(18,18,18,0.05)', paddingHorizontal: 16 },
  searchInput: { flex: 1, fontFamily: fontFamily('regular'), fontSize: 16, color: colors.ink },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius['2xl'], paddingHorizontal: 12, paddingVertical: 10, marginHorizontal: -8 },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  note: { flex: 1, height: 44, borderRadius: radius.full, backgroundColor: 'rgba(18,18,18,0.05)', paddingHorizontal: 16, fontFamily: fontFamily('regular'), fontSize: 16, color: colors.ink },
  sent: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.ok, alignItems: 'center', justifyContent: 'center' },
});
