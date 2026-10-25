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

  if (creator.isLoading) return <Screen><Stack.Screen options={{ title: 'Creator' }} /><Loading /></Screen>;
  return <Screen refreshing={earnings.isRefetching} onRefresh={() => { void creator.refetch(); void earnings.refetch(); }}>
    <Stack.Screen options={{ title: 'Creator' }} />
    <PageHeader eyebrow="You" title="Creator" description="Create paid competitions for your audience and earn 5% when they settle." />
    {!creator.data ? <Card variant="strong" style={{ padding: 20, gap: 20 }}>
      <SectionTitle style={{ marginBottom: 0 }}>Creator signup</SectionTitle>
      <SelectField label="Creator type" value={creatorType} onChange={setCreatorType} options={[
        { value: 'influencer', label: 'Influencer' }, { value: 'community_manager', label: 'Community manager' }, { value: 'run_club', label: 'Run club' }, { value: 'other', label: 'Other' },
      ]} />
      <TextField label="Display name" maxLength={100} value={displayName} onChangeText={setDisplayName} />
      <TextField label="Social or community URL" optional keyboardType="url" autoCapitalize="none" placeholder="https://" value={socialUrl} onChangeText={setSocialUrl} />
      <TextField label="About" optional multiline maxLength={500} value={bio} onChangeText={setBio} style={{ minHeight: 112 }} />
      <Notice tone="neutral">Creator competitions use a 35% total deduction: Jump keeps 30%, the creator earns 5%, and the winner receives 65%.</Notice>
      <ErrorNotice error={signup.error} />
      <Txt size={13} color="ink2">Jump reviews every creator application before you can host paid competitions.</Txt>
      <Button full title={signup.isPending ? 'Sending…' : 'Apply to be a creator'} loading={signup.isPending} disabled={displayName.trim().length < 2} onPress={() => signup.mutate()} />
    </Card> : <>
      {creator.data.status === 'PENDING' && <Notice tone="info" title="Waiting for approval" style={{ marginBottom: 32 }}>Jump reviews every new creator before they can host paid competitions. You’ll get a notification once you’re approved. Free competitions work in the meantime.</Notice>}
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
      <View style={{ marginTop: 40 }}>
        <SectionTitle>Earnings</SectionTitle>
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
      </View>
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  earning: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, padding: 16 },
});
