import type { PaymentStatusValue, VerificationStatus } from './types';

export const VERIFICATION_REASONS: Record<string, { title: string; detail: string }> = {
  LOW_GPS_ACCURACY: {
    title: 'Weak GPS signal',
    detail: 'Some location points were less precise than 50 m, so they were left out of the measured distance.',
  },
  GPS_GAP: {
    title: 'Signal dropped out',
    detail: 'Your phone stopped sending location for more than two minutes at least once. Keep the app open and the screen on while you run.',
  },
  IMPLAUSIBLE_SPEED: {
    title: 'Travelled at vehicle speed',
    detail: 'For more than 30 seconds the route moved faster than anyone can on foot (or a bike, for rides). That usually means a car or a bus.',
  },
  NO_GPS_MOVEMENT: {
    title: 'No route we could measure',
    detail: 'There wasn’t enough clear GPS to see you move. Try again outdoors with a clear view of the sky.',
  },
  STEPS_WITHOUT_MOVEMENT: {
    title: 'More steps than the distance',
    detail: 'Your phone counted more steps than the measured route needs, so steps were capped to match the distance. Your distance is unaffected.',
  },
  IMPLAUSIBLE_STEP_RATE: {
    title: 'Some steps left out',
    detail: 'A burst of steps came in faster than anyone can walk or run, so those were left out. Your distance is unaffected.',
  },
  NON_MONOTONIC_STEPS: {
    title: 'Step counter restarted',
    detail: 'Your phone’s step counter restarted during the activity. Steps carried on from where it left off.',
  },
  NON_MONOTONIC_TIME: {
    title: 'Points out of order',
    detail: 'Some location points had timestamps that went backwards and were skipped.',
  },
  INSUFFICIENT_GPS_DATA: {
    title: 'Not enough GPS data',
    detail: 'We didn’t receive enough location points to measure a route.',
  },
};

export function describeReason(code: string) {
  return (
    VERIFICATION_REASONS[code] ?? {
      title: code.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
      detail: 'This run was marked for a manual check.',
    }
  );
}

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  PENDING_VERIFICATION: 'Verifying',
  VERIFIED: 'Verified',
  FLAGGED: 'Flagged',
  REJECTED: 'Rejected',
};

export const PAYMENT_COPY: Record<PaymentStatusValue, { label: string; title: string; body: string; terminal: boolean }> = {
  INITIATED: {
    label: 'Starting',
    title: 'Opening checkout',
    body: 'We’re setting up your payment with Paystack.',
    terminal: false,
  },
  PENDING: {
    label: 'Confirming',
    title: 'Confirming your payment',
    body: 'Paystack hasn’t confirmed this payment yet. If you’ve paid, it usually clears within a minute. Your seat is secured only once this says confirmed.',
    terminal: false,
  },
  SUCCEEDED: {
    label: 'Confirmed',
    title: 'You’re in',
    body: 'Payment confirmed and your entry is registered. Verified runs from now on count toward the table.',
    terminal: true,
  },
  FAILED: {
    label: 'Failed',
    title: 'Payment didn’t go through',
    body: 'No entry was created. You can try again from the competition page. If money left your account, contact support with the reference below.',
    terminal: true,
  },
  REFUND_PENDING: {
    label: 'Refunding',
    title: 'Refund on the way',
    body: 'Your payment cleared, but the competition filled up or closed before your seat could be confirmed. A full refund has been started automatically.',
    terminal: true,
  },
  RECONCILIATION_REQUIRED: {
    label: 'Needs review',
    title: 'We’re checking this payment',
    body: 'Paystack’s record didn’t match ours, so a person needs to review it. You don’t need to pay again. Contact support with the reference below if this doesn’t resolve.',
    terminal: true,
  },
};

export function paymentCopy(status: string) {
  return (
    PAYMENT_COPY[status as PaymentStatusValue] ?? {
      label: status,
      title: 'Payment status updated',
      body: 'Contact support with the reference below if you have questions.',
      terminal: true,
    }
  );
}

export const AWARD_STATUS: Record<string, string> = {
  PENDING_APPROVAL: 'Unclaimed',
  APPROVED: 'Approved',
  PROCESSING: 'Paying out',
  PAID: 'Paid',
  FAILED: 'Failed',
  REVERSED: 'Reversed',
};

/** Turns a 409 from free registration into something a runner can act on. */
export function joinConflictCopy(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes('already')) return 'You’re already on this table.';
  if (lower.includes('full')) return 'This competition is full. Every seat has been taken.';
  if (lower.includes('not open')) return 'Entry has closed for this table.';
  return message;
}
