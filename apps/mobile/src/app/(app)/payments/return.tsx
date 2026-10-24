import { paymentCopy } from '@jump/shared/copy';
import { formatMoney, formatRelative } from '@jump/shared/format';
import type { PaymentStatus } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from '@/components/icons';
import { Button, CopyButton, EmptyState, ErrorNotice, Eyebrow, HardShadow, LiveDot, PageHeader, Screen, Txt } from '@/components/ui';
import { api, isApiError, post } from '@/lib/api';
import { dismissPayment, updatePaymentStatus, useSavedPayments, type SavedPayment } from '@/lib/payments';
import { keys } from '@/lib/queries';
import { colors, mono, radius, wideLabel } from '@/lib/theme';

/**
 * Shown after Paystack's checkout closes (or whenever the runner comes back). Closing the browser proves
 * nothing, so we read the saved reference and ask the API for the truth.
 */
export default function PaymentReturnScreen() {
  const payments = useSavedPayments();
  return <Screen>
    <Stack.Screen options={{ title: 'Payment' }} />
    <PageHeader eyebrow="Payments" title="Payments" description="We confirm every payment directly with Paystack. This screen updates on its own, so you can leave and come back." />
    {!payments.length
      ? <EmptyState title="No payments on this phone" action={<Button variant="secondary" title="Browse competitions" onPress={() => router.navigate('/competitions')} />}>If you paid on another device, open Jump there to see its status.</EmptyState>
      : <View style={{ gap: 16 }}>{payments.map((payment, index) => <PaymentCard key={payment.reference} payment={payment} autoVerify={index === 0} />)}</View>}
  </Screen>;
}

const SLOW_AFTER_MS = 2 * 60_000;

