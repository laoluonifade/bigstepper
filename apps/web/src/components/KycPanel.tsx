import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, post } from '../lib/api';
import { BankPicker } from './BankPicker';
import { CheckIcon, JumpLogo, LockIcon } from './icons';
import { ErrorNotice, Field, Notice, Skeleton } from './ui';

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

export const KYC_KEY = ['kyc'] as const;

/** Polls while Paystack is still checking, so the panel flips to verified on its own. */
export function useKyc() {
  return useQuery({
    queryKey: KYC_KEY,
    queryFn: () => api<KycStatus>('/me/kyc'),
    refetchInterval: (query) => query.state.data?.status === 'PENDING' ? 5_000 : false,
  });
}

function useBanks() {
  return useQuery({ queryKey: ['banks'], queryFn: () => api<Array<{ code: string; name: string }>>('/banks'), staleTime: 12 * 60 * 60_000 });
}

/**
 * KYC Level 2: legal name, BVN and a bank account in that name. Paystack checks they belong together;
 * the verified account becomes the only account payouts go to.
 */
export function KycPanel() {
  const kyc = useKyc();
  const banks = useBanks();
  const [changing, setChanging] = useState(false);
  if (kyc.isLoading) return <Skeleton className="h-40" />;
  if (kyc.error) return <ErrorNotice error={kyc.error} onRetry={() => void kyc.refetch()} />;
  const status = kyc.data!;
  const bankName = (code?: string) => banks.data?.find((bank) => bank.code === code)?.name ?? (code ? `Bank ${code}` : '');

  if (status.status === 'PENDING') {
    return <div className="rounded-md border-[1.5px] border-ink bg-card p-4" aria-live="polite">
      <div className="flex items-center gap-3"><JumpLogo height={12} motion="loop" /><p className="text-[15px] font-bold">Checking your details…</p></div>
      <p className="mt-2 text-[13px] text-ink-2">Paystack is confirming your BVN matches {status.accountName} at {bankName(status.bankCode)}. This usually takes a few minutes. You can leave this page.</p>
    </div>;
  }

  if (status.status === 'VERIFIED' && !changing) {
    return <div className="rounded-md border-[1.5px] border-ok/60 bg-ok-wash p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-ok text-white"><CheckIcon size={16} /></span>
        <p className="text-[15px] font-bold">Identity verified</p>
      </div>
      <p className="mt-3 text-[13px] text-ink-2">{status.firstName} {status.lastName} · BVN ••••{status.bvnLast4}</p>
      <p className="eyebrow mt-4">Payout account</p>
      <p className="mt-1 text-[15px] font-bold">{status.accountName}</p>
      <p className="num text-[13px] text-ink-2">{bankName(status.bankCode)} · •••• {status.accountLast4}</p>
      <button type="button" className="btn-quiet btn-sm mt-4" onClick={() => setChanging(true)}>Use a different account</button>
    </div>;
  }

  return <div className="space-y-4">
    {status.status === 'FAILED' && <Notice tone="warn" title="Verification didn’t pass">{status.failureReason ?? 'Your details didn’t match.'} Check they match your BVN exactly and try again.</Notice>}
    {changing && <Notice tone="neutral" title="Changing your payout account">Verify again with the new account. Payouts pause until it’s verified, then for 24 hours as a security hold.</Notice>}
    {status.status === 'NONE' && !changing && <div className="rounded-md border border-line bg-card p-4">
      <p className="text-[15px] font-bold">Verify your identity</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
        Needed for paid competitions, hosting and payouts; free competitions never need it. Prize money only goes to a bank account in your own name.
      </p>
    </div>}
    <KycForm banks={banks.data ?? []} banksLoading={banks.isLoading} initial={status} onCancel={changing ? () => setChanging(false) : undefined} onDone={() => setChanging(false)} />
  </div>;
}

