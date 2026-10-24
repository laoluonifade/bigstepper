import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { api, post } from '@/lib/api';
import { colors, fontFamily, GUTTER, mono, radius } from '@/lib/theme';
import { CheckIcon, LockIcon, SearchIcon } from './icons';
import { PickerField } from './pickers';
import { Sheet } from './Sheet';
import { Button, Eyebrow, ErrorNotice, haptic, Notice, Skeleton, TextField, Txt } from './ui';

export interface KycStatus {
  required: boolean;
  level: number;
  status: 'NONE' | 'PENDING' | 'VERIFIED' | 'FAILED';
  firstName?: string;
  lastName?: string;
  accountName?: string;
  bankCode?: string;
  accountLast4?: string;
  bvnLast4?: string;
  failureReason?: string | null;
  verifiedAt?: string | null;
}

export type Bank = { code: string; name: string };
export const KYC_KEY = ['kyc'] as const;

/** Polls while Paystack is still checking, so the panel flips to verified on its own. */
export function useKyc() {
  return useQuery({ queryKey: KYC_KEY, queryFn: () => api<KycStatus>('/me/kyc'), refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? 5_000 : false) });
}

/** Live list from Paystack via the API, so payouts never offer a closed bank. */
export function useBanks() {
  return useQuery({ queryKey: ['banks'], queryFn: () => api<Bank[]>('/banks'), staleTime: 12 * 60 * 60_000 });
}

/** The bank tells us the account holder's name; the runner confirms it rather than typing it. */
export function useResolvedAccount(bankCode: string, accountNumber: string) {
  const complete = /^\d{10}$/.test(accountNumber) && bankCode.length > 0;
  const resolved = useQuery({
    queryKey: ['resolve-account', bankCode, accountNumber],
    queryFn: () => api<{ accountName: string; bankName?: string }>(`/banks/resolve?accountNumber=${encodeURIComponent(accountNumber)}&bankCode=${encodeURIComponent(bankCode)}`),
    enabled: complete,
    retry: false,
    staleTime: Infinity,
  });
  return { complete, resolved };
}

/** Type-to-search bank list in a sheet (Paystack lists ~290 Nigerian banks, too many to scroll). */
export function BankPicker({ banks, loading, value, onChange }: { banks: Bank[]; loading?: boolean; value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = banks.find((bank) => bank.code === value);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return banks;
    // Starts-with matches first ("gt" → GTBank before "Agribank Gtd…").
    return [...banks.filter((bank) => bank.name.toLowerCase().startsWith(q)), ...banks.filter((bank) => !bank.name.toLowerCase().startsWith(q) && bank.name.toLowerCase().includes(q))];
  }, [banks, query]);
  return <>
    <PickerField label="Bank" value={selected?.name ?? null} placeholder={loading ? 'Loading banks…' : 'Search for your bank'} onPress={() => !loading && setOpen(true)} />
    <Sheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(''); }} title="Bank" scroll={false}>
      <View style={{ paddingHorizontal: GUTTER + 4, paddingBottom: 8 }}>
        <View style={styles.search}>
          <SearchIcon size={16} color={colors.ink3} />
          <TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Search for your bank" placeholderTextColor={colors.ink3} style={styles.searchInput} autoCorrect={false} accessibilityLabel="Search banks" />
        </View>
      </View>
      <FlatList data={matches} keyExtractor={(bank) => bank.code} keyboardShouldPersistTaps="handled" style={{ height: 420 }}
        ListEmptyComponent={<Txt size={14} color="ink2" align="center" style={{ paddingVertical: 24 }}>{`No bank matches “${query}”.`}</Txt>}
        renderItem={({ item }) => <Pressable onPress={() => { haptic(); onChange(item.code); setOpen(false); setQuery(''); }} style={({ pressed }) => [styles.bank, pressed && { backgroundColor: colors.inkWash }]} accessibilityRole="radio" accessibilityState={{ checked: item.code === value }}>
          <Txt size={15} weight={item.code === value ? 'semibold' : 'regular'} style={{ flex: 1 }}>{item.name}</Txt>
          {item.code === value ? <CheckIcon size={16} /> : null}
        </Pressable>} />
    </Sheet>
  </>;
}

