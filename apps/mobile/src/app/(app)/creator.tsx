import { formatDate, formatMoney } from '@jump/shared/format';
import type { CreatorProfile } from '@jump/shared/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SelectField } from '@/components/pickers';
import { Button, Card, EmptyState, ErrorNotice, Loading, Notice, PageHeader, Screen, SectionTitle, Tag, TextField, Txt } from '@/components/ui';
import { post } from '@/lib/api';
import { keys, useCreator, useCreatorEarnings } from '@/lib/queries';
import { colors, radius, score } from '@/lib/theme';

export default function CreatorScreen() {
  const queryClient = useQueryClient();
  const creator = useCreator();
  const earnings = useCreatorEarnings(Boolean(creator.data));
  const [creatorType, setCreatorType] = useState<CreatorProfile['creatorType']>('influencer');
  const [displayName, setDisplayName] = useState('');
  const [socialUrl, setSocialUrl] = useState('');
  const [bio, setBio] = useState('');
  const signup = useMutation({
    mutationFn: () => post<CreatorProfile>('/creators/signup', { creatorType, displayName: displayName.trim(), ...(socialUrl.trim() ? { socialUrl: socialUrl.trim() } : {}), ...(bio.trim() ? { bio: bio.trim() } : {}) }),
    onSuccess: (profile) => queryClient.setQueryData(keys.creator, profile),
  });
  const payout = useMutation({
    mutationFn: (earningId: string) => post(`/creators/me/earnings/${earningId}/payout`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.creatorEarnings }),
  });

  const approved = creator.data?.status === 'ACTIVE';
  if (creator.isLoading) return <Screen><Stack.Screen options={{ title: 'Creator' }} /><Loading /></Screen>;
  return <Screen refreshing={earnings.isRefetching} onRefresh={() => { void creator.refetch(); void earnings.refetch(); }}>
    <Stack.Screen options={{ title: 'Creator' }} />
    {/* What creators earn is only shown once you're approved: before that, it's an application. */}
    <PageHeader eyebrow="You" title={approved ? 'Creator' : 'Become a creator'}
      description={approved ? 'Host paid competitions for your audience and earn 5% when they settle.'
        : creator.data ? 'Thanks for applying. Jump reviews every application.' : 'Run a community, club or audience? Apply to host paid competitions on Jump. Every application is reviewed.'} />
    {!creator.data ? <Card variant="strong" style={{ padding: 20, gap: 20 }}>
      <SectionTitle style={{ marginBottom: 0 }}>Application</SectionTitle>
      <SelectField label="Creator type" value={creatorType} onChange={setCreatorType} options={[
        { value: 'influencer', label: 'Influencer' }, { value: 'community_manager', label: 'Community manager' }, { value: 'run_club', label: 'Run club' }, { value: 'other', label: 'Other' },
      ]} />
      <TextField label="Display name" maxLength={100} value={displayName} onChangeText={setDisplayName} />
      <TextField label="Social or community URL" optional keyboardType="url" autoCapitalize="none" placeholder="https://" value={socialUrl} onChangeText={setSocialUrl} />
      <TextField label="About" optional multiline maxLength={500} value={bio} onChangeText={setBio} style={{ minHeight: 112 }} />
      <ErrorNotice error={signup.error} />
      <Txt size={13} color="ink2">We’ll let you know once it’s reviewed. Free competitions are open to everyone in the meantime.</Txt>
      <Button full title={signup.isPending ? 'Sending…' : 'Send application'} loading={signup.isPending} disabled={displayName.trim().length < 2} onPress={() => signup.mutate()} />
    </Card> : <>
      {creator.data.status === 'PENDING' && <Notice tone="info" title="Application received" style={{ marginBottom: 32 }}>Jump reviews every application. You’ll get a notification once it’s done. Free competitions work in the meantime.</Notice>}
      {creator.data.status === 'SUSPENDED' && <Notice tone="warn" title="Creator account suspended" style={{ marginBottom: 32 }}>You can’t host new paid competitions right now. Contact Jump support if you think this is a mistake.</Notice>}
      <SectionTitle>Creator account</SectionTitle>
      <Card style={{ padding: 20 }}>
        <Txt size={18} weight="bold">{creator.data.displayName}</Txt>
        <Txt size={13} color="ink2" style={{ marginTop: 4, textTransform: 'capitalize' }}>{`${creator.data.creatorType.replace('_', ' ')} · ${creator.data.status === 'ACTIVE' ? 'approved' : creator.data.status === 'PENDING' ? 'awaiting approval' : 'suspended'}`}</Txt>
        {creator.data.bio ? <Txt size={13} color="ink2" leading={1.5} style={{ marginTop: 16 }}>{creator.data.bio}</Txt> : null}
        <View style={{ gap: 8, marginTop: 20 }}>
          {creator.data.status === 'ACTIVE' && <Button full variant="secondary" title="Create paid competition" onPress={() => router.push('/competitions/new')} />}
          <Button full variant="quiet" title="Manage payout account" onPress={() => router.push('/rewards')} />
        </View>
      </Card>
      {approved && <View style={{ marginTop: 40 }}>
        <SectionTitle>Earnings</SectionTitle>
        <Notice tone="neutral" style={{ marginBottom: 16 }}>Paid competitions you host take a 35% total deduction: Jump keeps 30%, you earn 5%, and the winners receive 65%.</Notice>
        <ErrorNotice error={earnings.error} onRetry={() => void earnings.refetch()} />
        {!(earnings.data ?? []).length ? <EmptyState mark="5%" title="No creator earnings yet" action={<Button title="Create a competition" onPress={() => router.push('/competitions/new')} />}>Earnings appear after one of your paid competitions settles.</EmptyState>
          : <View style={{ gap: 12 }}>{(earnings.data ?? []).map((earning) => <View key={earning.id} style={styles.earning}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={score(30)}>{formatMoney(earning.amountKobo)}</Text>
              <Txt size={12} color="ink2" style={{ marginTop: 4 }}>{`5% of ${formatMoney(earning.grossPrizeKobo)} · ${formatDate(earning.createdAt, { year: 'numeric' })}`}</Txt>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 8 }}>
              <Tag border={colors.edge}>{earning.status}</Tag>
              {earning.status === 'EARNED' && <Button size="sm" title="Request payout" disabled={payout.isPending} onPress={() => payout.mutate(earning.id)} />}
            </View>
          </View>)}</View>}
        <ErrorNotice error={payout.error} />
      </View>}
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  earning: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, padding: 16 },
});
