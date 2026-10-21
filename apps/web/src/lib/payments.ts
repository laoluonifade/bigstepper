/**
 * Paystack checkout references are saved before leaving the app so a pending
 * payment can be recovered on return — or after a refresh, or days later.
 * Only the server's status decides whether an entry succeeded.
 */
import { useStored } from './local';

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

function readAll(): SavedPayment[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedPayment[];
  } catch {
    return [];
  }
}

function writeAll(payments: SavedPayment[]) {
  localStorage.setItem(KEY, JSON.stringify(payments));
  window.dispatchEvent(new CustomEvent('jump:storage', { detail: KEY }));
}

export function savePayment(payment: SavedPayment) {
  writeAll([payment, ...readAll().filter((item) => item.reference !== payment.reference)].slice(0, 10));
}

export function updatePaymentStatus(reference: string, status: string) {
  const all = readAll();
  const target = all.find((item) => item.reference === reference);
  if (!target || target.lastStatus === status) return;
  target.lastStatus = status;
  writeAll(all);
}

export function dismissPayment(reference: string) {
  writeAll(readAll().filter((item) => item.reference !== reference));
}

export function useSavedPayments() {
  return useStored<SavedPayment[]>(KEY, [])[0];
}

export const OPEN_PAYMENT_STATUSES = ['INITIATED', 'PENDING', undefined];
