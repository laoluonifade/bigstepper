import type { RunnerSearchResult } from '@jump/shared/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { api } from '@/lib/api';
import { colors, fontFamily, radius } from '@/lib/theme';
import { CheckIcon, SearchIcon } from './icons';
import { Sheet } from './Sheet';
import { Avatar, Button, haptic, Skeleton, Txt, VerifiedTick } from './ui';

/** The one person a head-to-head is against: someone on Jump, or an email or phone to invite. */
export type Opponent =
  | { kind: 'runner'; username: string; displayName: string; avatarUrl: string | null }
  | { kind: 'email'; value: string }
  | { kind: 'phone'; value: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+[1-9]\d{7,14}$/;

export function opponentLabel(opponent: Opponent) {
  return opponent.kind === 'runner' ? `${opponent.displayName} (@${opponent.username})` : opponent.value;
}

/** Search Jump by name or @username, or type an email or phone number. Picking one closes the sheet. */
export function OpponentPicker({ open, onOpenChange, value, onChange }: { open: boolean; onOpenChange: (open: boolean) => void; value: Opponent | null; onChange: (opponent: Opponent | null) => void }) {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => { const timer = setTimeout(() => setQuery(term.trim().replace(/^@/, '')), 250); return () => clearTimeout(timer); }, [term]);
  const typed = term.trim();
  const phone = typed.replace(/[\s()-]/g, '');
  const asEmail = EMAIL.test(typed) ? typed.toLowerCase() : null;
  const asPhone = PHONE.test(phone) ? phone : null;
  const results = useQuery({
    queryKey: ['users', 'search', query],
    queryFn: () => api<RunnerSearchResult[]>(`/users/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2 && !asEmail && !asPhone,
    staleTime: 30_000,
  });
  const people = (results.data ?? []).filter((person) => !person.isMe);
  const pick = (opponent: Opponent) => { haptic(); onChange(opponent); setTerm(''); onOpenChange(false); };

  return <Sheet open={open} onOpenChange={onOpenChange} title="Your opponent" description="Head-to-head is you and one other person."
    footer={value ? <Button full variant="secondary" title={`Remove ${value.kind === 'runner' ? value.displayName : 'invite'}`} onPress={() => { onChange(null); onOpenChange(false); }} /> : undefined}>
    <View style={styles.search}>
      <SearchIcon size={17} color={colors.ink3} />
      <TextInput value={term} onChangeText={setTerm} placeholder="Name, @username, email or phone" placeholderTextColor={colors.ink3} style={styles.input}
        autoCapitalize="none" autoCorrect={false} autoFocus accessibilityLabel="Find your opponent" />
    </View>
    <Txt size={12} color="ink3" style={{ marginTop: 8 }}>Phone numbers need the country code, like +2348012345678.</Txt>
    <View style={{ marginTop: 16, minHeight: 260, gap: 8 }}>
      {value && !typed && <View style={[styles.choice, { backgroundColor: 'rgba(228,255,58,0.4)' }]}>
        {value.kind === 'runner' ? <Avatar name={value.displayName} src={value.avatarUrl} size={40} round /> : <View style={styles.mark}><Txt size={16} color="paper">{value.kind === 'email' ? '@' : '#'}</Txt></View>}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={15} weight="bold" numberOfLines={1}>{value.kind === 'runner' ? value.displayName : value.value}</Txt>
          <Txt size={12} color="ink2">{value.kind === 'runner' ? `@${value.username} · invited when you create it` : 'Invite sent when you create it'}</Txt>
        </View>
        <CheckIcon size={18} />
      </View>}
      {asEmail && <Choice title={`Invite ${asEmail}`} body="They get an email with the link. New to Jump? They sign up and land straight in it." mark="@" onPress={() => pick({ kind: 'email', value: asEmail })} />}
      {asPhone && <Choice title={`Invite ${asPhone}`} body="You’ll get a link to text them once it’s created." mark="#" onPress={() => pick({ kind: 'phone', value: asPhone })} />}
      {!asEmail && !asPhone && query.length >= 2 && (results.isLoading
        ? <View style={{ gap: 8 }}>{[0, 1, 2].map((row) => <Skeleton key={row} style={{ height: 56, borderRadius: radius.xl }} />)}</View>
        : people.length ? <View style={styles.list}>
          {people.map((person, index) => <Pressable key={person.username} onPress={() => pick({ kind: 'runner', username: person.username, displayName: person.displayName, avatarUrl: person.avatarUrl })}
            style={({ pressed }) => [styles.person, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, (pressed || (value?.kind === 'runner' && value.username === person.username)) && { backgroundColor: 'rgba(228,255,58,0.3)' }]}>
            <Avatar name={person.displayName} src={person.avatarUrl} avatarStyle={person.avatarStyle} size={40} round />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Txt size={15} weight="semibold" numberOfLines={1}>{person.displayName}</Txt>{person.verified ? <VerifiedTick /> : null}</View>
              <Txt size={12} color="ink3" numberOfLines={1}>@{person.username}</Txt>
            </View>
          </Pressable>)}
        </View>
          : <Txt size={14} color="ink2" align="center" style={{ paddingVertical: 24 }}>{`Nobody on Jump matches “${query}”. Type their email or phone number to invite them.`}</Txt>)}
      {!typed && !value && <Txt size={14} color="ink2" align="center" style={{ paddingVertical: 24 }}>Search for a runner, or type an email or phone number.</Txt>}
    </View>
  </Sheet>;
}

function Choice({ title, body, onPress, mark }: { title: string; body: string; onPress: () => void; mark: string }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.choice, pressed && { opacity: 0.8 }]} accessibilityRole="button">
    <View style={styles.mark}><Txt size={16} color="paper">{mark}</Txt></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Txt size={15} weight="bold" numberOfLines={1}>{title}</Txt>
      <Txt size={12} color="ink2" leading={1.35}>{body}</Txt>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.white, paddingHorizontal: 14 },
  input: { flex: 1, fontFamily: fontFamily('regular'), fontSize: 16, color: colors.ink },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, padding: 12 },
  mark: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  list: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
});
