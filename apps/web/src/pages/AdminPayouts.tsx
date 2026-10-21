import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FormEvent, useState } from 'react';
import { CheckIcon, WalletIcon } from '../components/icons';
import { Avatar, cx, EmptyState, ErrorNotice, Notice, PageHeader, Segmented, Skeleton } from '../components/ui';
import { api, isApiError, post } from '../lib/api';
import { formatDate, formatDateTime, formatMoney, formatRelative } from '../lib/format';

interface PayoutRequest {
  id: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  kind: 'PRIZE' | 'CREATOR';
  amountKobo: number;
  challengeTitle: string | null;
  challengeCode: string | null;
  userId: string;
  email: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  accountName: string;
  bankCode: string;
  accountLast4: string;
  availableForPayoutAt: string;
  /** Recipient or challenge funding is under a payment hold. */
  blocked: boolean;
  reviewedBy: string | null;
  transferStatus: string | null;
}

type View = 'pending' | 'history';

const STATUS: Record<string, { label: string; tone: string }> = {
  PROCESSING: { label: 'Sending', tone: 'border-warn/60 bg-warn-wash text-warn' },
  SUCCEEDED: { label: 'Paid', tone: 'border-ok/60 bg-ok-wash text-ok' },
  PAID: { label: 'Paid', tone: 'border-ok/60 bg-ok-wash text-ok' },
  FAILED: { label: 'Failed', tone: 'border-bad/60 bg-bad-wash text-bad' },
  REVERSED: { label: 'Reversed', tone: 'border-bad/60 bg-bad-wash text-bad' },
  REJECTED: { label: 'Rejected', tone: 'border-line bg-paper text-ink-2' },
};

const REASONS = ['The bank details don’t match the runner’s name.', 'This win is under review for fair play.', 'Please verify your email first.'];

