import { AWARD_STATUS } from '@jump/shared/copy';
import { formatDate, formatMoney, shortId } from '@jump/shared/format';
import type { PayoutRecipient, PrizeAward } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BankPicker, KycPanel, ResolvedAccount, useBanks, useKyc, useResolvedAccount } from '@/components/KycPanel';
import { Button, Card, CountUp, EmptyState, ErrorNotice, Eyebrow, Notice, PageHeader, Score, Screen, SectionTitle, Skeleton, Tag, TextField, Txt } from '@/components/ui';
import { api, isApiError, post } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { useStored } from '@/lib/local';
import { keys } from '@/lib/queries';
import { colors, mono, radius, score } from '@/lib/theme';

type SavedRecipient = Pick<PayoutRecipient, 'accountName' | 'bankCode' | 'accountLast4'> & { availableForPayoutAt?: string };

export default function RewardsScreen() {
  const banks = useBanks();
  const user = useUser();
  const queryClient = useQueryClient();
  const rewards = useQuery({ queryKey: keys.rewards, queryFn: () => api<PrizeAward[]>('/me/rewards') });
  // Only the masked summary the API returns is kept — never the full account number.
  const [recipient, setRecipient] = useStored<SavedRecipient | null>(`jump_recipient:${user.id}`, null);
  const [editing, setEditing] = useState(false);
  const kyc = useKyc();
  // With KYC on, payouts go to the verified account; otherwise to the account saved below.
  const kycRequired = kyc.data?.required ?? false;
  const canRequest = kycRequired ? kyc.data?.status === 'VERIFIED' : Boolean(recipient);
  const list = rewards.data ?? [];
  const total = list.reduce((sum, award) => sum + Number(award.amountKobo), 0);
  const paid = list.filter((award) => award.status === 'PAID').reduce((sum, award) => sum + Number(award.amountKobo), 0);
  const requestPayout = useMutation({
    mutationFn: (awardId: string) => post<{ riskHold?: boolean }>(`/me/rewards/${awardId}/payout`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.rewards }),
  });

  return <Screen refreshing={rewards.isRefetching} onRefresh={() => void rewards.refetch()}>
    <Stack.Screen options={{ title: 'Rewards' }} />
    <PageHeader eyebrow="You" title="Rewards" description="Prizes from paid competitions you’ve won. Free competitions are for glory." />
    <Card variant="strong" padded={false} style={{ flexDirection: 'row', marginBottom: 32 }}>
      <View style={{ flex: 1, padding: 20 }}><Eyebrow>Total won</Eyebrow><Score size={34} style={{ marginTop: 8 }}>{rewards.isLoading ? '–' : <CountUp value={total} format={(k) => formatMoney(Math.round(k))} />}</Score></View>
      <View style={{ flex: 1, padding: 20, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.line }}><Eyebrow>Paid out</Eyebrow><Score size={34} style={{ marginTop: 8 }}>{rewards.isLoading ? '–' : <CountUp value={paid} format={(k) => formatMoney(Math.round(k))} />}</Score></View>
    </Card>

    <SectionTitle>Prizes</SectionTitle>
    <ErrorNotice error={rewards.error} onRetry={() => void rewards.refetch()} />
    {requestPayout.error && <View style={{ marginBottom: 16 }}>
      {isApiError(requestPayout.error, 503) ? <Notice tone="warn" title="Payouts are switched off">Prize payouts aren’t enabled yet. Your prize is safe and will be claimable once they are.</Notice>
        : isApiError(requestPayout.error, 409) ? <Notice tone="neutral">{requestPayout.error.message}</Notice> : <ErrorNotice error={requestPayout.error} />}
    </View>}
    {rewards.isLoading ? <Skeleton style={{ height: 96 }} />
      : !list.length ? <EmptyState mark="₦0" title="No prizes yet">Place in a paid or funded free competition and your prize shows up here.</EmptyState>
        : <View style={{ gap: 12 }}>{list.map((award) => {
          const claimable = award.status === 'PENDING_APPROVAL';
          const look = award.status === 'PAID' ? { color: colors.ok, background: colors.okWash, border: 'rgba(18,128,92,0.6)' } : award.status === 'FAILED' || award.status === 'REVERSED' ? { color: colors.bad, background: colors.badWash, border: 'rgba(194,38,27,0.6)' } : { border: colors.ink };
          return <View key={award.id} style={styles.award}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={score(30)}>{formatMoney(award.amountKobo)}</Text>
              <Txt size={12} color="ink2" style={{ marginTop: 4 }}>{`Place ${award.place ?? 1} · Competition ${shortId(award.tableId)} · ${formatDate(award.createdAt, { year: 'numeric' })}`}</Txt>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 8 }}>
              <Tag {...look}>{AWARD_STATUS[award.status] ?? award.status}</Tag>
              {claimable && <Button size="sm" disabled={!canRequest || requestPayout.isPending} title={requestPayout.isPending && requestPayout.variables === award.id ? 'Requesting…' : 'Request payout'} onPress={() => requestPayout.mutate(award.id)} />}
            </View>
          </View>;
        })}</View>}
    {requestPayout.isSuccess && <Notice tone="ok" title="Payout requested" style={{ marginTop: 16 }}>
      {requestPayout.data?.riskHold ? 'This one needs a closer review before it’s sent, which can take up to two working days. You’ll get a notification when it’s on its way.' : 'Jump reviews every payout before sending it. You’ll get a notification when it’s on its way.'}
    </Notice>}

    <View style={{ marginTop: 40 }}>
      <SectionTitle>Payout details</SectionTitle>
      {kycRequired ? <KycPanel /> : recipient && !editing ? <Card style={{ padding: 16 }}>
        <Txt size={15} weight="bold">{recipient.accountName}</Txt>
        <Txt size={13} color="ink2" num style={{ marginTop: 4 }}>{`${banks.data?.find((bank) => bank.code === recipient.bankCode)?.name ?? `Bank ${recipient.bankCode}`} · •••• ${recipient.accountLast4}`}</Txt>
        {recipient.availableForPayoutAt && new Date(recipient.availableForPayoutAt) > new Date() ? <Txt size={12} weight="semibold" color="warn" style={{ marginTop: 12 }}>{`Security hold until ${formatDate(recipient.availableForPayoutAt, { year: 'numeric' })}`}</Txt> : null}
        <Button size="sm" variant="quiet" title="Replace account" style={{ marginTop: 16 }} onPress={() => setEditing(true)} />
      </Card> : <RecipientForm onSaved={(saved) => { setRecipient({ accountName: saved.accountName, bankCode: saved.bankCode, accountLast4: saved.accountLast4, availableForPayoutAt: saved.availableForPayoutAt }); setEditing(false); }} onCancel={recipient ? () => setEditing(false) : undefined} />}
      {!kycRequired && <Txt size={12} color="ink3" leading={1.5} style={{ marginTop: 16 }}>We only keep the account name, bank and last four digits. Jump reviews and approves every payout before it’s sent.</Txt>}
    </View>
  </Screen>;
}

