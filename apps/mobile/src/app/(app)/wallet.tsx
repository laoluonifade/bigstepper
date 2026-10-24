import { formatDate, formatMoney, formatNairaInput, nairaInputToKobo } from '@jump/shared/format';
import type { CheckoutResponse } from '@jump/shared/types';
import { useMutation } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { KycPanel } from '@/components/KycPanel';
import { Button, Card, CountUp, EmptyState, ErrorNotice, Eyebrow, Notice, PageHeader, Score, Screen, SectionTitle, Skeleton, TextField, Txt } from '@/components/ui';
import { post } from '@/lib/api';
import { openCheckout } from '@/lib/checkout';
import { savePayment } from '@/lib/payments';
import { useWallet, useWalletTransactions } from '@/lib/queries';
import { colors, score } from '@/lib/theme';

export default function WalletScreen() {
  const wallet = useWallet();
  const transactions = useWalletTransactions();
  const [amount, setAmount] = useState('');
  const amountKobo = nairaInputToKobo(amount);
  const fund = useMutation({
    mutationFn: () => post<CheckoutResponse>('/wallet/fund', { amountKobo }),
    async onSuccess(response) {
      savePayment({ reference: response.reference, purpose: 'WALLET_FUNDING', tableTitle: 'Wallet funding', amountKobo, createdAt: new Date().toISOString() });
      setAmount('');
      await openCheckout(response.authorizationUrl);
    },
  });
  const list = transactions.data ?? [];
  return <Screen refreshing={wallet.isRefetching} onRefresh={() => { void wallet.refetch(); void transactions.refetch(); }}>
    <Stack.Screen options={{ title: 'Wallet' }} />
    <PageHeader eyebrow="You" title="Wallet" description="Fund entries once and use your balance for paid competitions." />
    <Notice tone="neutral" title="Closed-loop balance" style={{ marginBottom: 24 }}>Wallet funding cannot be withdrawn or transferred back. It can only be used for eligible Jump competition entries.</Notice>

    <SectionTitle>Balance</SectionTitle>
    <Card variant="strong" style={{ padding: 20 }}>
      <Eyebrow>Available for entries</Eyebrow>
      <Score size={48} style={{ marginTop: 8 }}>{wallet.isLoading ? '–' : <CountUp value={Number(wallet.data?.balanceKobo ?? 0)} format={(k) => formatMoney(Math.round(k))} />}</Score>
      <View style={{ marginTop: 24, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 20, gap: 16 }}>
        <TextField label="Amount to fund" hint="Minimum ₦100." keyboardType="decimal-pad" value={amount} onChangeText={(text) => setAmount(formatNairaInput(text))} left={<Txt size={16} weight="bold">₦</Txt>} />
        <Button full title={fund.isPending ? 'Opening Paystack…' : 'Fund wallet'} loading={fund.isPending} disabled={amountKobo < 10_000} onPress={() => fund.mutate()} />
        <ErrorNotice error={fund.error} />
      </View>
    </Card>

    <View style={{ marginTop: 40 }}>
      <SectionTitle>Transactions</SectionTitle>
      <ErrorNotice error={transactions.error} onRetry={() => void transactions.refetch()} />
      {transactions.isLoading ? <Skeleton style={{ height: 144 }} />
        : !list.length ? <EmptyState mark="₦0" title="No wallet activity">Fund your wallet to see transactions here.</EmptyState>
          : <View style={styles.list}>{list.map((item, index) => <View key={item.id} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt size={14} weight="bold">{item.description}</Txt>
              <Txt size={12} color="ink3" style={{ marginTop: 2 }}>{`${formatDate(item.createdAt, { year: 'numeric' })} · balance ${formatMoney(item.balanceAfterKobo)}`}</Txt>
            </View>
            <Text style={[score(24), { color: Number(item.amountKobo) < 0 ? colors.bad : colors.ok }]}>{`${Number(item.amountKobo) > 0 ? '+' : '−'}${formatMoney(Math.abs(Number(item.amountKobo)))}`}</Text>
          </View>)}</View>}
    </View>

    <View style={{ marginTop: 40 }}>
      <SectionTitle>Identity & payouts</SectionTitle>
      <KycPanel />
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 4, paddingVertical: 14 },
});