/** Every prize and creator payout waits here until an admin approves (and sends) or rejects it. */
export function AdminPayoutsPage() {
  const [view, setView] = useState<View>('pending');
  const payouts = useQuery({
    queryKey: ['admin-payouts', view],
    queryFn: () => api<PayoutRequest[]>(`/admin/payouts?view=${view}`),
    refetchInterval: view === 'pending' ? 30_000 : false,
  });
  const banks = useQuery({ queryKey: ['banks'], queryFn: () => api<Array<{ code: string; name: string }>>('/banks'), staleTime: 12 * 60 * 60_000 });
  const bankName = (code: string) => banks.data?.find((bank) => bank.code === code)?.name ?? `Bank ${code}`;
  const list = payouts.data ?? [];
  const pendingTotal = view === 'pending' ? list.reduce((total, item) => total + item.amountKobo, 0) : 0;

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Staff"
        title="Payouts"
        description="Prize winners and creators request payouts here. Nothing is sent until you approve it, and approving sends the money through Paystack straight away."
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented<View>
          label="Payout requests"
          value={view}
          onChange={setView}
          options={[
            { value: 'pending', label: 'Waiting for you' },
            { value: 'history', label: 'History' },
          ]}
        />
        {view === 'pending' && list.length > 0 && (
          <p className="num text-[13px] font-semibold">
            {list.length} waiting · {formatMoney(pendingTotal)}
          </p>
        )}
      </div>

      <ErrorNotice error={payouts.error} onRetry={() => void payouts.refetch()} className="mb-4" />
      {payouts.isLoading ? (
        <Skeleton className="h-48" />
      ) : list.length === 0 ? (
        <EmptyState mark={<WalletIcon size={40} className="mx-auto" />} title={view === 'pending' ? 'Nothing to approve' : 'No payouts yet'}>
          {view === 'pending' ? 'When a winner or creator requests a payout, it shows up here.' : 'Approved and rejected payouts will be listed here.'}
        </EmptyState>
      ) : (
        <ul className="stagger space-y-3">
          {list.map((item) => (
            <PayoutCard key={item.id} item={item} bank={bankName(item.bankCode)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PayoutCard({ item, bank }: { item: PayoutRequest; bank: string }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
  const approve = useMutation({
    mutationFn: () => post<{ status: string }>(`/admin/payouts/${item.id}/approve`, { password }),
    onSuccess: refresh,
    onSettled: () => setPassword(''),
  });
  const reject = useMutation({ mutationFn: () => post(`/admin/payouts/${item.id}/reject`, { reason: reason.trim() }), onSuccess: refresh });

  const name = item.displayName ?? item.email;
  const pending = item.status === 'PENDING_APPROVAL';
  const onHold = new Date(item.availableForPayoutAt) > new Date();
  const blocked = item.blocked || onHold;
  const status = STATUS[item.transferStatus === 'RECONCILIATION_REQUIRED' ? 'PROCESSING' : item.status] ?? { label: item.status, tone: 'border-line bg-paper text-ink-2' };

  function submitApprove(event: FormEvent) {
    event.preventDefault();
    if (password.length >= 8) approve.mutate();
  }
  function submitReject(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length >= 5) reject.mutate();
  }

  return (
    <li className={cx('rounded-md border-[1.5px] bg-card', pending ? 'border-ink shadow-hard-sm' : 'border-line')}>
      <div className="flex flex-wrap items-start gap-4 p-4">
        <Avatar name={name} src={item.avatarUrl} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold">
            {item.username ? (
              <Link to="/runners/$username" params={{ username: item.username }} search={{}} className="hover:underline hover:underline-offset-4">
                {name}
              </Link>
            ) : (
              name
            )}
          </p>
          <p className="truncate text-[12px] text-ink-2">
            {item.username && `@${item.username} · `}
            {item.email}
          </p>
          <p className="mt-2 text-[13px]">
            <span className={cx('tag mr-2 h-5 px-1.5 text-[9.5px]', item.kind === 'PRIZE' ? 'border-ink bg-volt' : 'border-ink bg-paper')}>
              {item.kind === 'PRIZE' ? 'Prize' : 'Creator share'}
            </span>
            {item.challengeCode ? (
              <Link to="/competitions/$code" params={{ code: item.challengeCode }} className="font-semibold hover:underline hover:underline-offset-4">
                {item.challengeTitle}
              </Link>
            ) : (
              item.challengeTitle
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="score num text-[30px]">{formatMoney(item.amountKobo).replace(/\.00$/, '')}</p>
          {pending ? (
            <p className="text-[12px] text-ink-2">Requested {formatRelative(item.createdAt)}</p>
          ) : (
            <span className={cx('tag mt-1', status.tone)}>{status.label}</span>
          )}
        </div>
      </div>

      <div className="grid gap-x-6 gap-y-1 border-t border-line px-4 py-3 text-[13px] sm:grid-cols-2">
        <p>
          <span className="text-ink-2">Pays to </span>
          <span className="font-semibold">{item.accountName}</span>
        </p>
        <p className="num">
          <span className="text-ink-2">{bank} · </span>
          <span className="font-semibold">•••• {item.accountLast4}</span>
        </p>
      </div>

      {pending && blocked && (
        <div className="px-4 pb-3">
          {item.blocked && (
            <Notice tone="warn" title="Payment hold">
              This recipient or the challenge funding is under review, so the prize can’t be paid out yet. Wait until the issue is resolved.
            </Notice>
          )}
          {onHold && (
            <Notice tone="warn" title="On security hold" className={item.blocked ? 'mt-2' : undefined}>
              Their bank details changed recently. You can send this from {formatDateTime(item.availableForPayoutAt)}.
            </Notice>
          )}
        </div>
      )}

      {!pending && (
        <p className="border-t border-line px-4 py-3 text-[12px] text-ink-2">
          {item.status === 'REJECTED' ? 'Rejected' : 'Approved'}
          {item.reviewedBy && ` by ${item.reviewedBy}`}
          {item.reviewedAt && ` on ${formatDate(item.reviewedAt, { year: 'numeric' })}`}
          {item.rejectionReason && <span className="mt-1 block text-ink">“{item.rejectionReason}”</span>}
        </p>
      )}

      {pending && mode === 'idle' && (
        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
          <button type="button" className="btn-primary btn-sm" disabled={blocked} onClick={() => setMode('approve')}>
            <CheckIcon size={15} /> Approve & send
          </button>
          <button type="button" className="btn-quiet btn-sm" onClick={() => setMode('reject')}>
            Reject
          </button>
        </div>
      )}

      {pending && mode === 'approve' && (
        <form onSubmit={submitApprove} className="space-y-3 border-t border-line bg-paper px-4 py-4">
          <p className="text-[14px]">
            Send <span className="font-bold">{formatMoney(item.amountKobo)}</span> to {item.accountName} now? Paystack starts the transfer immediately and it can’t be pulled back.
          </p>
          <label className="block">
            <span className="label">Your password, to confirm</span>
            <input className="field" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
          </label>
          {approve.error && (
            <p className="text-[13px] font-semibold text-bad">
              {isApiError(approve.error, 403) && /password/i.test(approve.error.message) ? 'That password isn’t right.' : approve.error.message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary btn-sm" disabled={password.length < 8 || approve.isPending}>
              {approve.isPending ? 'Sending…' : `Send ${formatMoney(item.amountKobo)}`}
            </button>
            <button type="button" className="btn-quiet btn-sm" onClick={() => setMode('idle')} disabled={approve.isPending}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {pending && mode === 'reject' && (
        <form onSubmit={submitReject} className="space-y-3 border-t border-line bg-paper px-4 py-4">
          <p className="label">Why? {name.split(' ')[0]} sees this and can request again after fixing it.</p>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((preset) => (
              <button key={preset} type="button" className={cx('btn btn-sm border-[1.5px] border-line text-left normal-case', reason === preset && 'border-ink bg-ink text-paper')} onClick={() => setReason(preset)}>
                {preset}
              </button>
            ))}
          </div>
          <textarea className="field min-h-[72px] py-3" maxLength={300} placeholder="Or write a reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          {reject.error && <p className="text-[13px] font-semibold text-bad">{reject.error.message}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn-danger btn-sm" disabled={reason.trim().length < 5 || reject.isPending}>
              {reject.isPending ? 'Rejecting…' : 'Reject payout'}
            </button>
            <button type="button" className="btn-quiet btn-sm" onClick={() => setMode('idle')} disabled={reject.isPending}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