/** "Checking account…" then the account holder's name from the bank. */
export function ResolvedAccount({ resolved }: { resolved: ReturnType<typeof useResolvedAccount>['resolved'] }) {
  if (resolved.isLoading) return <View style={styles.checking}><ActivityIndicator color={colors.ink} size="small" /><Txt size={14} color="ink2">Checking account…</Txt></View>;
  if (resolved.data) return <View style={styles.resolved}>
    <View style={styles.tick}><CheckIcon size={16} color={colors.white} /></View>
    <View style={{ flex: 1, minWidth: 0 }}><Eyebrow color="ok">Account name</Eyebrow><Txt size={15} weight="bold" numberOfLines={1}>{resolved.data.accountName}</Txt></View>
  </View>;
  return <ErrorNotice error={resolved.error} />;
}

/**
 * KYC Level 2: legal name, BVN and a bank account in that name. Paystack checks they belong together;
 * the verified account becomes the only account payouts go to.
 */
export function KycPanel() {
  const kyc = useKyc();
  const banks = useBanks();
  const [changing, setChanging] = useState(false);
  if (kyc.isLoading) return <Skeleton style={{ height: 160 }} />;
  if (kyc.error) return <ErrorNotice error={kyc.error} onRetry={() => void kyc.refetch()} />;
  const status = kyc.data!;
  const bankName = (code?: string) => banks.data?.find((bank) => bank.code === code)?.name ?? (code ? `Bank ${code}` : '');

  if (status.status === 'PENDING') {
    return <View style={styles.panel} accessibilityLiveRegion="polite">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><ActivityIndicator color={colors.ink} size="small" /><Txt size={15} weight="bold">Checking your details…</Txt></View>
      <Txt size={13} color="ink2" style={{ marginTop: 8 }}>{`Paystack is confirming your BVN matches ${status.accountName} at ${bankName(status.bankCode)}. This usually takes a few minutes. You can leave this screen.`}</Txt>
    </View>;
  }
  if (status.status === 'VERIFIED' && !changing) {
    return <View style={[styles.panel, { borderColor: 'rgba(18,128,92,0.6)', backgroundColor: colors.okWash }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={styles.tick}><CheckIcon size={16} color={colors.white} /></View><Txt size={15} weight="bold">Identity verified</Txt></View>
      <Txt size={13} color="ink2" style={{ marginTop: 12 }}>{`${status.firstName} ${status.lastName} · BVN ••••${status.bvnLast4}`}</Txt>
      <Eyebrow style={{ marginTop: 16 }}>Payout account</Eyebrow>
      <Txt size={15} weight="bold" style={{ marginTop: 4 }}>{status.accountName}</Txt>
      <Txt size={13} color="ink2" num>{`${bankName(status.bankCode)} · •••• ${status.accountLast4}`}</Txt>
      <Button size="sm" variant="quiet" title="Use a different account" style={{ marginTop: 16 }} onPress={() => setChanging(true)} />
    </View>;
  }
  return <View style={{ gap: 16 }}>
    {status.status === 'FAILED' && <Notice tone="warn" title="Verification didn’t pass">{`${status.failureReason ?? 'Your details didn’t match.'} Check they match your BVN exactly and try again.`}</Notice>}
    {changing && <Notice tone="neutral" title="Changing your payout account">Verify again with the new account. Payouts pause until it’s verified, then for 24 hours as a security hold.</Notice>}
    {status.status === 'NONE' && !changing && <View style={[styles.panel, { borderWidth: 1, borderColor: colors.line }]}>
      <Txt size={15} weight="bold">Verify your identity</Txt>
      <Txt size={13} color="ink2" leading={1.5} style={{ marginTop: 4 }}>Needed for paid competitions, hosting and payouts; free competitions never need it. Prize money only goes to a bank account in your own name.</Txt>
    </View>}
    <KycForm banks={banks.data ?? []} banksLoading={banks.isLoading} initial={status} onCancel={changing ? () => setChanging(false) : undefined} onDone={() => setChanging(false)} />
  </View>;
}

function KycForm({ banks, banksLoading, initial, onCancel, onDone }: { banks: Bank[]; banksLoading: boolean; initial: KycStatus; onCancel?: () => void; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState(initial.firstName ?? '');
  const [lastName, setLastName] = useState(initial.lastName ?? '');
  const [bvn, setBvn] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [password, setPassword] = useState('');
  const { complete, resolved } = useResolvedAccount(bankCode, accountNumber);
  const submit = useMutation({
    mutationFn: () => post<KycStatus>('/me/kyc', { firstName: firstName.trim(), lastName: lastName.trim(), bvn, bankCode, accountNumber, password }),
    onSuccess(status) {
      haptic('success');
      setBvn('');
      setPassword('');
      queryClient.setQueryData(KYC_KEY, status);
      onDone();
    },
    onError() { setPassword(''); },
  });
  const valid = firstName.trim().length >= 2 && lastName.trim().length >= 2 && /^\d{11}$/.test(bvn) && complete && Boolean(resolved.data) && password.length >= 8;
  const digits = { fontFamily: mono, letterSpacing: 1.8 };
  return <View style={{ gap: 16 }}>
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <TextField containerStyle={{ flex: 1 }} label="First name" autoComplete="given-name" textContentType="givenName" value={firstName} onChangeText={setFirstName} />
      <TextField containerStyle={{ flex: 1 }} label="Last name" autoComplete="family-name" textContentType="familyName" value={lastName} onChangeText={setLastName} />
    </View>
    <Txt size={12} color="ink3" style={{ marginTop: -8 }}>As they appear on your BVN.</Txt>
    <TextField label="BVN" hint="Dial *565*0# on your registered line to get it." error={bvn.length > 0 && bvn.length < 11 ? `${11 - bvn.length} more digits. A BVN is 11 digits.` : undefined}
      keyboardType="number-pad" maxLength={11} value={bvn} onChangeText={(text) => setBvn(text.replace(/\D/g, ''))} style={digits} />
    <BankPicker banks={banks} loading={banksLoading} value={bankCode} onChange={setBankCode} />
    <TextField label="Account number" hint="An account in your own name. Prize money only goes here." keyboardType="number-pad" maxLength={10} value={accountNumber} onChangeText={(text) => setAccountNumber(text.replace(/\D/g, ''))} style={digits} />
    {complete && <ResolvedAccount resolved={resolved} />}
    <TextField label="Current password" hint="Required to protect bank details." secureTextEntry autoComplete="current-password" textContentType="password" maxLength={72} value={password} onChangeText={setPassword} />
    <ErrorNotice error={submit.error} />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Button title={submit.isPending ? 'Sending…' : 'Verify'} loading={submit.isPending} disabled={!valid} onPress={() => submit.mutate()} />
      {onCancel && <Button variant="quiet" title="Cancel" onPress={onCancel} />}
    </View>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ marginTop: 2 }}><LockIcon size={14} color={colors.ink3} /></View>
      <Txt size={12} color="ink3" leading={1.5} style={{ flex: 1 }}>Paystack checks your BVN with your bank. Jump never stores your BVN or full account number, only the last four digits and a one-way fingerprint that stops one person opening several paid accounts.</Txt>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  panel: { borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, padding: 16 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.white, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontFamily: fontFamily('regular'), fontSize: 16, color: colors.ink },
  bank: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER + 4, paddingVertical: 12 },
  checking: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 12 },
  resolved: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: 'rgba(18,128,92,0.6)', backgroundColor: colors.okWash, paddingHorizontal: 16, paddingVertical: 12 },
  tick: { width: 28, height: 28, borderRadius: radius.sm, backgroundColor: colors.ok, alignItems: 'center', justifyContent: 'center' },
});
