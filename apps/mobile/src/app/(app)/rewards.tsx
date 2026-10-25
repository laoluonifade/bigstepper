import { AWARD_STATUS } from '@jump/shared/copy';
import { formatDate, formatMoney, formatNairaInput, nairaInputToKobo, shortId } from '@jump/shared/format';
import type { CheckoutResponse, PayoutRecipient, PrizeAward } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BankPicker, KycPanel, ResolvedAccount, useBanks, useKyc, useResolvedAccount } from '@/components/KycPanel';
import { Button, Card, CountUp, EmptyState, ErrorNotice, Eyebrow, Notice, PageHeader, Score, Screen, SectionTitle, Skeleton, Tag, TextField, Txt } from '@/components/ui';
import { api, isApiError, post } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { useStored } from '@/lib/local';
import { openCheckout } from '@/lib/checkout';
import { savePayment } from '@/lib/payments';
import { keys, useWallet, useWalletTransactions } from '@/lib/queries';
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

  const balance = useWallet();
  const activity = useWalletTransactions();

  return <Screen refreshing={rewards.isRefetching || balance.isRefetching} onRefresh={() => { void rewards.refetch(); void balance.refetch(); void activity.refetch(); }}>
    <Stack.Screen options={{ title: 'Rewards' }} />
    <PageHeader eyebrow="You" title="Rewards" description="Your balance for entries, and the prizes you’ve won." />
    <EntryBalance balanceKobo={balance.isLoading ? null : Number(balance.data?.balanceKobo ?? 0)} />

    <Card variant="strong" padded={false} style={{ flexDirection: 'row', marginTop: 32, marginBottom: 32 }}>
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
      <SectionTitle>Balance activity</SectionTitle>
      <ErrorNotice error={activity.error} onRetry={() => void activity.refetch()} />
      {activity.isLoading ? <Skeleton style={{ height: 120 }} />
        : !(activity.data ?? []).length ? <Txt size={14} color="ink3">Top-ups and entries you pay from your balance show here.</Txt>
          : <View style={styles.list}>{(activity.data ?? []).map((item, index) => <View key={item.id} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt size={14} weight="bold">{item.description}</Txt>
              <Txt size={12} color="ink3" style={{ marginTop: 2 }}>{`${formatDate(item.createdAt, { year: 'numeric' })} · balance ${formatMoney(item.balanceAfterKobo)}`}</Txt>
            </View>
            <Text style={[score(22), { color: Number(item.amountKobo) < 0 ? colors.bad : colors.ok }]}>{`${Number(item.amountKobo) > 0 ? '+' : '−'}${formatMoney(Math.abs(Number(item.amountKobo)))}`}</Text>
          </View>)}</View>}
    </View>

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

/**
 * What's on account for competition entries: topped up by card, spent on entries, never withdrawn
 * (it's an entry balance, not a store of money).
 */
function EntryBalance({ balanceKobo }: { balanceKobo: number | null }) {
  const [amount, setAmount] = useState('');
  const amountKobo = nairaInputToKobo(amount);
  const topUp = useMutation({
    mutationFn: () => post<CheckoutResponse>('/wallet/fund', { amountKobo }),
    async onSuccess(response) {
      savePayment({ reference: response.reference, purpose: 'WALLET_FUNDING', tableTitle: 'Entry balance top-up', amountKobo, createdAt: new Date().toISOString() });
      setAmount('');
      await openCheckout(response.authorizationUrl);
    },
  });
  return <Card variant="strong" style={{ padding: 20 }}>
    <Eyebrow>Balance for entries</Eyebrow>
    <Score size={44} style={{ marginTop: 8 }}>{balanceKobo === null ? '–' : <CountUp value={balanceKobo} format={(k) => formatMoney(Math.round(k))} />}</Score>
    <Txt size={12} color="ink3" leading={1.45} style={{ marginTop: 6 }}>Use it to enter paid competitions. It can’t be withdrawn or transferred.</Txt>
    <View style={{ marginTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 20, gap: 14 }}>
      <TextField label="Amount to add" hint="Minimum ₦100." keyboardType="decimal-pad" value={amount} onChangeText={(text) => setAmount(formatNairaInput(text))} left={<Txt size={16} weight="bold">₦</Txt>} />
      <Button full title={topUp.isPending ? 'Opening Paystack…' : 'Add funds'} loading={topUp.isPending} disabled={amountKobo < 10_000} onPress={() => topUp.mutate()} />
      <ErrorNotice error={topUp.error} />
    </View>
  </Card>;
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
  award: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, padding: 16 },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 4, paddingVertical: 14 },
});
