/**
 * Paystack checkout references are saved before opening checkout so a pending payment can be recovered
 * later, even after the app restarts. Only the server's status decides whether an entry succeeded.
 */
import { readStored, useStored, writeStored } from './local';

export interface SavedPayment {
  reference: string;
  purpose?: 'CHALLENGE_ENTRY' | 'WALLET_FUNDING' | 'SPONSOR_FUNDING';
  tableId?: string;
  tableCode?: string;
  tableTitle: string;
  amountKobo: number;
  createdAt: string;
  /** Last status we saw from the API. */
  lastStatus?: string;
}

const KEY = 'jump_payments';

export function savePayment(payment: SavedPayment) {
  writeStored(KEY, [payment, ...readStored<SavedPayment[]>(KEY, []).filter((item) => item.reference !== payment.reference)].slice(0, 10));
}

export function updatePaymentStatus(reference: string, status: string) {
  const all = readStored<SavedPayment[]>(KEY, []);
  const target = all.find((item) => item.reference === reference);
  if (!target || target.lastStatus === status) return;
  target.lastStatus = status;
  writeStored(KEY, all);
}

export function dismissPayment(reference: string) {
  writeStored(KEY, readStored<SavedPayment[]>(KEY, []).filter((item) => item.reference !== reference));
}

export function useSavedPayments() {
  return useStored<SavedPayment[]>(KEY, [])[0];
}

export const OPEN_PAYMENT_STATUSES = ['INITIATED', 'PENDING', undefined];
