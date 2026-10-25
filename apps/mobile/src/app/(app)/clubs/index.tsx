import type { Club } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ClubCard, clubHandle, PrivacyChoice, type ClubSummary } from '@/components/clubs';
import { ArrowRightIcon, PlusIcon, SearchIcon } from '@/components/icons';
import { Sheet } from '@/components/Sheet';
import { Button, EmptyState, ErrorNotice, haptic, PageHeader, Screen, SectionTitle, Skeleton, TextField, Txt } from '@/components/ui';
import { api, post } from '@/lib/api';
import { colors, fontFamily, radius } from '@/lib/theme';

export default function ClubsScreen() {
  const mine = useQuery({ queryKey: ['clubs', 'mine'], queryFn: () => api<ClubSummary[]>('/clubs?view=mine') });
  const discover = useQuery({ queryKey: ['clubs', 'discover'], queryFn: () => api<ClubSummary[]>('/clubs?view=discover') });
  const [lookup, setLookup] = useState('');
  const [creating, setCreating] = useState(false);
  const open = () => { const handle = clubHandle(lookup); if (handle) router.push(`/clubs/${handle}`); };

  return <Screen refreshing={mine.isRefetching} onRefresh={() => { void mine.refetch(); void discover.refetch(); }}>
    <Stack.Screen options={{ title: 'Clubs' }} />
    <PageHeader eyebrow="Compete" title="Clubs" description="Run clubs and brands on Jump. Follow them for their competitions, or join your crew’s club."
      actions={<Button variant="dark" size="sm" title="Start a club" icon={<PlusIcon size={16} color={colors.paper} />} onPress={() => setCreating(true)} />} />

    <SectionTitle aside={mine.data?.length ? `${mine.data.length}` : undefined}>Your clubs</SectionTitle>
    <ErrorNotice error={mine.error} onRetry={() => void mine.refetch()} />
    {mine.isLoading ? <Skeleton style={{ height: 96, borderRadius: radius['2xl'] }} />
      : !mine.data?.length ? <EmptyState title="No clubs yet" action={<Button size="sm" title="Start a club" icon={<PlusIcon size={16} />} onPress={() => setCreating(true)} />}>Start one for your run crew, or open a club from its link.</EmptyState>
        : <View style={{ gap: 12 }}>{mine.data.map((club) => <ClubCard key={club.id} club={club} />)}</View>}

    <View style={styles.lookup}>
      <SearchIcon size={16} color={colors.ink3} />
      <TextInput value={lookup} onChangeText={setLookup} onSubmitEditing={open} placeholder="Paste a club link" placeholderTextColor={colors.ink3} autoCapitalize="none" autoCorrect={false} returnKeyType="go" style={styles.lookupInput} accessibilityLabel="Club link" />
      <Pressable onPress={open} disabled={!clubHandle(lookup)} hitSlop={8} style={{ opacity: clubHandle(lookup) ? 1 : 0.4 }} accessibilityLabel="Open club"><ArrowRightIcon size={18} color={colors.ink2} /></Pressable>
    </View>

    {Boolean(discover.data?.length) && <View style={{ marginTop: 40 }}>
      <SectionTitle>Open clubs</SectionTitle>
      <View style={{ gap: 12 }}>{discover.data!.map((club) => <ClubCard key={club.id} club={club} />)}</View>
    </View>}

    <CreateClubSheet open={creating} onOpenChange={setCreating} />
  </Screen>;
}

function CreateClubSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'open' | 'invite'>('open');
  // The club's link is made from its name on the server.
  const create = useMutation({
    mutationFn: () => post<Club>('/clubs', { name: name.trim(), privacy, ...(description.trim() ? { description: description.trim() } : {}) }),
    onSuccess(club) {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['clubs'] });
      onOpenChange(false);
      router.push(`/clubs/${club.slug}`);
    },
  });
  return <Sheet open={open} onOpenChange={onOpenChange} title="Start a club" footer={<View>
    <Button full title={create.isPending ? 'Creating…' : 'Create club'} loading={create.isPending} disabled={name.trim().length < 3} onPress={() => create.mutate()} />
    <Txt size={12} color="ink3" align="center" style={{ marginTop: 8 }}>You can add a logo, colour and links next.</Txt>
  </View>}>
    <View style={{ gap: 16 }}>
      <TextField label="Club name" autoFocus maxLength={100} value={name} onChangeText={setName} placeholder="Lagos Road Runners" />
      <TextField label="About" optional hint={`${600 - description.length} characters left`} multiline maxLength={600} value={description} onChangeText={setDescription} placeholder="Who you are, when you run, where you meet." style={{ minHeight: 76 }} />
      <PrivacyChoice value={privacy} onChange={setPrivacy} />
      <ErrorNotice error={create.error} />
    </View>
  </Sheet>;
}

const styles = StyleSheet.create({
  lookup: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, paddingHorizontal: 12, marginTop: 32 },
  lookupInput: { flex: 1, fontFamily: fontFamily('regular'), fontSize: 16, color: colors.ink },
});
