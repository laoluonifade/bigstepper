import { AWARD_STATUS } from '@jump/shared/copy';
import { formatDate, formatMoney, ordinal, shortId } from '@jump/shared/format';
import type { PayoutRecipient, PrizeAward } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BankPicker, ResolvedAccount, useBanks, useKyc, useResolvedAccount } from '@/components/KycPanel';
import { Button, Card, CountUp, EmptyState, ErrorNotice, Eyebrow, Notice, PageHeader, Score, Screen, SectionTitle, Skeleton, Tag, TextField, Txt } from '@/components/ui';
import { api, isApiError, post } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { useStored } from '@/lib/local';
import { ChevronRightIcon } from '@/components/icons';
import { keys, useWallet } from '@/lib/queries';
import { colors, mono, radius, score } from '@/lib/theme';

/** The identity page (typed loosely until the route types regenerate on the next `expo start`). */
const IDENTITY = '/identity' as Href;

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
  const sum = (awards: PrizeAward[]) => awards.reduce((total, award) => total + Number(award.amountKobo), 0);
  // Your rewards: the prize money you've won and not yet withdrawn.
  const withdrawable = list.filter((award) => award.status === 'PENDING_APPROVAL' && !award.payoutRequested);
  const onTheWay = list.filter((award) => (award.status === 'PENDING_APPROVAL' && award.payoutRequested) || award.status === 'APPROVED' || award.status === 'PROCESSING');
  const paid = sum(list.filter((award) => award.status === 'PAID'));
  const available = sum(withdrawable);
  const withdraw = useMutation({
    // One payout request per prize: Jump reviews and sends each.
    mutationFn: async () => {
      let riskHold = false;
      for (const award of withdrawable) riskHold = (await post<{ riskHold?: boolean }>(`/me/rewards/${award.id}/payout`))?.riskHold || riskHold;
      return { riskHold };
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.rewards }),
  });
  // Entry credit: money topped up before rewards replaced it. Still usable on paid entries.
  const leftover = Number(useWallet().data?.balanceKobo ?? 0);

  return <Screen refreshing={rewards.isRefetching} onRefresh={() => void rewards.refetch()}>
    <Stack.Screen options={{ title: 'Rewards' }} />
    <PageHeader eyebrow="You" title="Rewards" description="Prize money you’ve won. Withdraw it to your bank." />

    <Card variant="strong" style={{ padding: 20 }}>
      <Eyebrow>Your rewards</Eyebrow>
      <Score size={48} style={{ marginTop: 8 }}>{rewards.isLoading ? '–' : <CountUp value={available} format={(k) => formatMoney(Math.round(k))} />}</Score>
      <Txt size={13} color="ink2" style={{ marginTop: 6 }}>{available ? 'Prize money ready to withdraw.' : 'Win a prize and it lands here.'}</Txt>
      <Button full style={{ marginTop: 18 }} title={withdraw.isPending ? 'Requesting…' : `Withdraw${available ? ` ${formatMoney(available)}` : ''}`} loading={withdraw.isPending}
        disabled={!available || !canRequest || withdraw.isPending} onPress={() => withdraw.mutate()} />
      {available > 0 && !canRequest && (kycRequired
        ? <Button full variant="secondary" style={{ marginTop: 10 }} title="Verify your identity first" onPress={() => router.push(IDENTITY)} />
        : <Txt size={12} color="ink3" style={{ marginTop: 10 }}>Add your bank account below first.</Txt>)}
      <View style={styles.totals}>
        <View style={{ flex: 1 }}><Txt size={12} color="ink3">On its way</Txt><Txt size={15} weight="bold" num style={{ marginTop: 2 }}>{formatMoney(sum(onTheWay))}</Txt></View>
        <View style={{ flex: 1 }}><Txt size={12} color="ink3">Paid out</Txt><Txt size={15} weight="bold" num style={{ marginTop: 2 }}>{formatMoney(paid)}</Txt></View>
      </View>
    </Card>
    {withdraw.error && <View style={{ marginTop: 16 }}>
      {isApiError(withdraw.error, 503) ? <Notice tone="warn" title="Payouts are switched off">Prize payouts aren’t enabled yet. Your prize is safe and will be claimable once they are.</Notice>
        : isApiError(withdraw.error, 409) ? <Notice tone="neutral">{withdraw.error.message}</Notice> : <ErrorNotice error={withdraw.error} />}
    </View>}
    {withdraw.isSuccess && <Notice tone="ok" title="Withdrawal requested" style={{ marginTop: 16 }}>
      {withdraw.data.riskHold ? 'This one needs a closer review before it’s sent, which can take up to two working days. You’ll get a notification when it’s on its way.' : 'Jump reviews every payout before sending it. You’ll get a notification when it’s on its way.'}
    </Notice>}
    {leftover > 0 && <Txt size={12} color="ink3" leading={1.5} style={{ marginTop: 12 }}>{`You also have ${formatMoney(leftover)} in entry credit. It can be used on paid competition entries, not withdrawn.`}</Txt>}

    <View style={{ marginTop: 32 }}>
      <SectionTitle>Prizes</SectionTitle>
      <ErrorNotice error={rewards.error} onRetry={() => void rewards.refetch()} />
      {rewards.isLoading ? <Skeleton style={{ height: 96 }} />
        : !list.length ? <EmptyState mark="₦0" title="No prizes yet">Place in a paid or funded free competition and your prize shows up here.</EmptyState>
          : <View style={{ gap: 12 }}>{list.map((award) => {
            const requested = award.status === 'PENDING_APPROVAL' && award.payoutRequested;
            const look = award.status === 'PAID' ? { color: colors.ok, background: colors.okWash, border: 'rgba(18,128,92,0.6)' } : award.status === 'FAILED' || award.status === 'REVERSED' ? { color: colors.bad, background: colors.badWash, border: 'rgba(194,38,27,0.6)' } : {};
            return <Pressable key={award.id} disabled={!award.tableCode} onPress={() => router.push(`/competitions/${award.tableCode}`)} style={({ pressed }) => [styles.award, pressed && { opacity: 0.8 }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={score(28)}>{formatMoney(award.amountKobo)}</Text>
                <Txt size={12} color="ink2" numberOfLines={1} style={{ marginTop: 4 }}>{`${ordinal(award.place ?? 1)} · ${award.tableTitle ?? `Competition ${shortId(award.tableId)}`} · ${formatDate(award.createdAt, { year: 'numeric' })}`}</Txt>
              </View>
              <Tag {...look}>{requested ? 'Requested' : award.status === 'PENDING_APPROVAL' ? 'Available' : AWARD_STATUS[award.status] ?? award.status}</Tag>
            </Pressable>;
          })}</View>}
    </View>

    <View style={{ marginTop: 40 }}>
      <SectionTitle>Payout details</SectionTitle>
      {kycRequired
        // Payouts go to the bank account you verified with: that's on its own page.
        ? <Pressable onPress={() => router.push(IDENTITY)} style={({ pressed }) => [styles.award, pressed && { opacity: 0.8 }]} accessibilityRole="button">
          <View style={{ flex: 1 }}>
            <Txt size={15} weight="bold">Identity verification</Txt>
            <Txt size={13} color="ink2" style={{ marginTop: 2 }}>{kyc.data?.status === 'VERIFIED' ? 'Verified. Payouts go to your verified bank account.' : kyc.data?.status === 'PENDING' ? 'Checking your details…' : 'Needed before your first withdrawal.'}</Txt>
          </View>
          <ChevronRightIcon size={16} color={colors.ink3} />
        </Pressable>
        : recipient && !editing ? <Card style={{ padding: 16 }}>
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
  totals: { flexDirection: 'row', gap: 16, marginTop: 18, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  award: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, padding: 16 },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 4, paddingVertical: 14 },
});
