import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { CheckIcon } from '../components/icons';
import { CopyButton, cx, EmptyState, ErrorNotice, PageHeader } from '../components/ui';
import { api, isApiError } from '../lib/api';
import { useUser } from '../lib/auth';
import { paymentCopy } from '../lib/copy';
import { formatMoney, formatRelative } from '../lib/format';
import { rememberTable } from '../lib/local';
import { dismissPayment, SavedPayment, updatePaymentStatus, useSavedPayments } from '../lib/payments';
import { keys } from '../lib/queries';
import type { PaymentStatus } from '../lib/types';

/**
 * Landing page after Paystack (or whenever the runner comes back). The browser redirect
 * proves nothing — we read the locally saved reference and ask the API for the truth.
 */
export function PaymentReturnPage() {
  const payments = useSavedPayments();
  return (
    <div className="mx-auto max-w-2xl animate-rise">
      <PageHeader eyebrow="Payments" title="Entry payments" description="We confirm every payment directly with Paystack. This page updates on its own — you can leave and come back." />
      {payments.length === 0 ? (
        <EmptyState
          title="No payments on this device"
          action={
            <Link to="/competitions" className="btn-secondary">
              Browse tables
            </Link>
          }
        >
          If you paid on another device, open Jump there to see its status.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {payments.map((payment) => (
            <PaymentCard key={payment.reference} payment={payment} />
          ))}
        </div>
      )}
    </div>
  );
}

const SLOW_AFTER_MS = 2 * 60_000;

function PaymentCard({ payment }: { payment: SavedPayment }) {
  const user = useUser();
  const queryClient = useQueryClient();
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
    refetchIntervalInBackground: false,
  });

  const value = status.data?.status ?? payment.lastStatus ?? 'PENDING';
  const copy = paymentCopy(value);
  const succeeded = value === 'SUCCEEDED';

  useEffect(() => {
    if (!status.data) return;
    updatePaymentStatus(payment.reference, status.data.status);
    if (status.data.status === 'SUCCEEDED') {
      rememberTable(user.id, { id: payment.tableId, code: payment.tableCode, title: payment.tableTitle });
      void queryClient.invalidateQueries({ queryKey: keys.standings(payment.tableId) });
    }
  }, [payment, queryClient, status.data, user.id]);

  const notFound = isApiError(status.error, 404);

  return (
    <article className={cx('rounded-md border-2 bg-card', succeeded ? 'border-ink shadow-hard' : 'border-ink')}>
      <header className={cx('flex items-center justify-between gap-3 border-b-2 border-ink px-5 py-3', succeeded ? 'bg-volt' : copy.terminal ? 'bg-card' : 'bg-warn-wash')}>
        <span className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em]">
          {succeeded ? <CheckIcon size={16} /> : !copy.terminal ? <span className="h-2 w-2 animate-blink rounded-full bg-warn" /> : null}
          {notFound ? 'Not found' : copy.label}
        </span>
        <span className="text-[12px] text-ink-2">Started {formatRelative(payment.createdAt)}</span>
      </header>
      <div className="p-5">
        <p className="eyebrow">{payment.tableTitle}</p>
        <h2 className="wide mt-1 text-[22px] font-black uppercase leading-tight">{notFound ? 'We can’t find this payment' : copy.title}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          {notFound ? 'This reference doesn’t belong to the account you’re signed in with. Switch accounts, or dismiss it.' : copy.body}
        </p>

        {status.error && !notFound && <ErrorNotice error={status.error} className="mt-4" />}

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-[13px]">
          <div>
            <dt className="text-ink-2">Amount</dt>
            <dd className="num mt-0.5 font-bold">{formatMoney(status.data?.amountKobo ?? payment.amountKobo)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-ink-2">Reference</dt>
            <dd className="mt-0.5 truncate font-mono text-[12px]">{payment.reference}</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          {succeeded && (
            <Link to="/competitions/$code" params={{ code: payment.tableCode }} className="btn-primary btn-sm">
              Go to table
            </Link>
          )}
          {(value === 'FAILED' || notFound) && (
            <Link to="/competitions/$code" params={{ code: payment.tableCode }} className="btn-secondary btn-sm">
              Back to table
            </Link>
          )}
          <CopyButton value={payment.reference} label="Copy reference" />
          {(copy.terminal || notFound) && (
            <button type="button" className="btn-quiet btn-sm" onClick={() => dismissPayment(payment.reference)}>
              Dismiss
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
