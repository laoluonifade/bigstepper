import type { ClubPrize, PrizeKind } from './types';

export const PRIZE_KIND: Record<PrizeKind, { label: string; hint: string }> = {
  product: { label: 'Product', hint: 'Shipped to the winner, so they give a delivery address.' },
  discount: { label: 'Discount', hint: 'A code or offer. Winners see your instructions once they claim.' },
  experience: { label: 'Experience', hint: 'An event, session or trip. Winners give a phone number to arrange it.' },
};

export interface PrizeDraft {
  prizes: ClubPrize[];
  selection: 'top' | 'draw';
  deliveryCountries: string[];
  fulfilment: 'club' | 'jump';
  shipping: 'club' | 'jump' | 'other';
  shippingNote: string;
  eligibilityNote: string;
  claimDays: number;
}

export const EMPTY_PRIZES: PrizeDraft = {
  prizes: [{ position: 1, kind: 'product', productName: '', quantity: 1 }],
  selection: 'top',
  deliveryCountries: ['NG'],
  fulfilment: 'club',
  shipping: 'club',
  shippingNote: '',
  eligibilityNote: '',
  claimDays: 14,
};

/** What's wrong with the prizes, if anything, for the create button's hint. */
export function prizeProblem(draft: PrizeDraft, capacity: number | undefined) {
  if (draft.prizes.some((prize) => prize.productName.trim().length < 2)) return 'Name every prize.';
  if (draft.prizes.some((prize) => !Number.isInteger(prize.quantity) || prize.quantity < 1)) return 'Each prize needs at least one winner.';
  if (!draft.deliveryCountries.length) return 'Choose where you can deliver prizes.';
  const winners = draft.prizes.reduce((sum, prize) => sum + prize.quantity, 0);
  if (capacity && winners > capacity) return `There are ${winners} prizes but only ${capacity} places.`;
  return null;
}

/** The API's shape. The club commits to the prizes and delivery coverage when it publishes. */
export function prizesPayload(draft: PrizeDraft) {
  return {
    prizes: draft.prizes.map((prize, index) => ({
      position: index + 1, kind: prize.kind, productName: prize.productName.trim(), quantity: prize.quantity,
      ...(prize.description?.trim() ? { description: prize.description.trim() } : {}),
      ...(prize.imageUrl ? { imageUrl: prize.imageUrl } : {}),
      ...(prize.estimatedValue ? { estimatedValue: prize.estimatedValue, currency: prize.currency ?? 'NGN' } : {}),
      ...(prize.redeemInstructions?.trim() ? { redeemInstructions: prize.redeemInstructions.trim() } : {}),
    })),
    selection: draft.selection,
    deliveryCountries: draft.deliveryCountries,
    fulfilment: draft.fulfilment,
    shipping: draft.shipping,
    ...(draft.shippingNote.trim() ? { shippingNote: draft.shippingNote.trim() } : {}),
    ...(draft.eligibilityNote.trim() ? { eligibilityNote: draft.eligibilityNote.trim() } : {}),
    claimDays: draft.claimDays,
    committed: true as const,
  };
}

/** Jump's fee on cash a host puts up, taken from what they pay (the API's calculatePrizeBreakdown). */
export const JUMP_FEE_BPS = 1500;

/**
 * A host types the prize winners should share; this is what they pay so that, after Jump's fee, the
 * prize is exactly that (or a kobo over, never under).
 */
export function fundingForPrize(prizeKobo: number) {
  let totalKobo = Math.ceil(prizeKobo * 10_000 / (10_000 - JUMP_FEE_BPS));
  while (totalKobo - Math.floor(totalKobo * JUMP_FEE_BPS / 10_000) < prizeKobo) totalKobo += 1;
  return { totalKobo, feeKobo: totalKobo - prizeKobo };
}