function RecipientForm({ onSaved, onCancel }: { onSaved: (recipient: PayoutRecipient) => void; onCancel?: () => void }) {
  const banks = useBanks();
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [password, setPassword] = useState('');
  const { complete, resolved } = useResolvedAccount(bankCode, accountNumber);
  const save = useMutation({
    mutationFn: () => post<PayoutRecipient>('/me/payout-recipient', { accountNumber, bankCode, password }),
    onSuccess(saved) { setAccountNumber(''); setPassword(''); onSaved(saved); },
    onError() { setPassword(''); },
  });
  const valid = complete && Boolean(resolved.data) && password.length >= 8;
  return <View style={{ gap: 16 }}>
    <BankPicker banks={banks.data ?? []} loading={banks.isLoading} value={bankCode} onChange={setBankCode} />
    {banks.isError && <ErrorNotice error={banks.error} onRetry={() => void banks.refetch()} />}
    <TextField label="Account number" error={accountNumber.length > 0 && accountNumber.length < 10 ? `${10 - accountNumber.length} more digits. Account numbers are 10 digits.` : undefined}
      keyboardType="number-pad" maxLength={10} value={accountNumber} onChangeText={(text) => setAccountNumber(text.replace(/\D/g, ''))} style={{ fontFamily: mono, letterSpacing: 1.8 }} />
    {complete && <ResolvedAccount resolved={resolved} />}
    <TextField label="Current password" hint="Required to protect bank-detail changes." secureTextEntry autoComplete="current-password" textContentType="password" maxLength={72} value={password} onChangeText={setPassword} />
    {save.error && (isApiError(save.error, 503) ? <Notice tone="warn" title="Payouts are switched off">You can’t add payout details until prize payouts are enabled.</Notice> : <ErrorNotice error={save.error} />)}
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Button variant="secondary" title={save.isPending ? 'Saving…' : resolved.data ? 'Save this account' : 'Save account'} loading={save.isPending} disabled={!valid} onPress={() => save.mutate()} />
      {onCancel && <Button variant="quiet" title="Cancel" onPress={onCancel} />}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  award: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, padding: 16 },
});