function KycForm({ banks, banksLoading, initial, onCancel, onDone }: {
  banks: Array<{ code: string; name: string }>; banksLoading: boolean; initial: KycStatus; onCancel?: () => void; onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState(initial.firstName ?? '');
  const [lastName, setLastName] = useState(initial.lastName ?? '');
  const [bvn, setBvn] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [password, setPassword] = useState('');
  const complete = /^\d{10}$/.test(accountNumber) && bankCode.length > 0;
  const resolved = useQuery({
    queryKey: ['resolve-account', bankCode, accountNumber],
    queryFn: () => api<{ accountName: string }>(`/banks/resolve?accountNumber=${encodeURIComponent(accountNumber)}&bankCode=${encodeURIComponent(bankCode)}`),
    enabled: complete,
    retry: false,
    staleTime: Infinity,
  });
  const submit = useMutation({
    mutationFn: () => post<KycStatus>('/me/kyc', { firstName: firstName.trim(), lastName: lastName.trim(), bvn, bankCode, accountNumber, password }),
    onSuccess(status) {
      setBvn('');
      setPassword('');
      queryClient.setQueryData(KYC_KEY, status);
      onDone();
    },
    onError() { setPassword(''); },
  });
  const valid = firstName.trim().length >= 2 && lastName.trim().length >= 2 && /^\d{11}$/.test(bvn) && complete && Boolean(resolved.data) && password.length >= 8;

  return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (valid) submit.mutate(); }}>
    <div className="grid grid-cols-2 gap-3">
      <Field label="First name">{(props) => <input {...props} className="field" autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />}</Field>
      <Field label="Last name">{(props) => <input {...props} className="field" autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required />}</Field>
    </div>
    <p className="-mt-2 text-[12px] text-ink-3">As they appear on your BVN.</p>
    <Field label="BVN" hint="Dial *565*0# on your registered line to get it." error={bvn.length > 0 && bvn.length < 11 ? `${11 - bvn.length} more digits. A BVN is 11 digits.` : undefined}>
      {(props) => <input {...props} className="field num font-mono tracking-[0.12em]" inputMode="numeric" autoComplete="off" maxLength={11} value={bvn} onChange={(event) => setBvn(event.target.value.replace(/\D/g, ''))} required />}
    </Field>
    <Field label="Bank">{(props) => <BankPicker {...props} banks={banks} loading={banksLoading} value={bankCode} onChange={setBankCode} />}</Field>
    <Field label="Account number" hint="An account in your own name. Prize money only goes here.">
      {(props) => <input {...props} className="field num font-mono tracking-[0.12em]" inputMode="numeric" autoComplete="off" maxLength={10} value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, ''))} required />}
    </Field>
    {complete && <div aria-live="polite">
      {resolved.isLoading ? <div className="flex items-center gap-3 rounded-md border border-line bg-card px-4 py-3 text-[14px] text-ink-2"><JumpLogo height={12} motion="loop" /> Checking account…</div>
        : resolved.data ? <div className="rounded-md border-[1.5px] border-ok/60 bg-ok-wash px-4 py-3"><p className="eyebrow text-ok">Account name</p><p className="truncate text-[15px] font-bold">{resolved.data.accountName}</p></div>
          : <ErrorNotice error={resolved.error} />}
    </div>}
    <Field label="Current password" hint="Required to protect bank details.">
      {(props) => <input {...props} className="field" type="password" autoComplete="current-password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required />}
    </Field>
    {submit.error && <ErrorNotice error={submit.error} />}
    <div className="flex gap-2">
      <button className="btn-primary" disabled={!valid || submit.isPending}>{submit.isPending ? 'Sending…' : 'Verify'}</button>
      {onCancel && <button type="button" className="btn-quiet" onClick={onCancel}>Cancel</button>}
    </div>
    <p className="flex gap-2 text-[12px] leading-relaxed text-ink-3">
      <LockIcon size={14} className="mt-0.5 shrink-0" />
      <span>Paystack checks your BVN with your bank. Jump never stores your BVN or full account number, only the last four digits and a one-way fingerprint that stops one person opening several paid accounts.</span>
    </p>
  </form>;
}