function PaymentCard({ payment, autoVerify }: { payment: SavedPayment; autoVerify: boolean }) {
  const queryClient = useQueryClient();
  const checkedOnReturn = useRef(false);
  const status = useQuery({
    queryKey: keys.payment(payment.reference),
    queryFn: () => api<PaymentStatus>(`/payments/${encodeURIComponent(payment.reference)}/status`),
    retry: (count, error) => !isApiError(error, 404) && count < 3,
    refetchInterval: (query) => {
      const value = query.state.data?.status;
      if (value && paymentCopy(value).terminal) return false;
      if (query.state.error && isApiError(query.state.error, 404)) return false;
      return Date.now() - new Date(payment.createdAt).getTime() < SLOW_AFTER_MS ? 3000 : 15_000;
    },
  });
  const value = status.data?.status ?? payment.lastStatus ?? 'PENDING';
  const copy = payment.purpose === 'SPONSOR_FUNDING' && value === 'SUCCEEDED'
    ? { label: 'Funded', title: 'Prize funded', body: 'Paystack confirmed your contribution. It has been added to the prize pool. Joining remains free. Runners in a growing winner pool remain prize-eligible when they contribute; hosts cannot win their own cash prize.', terminal: true }
    : payment.purpose === 'SPONSOR_FUNDING' && value === 'FAILED'
      ? { label: 'Not paid', title: 'Checkout ended', body: 'Paystack did not confirm a contribution. You can still join the free competition, or start a new contribution.', terminal: true }
      : paymentCopy(value);
  const succeeded = value === 'SUCCEEDED';
  const verify = useMutation({
    mutationFn: () => post<PaymentStatus>(`/payments/${encodeURIComponent(payment.reference)}/verify`),
    onSuccess(result) {
      updatePaymentStatus(payment.reference, result.status);
      void queryClient.invalidateQueries({ queryKey: keys.payment(payment.reference) });
      void queryClient.invalidateQueries({ queryKey: ['tables', 'mine'] });
      if (payment.tableCode) void queryClient.invalidateQueries({ queryKey: keys.table(payment.tableCode) });
    },
  });
  useEffect(() => {
    if (!autoVerify || status.isLoading || status.error || paymentCopy(value).terminal || checkedOnReturn.current) return;
    checkedOnReturn.current = true;
    verify.mutate();
  }, [autoVerify, status.isLoading, status.error, value, verify]);
  useEffect(() => {
    if (!status.data) return;
    updatePaymentStatus(payment.reference, status.data.status);
    if (status.data.status === 'SUCCEEDED' && payment.tableId && payment.tableCode) {
      void queryClient.invalidateQueries({ queryKey: keys.standings(payment.tableId) });
      void queryClient.invalidateQueries({ queryKey: keys.table(payment.tableCode) });
      void queryClient.invalidateQueries({ queryKey: keys.tables });
      void queryClient.invalidateQueries({ queryKey: ['tables', 'mine'] });
    } else if (status.data.status === 'SUCCEEDED' && payment.purpose === 'WALLET_FUNDING') {
      void queryClient.invalidateQueries({ queryKey: keys.wallet });
      void queryClient.invalidateQueries({ queryKey: keys.walletTransactions });
    }
  }, [payment, queryClient, status.data]);
  const notFound = isApiError(status.error, 404);
  const openTable = () => router.dismissTo(`/competitions/${payment.tableCode}`);

  const card = <View style={styles.card}>
    <View style={[styles.head, { backgroundColor: succeeded ? colors.volt : copy.terminal ? colors.card : colors.warnWash }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {succeeded ? <CheckIcon size={16} /> : !copy.terminal ? <LiveDot live color={colors.warn} size={8} /> : null}
        <Txt size={12} weight="bold" upper tracking={0.12}>{notFound ? 'Not found' : copy.label}</Txt>
      </View>
      <Txt size={12} color="ink2">Started {formatRelative(payment.createdAt)}</Txt>
    </View>
    <View style={{ padding: 20 }}>
      <Eyebrow>{payment.tableTitle}</Eyebrow>
      <Text style={[wideLabel(22, 0), { fontFamily: 'ArchivoWide-Black', marginTop: 4, lineHeight: 26 }]}>{notFound ? 'We can’t find this payment' : copy.title}</Text>
      <Txt size={14} color="ink2" leading={1.55} style={{ marginTop: 8 }}>{notFound ? 'This reference doesn’t belong to the account you’re signed in with. Switch accounts, or dismiss it.' : copy.body}</Txt>
      {status.error && !notFound ? <ErrorNotice error={status.error} /> : null}
      <ErrorNotice error={verify.error} />
      <View style={styles.facts}>
        <View style={{ flex: 1 }}><Txt size={13} color="ink2">Amount</Txt><Txt size={13} weight="bold" num style={{ marginTop: 2 }}>{formatMoney(status.data?.amountKobo ?? payment.amountKobo)}</Txt></View>
        <View style={{ flex: 1, minWidth: 0 }}><Txt size={13} color="ink2">Reference</Txt><Text selectable numberOfLines={1} style={{ fontFamily: mono, fontSize: 12, color: colors.ink, marginTop: 2 }}>{payment.reference}</Text></View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
        {!copy.terminal && !notFound && <Button size="sm" variant="secondary" loading={verify.isPending} title={verify.isPending ? 'Checking Paystack…' : 'Check with Paystack'} onPress={() => verify.mutate()} />}
        {succeeded && payment.tableCode && <Button size="sm" title="Go to competition" onPress={openTable} />}
        {succeeded && payment.purpose === 'WALLET_FUNDING' && <Button size="sm" title="View wallet" onPress={() => router.dismissTo('/wallet')} />}
        {(value === 'FAILED' || notFound || !copy.terminal) && payment.tableCode && <Button size="sm" variant="secondary" title="Back to competition" onPress={openTable} />}
        <CopyButton value={payment.reference} label="Copy reference" />
        {(copy.terminal || notFound) && <Button size="sm" variant="quiet" title="Dismiss" onPress={() => dismissPayment(payment.reference)} />}
      </View>
    </View>
  </View>;
  return succeeded ? <HardShadow radius={radius.md}>{card}</HardShadow> : card;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.card, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 2, borderBottomColor: colors.ink, paddingHorizontal: 20, paddingVertical: 12 },
  facts: { flexDirection: 'row', gap: 16, marginTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 16 },
});
