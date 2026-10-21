export function assertPrizeSplit(split: number[] | undefined, capacity: number | null): number[] {
  const shares = split ?? [10000];
  if (!Array.isArray(shares) || shares.length < 1 || shares.length > 100 ||
      shares.some((share) => !Number.isInteger(share) || share < 1) ||
      shares.reduce((sum, share) => sum + share, 0) !== 10000 ||
      (capacity !== null && shares.length > capacity)) {
    throw new Error('Prize shares must be positive, total 100%, and fit within the runner limit');
  }
  return shares;
}

export function allocatePrizes(amountKobo: number, split: number[]): number[] {
  if (!Number.isSafeInteger(amountKobo) || amountKobo < split.length) throw new Error('Prize pot is too small for the number of winners');
  const total = split.reduce((sum, share) => sum + share, 0);
  const amounts = split.map((share) => Math.floor(amountKobo * share / total));
  amounts[0] += amountKobo - amounts.reduce((sum, amount) => sum + amount, 0);
  if (amounts.some((amount) => amount < 1)) throw new Error('Every winner must receive at least one kobo');
  return amounts;
}

/** Tiny crowdfunded pots still settle: pay at least one kobo per payable place. */
export function allocateFundedPrizes(amountKobo: number, split: number[]): number[] {
  if (!Number.isSafeInteger(amountKobo) || amountKobo < split.length || split.length === 0) throw new Error('Prize pot is too small');
  const total = split.reduce((sum, share) => sum + share, 0);
  const remainder = amountKobo - split.length;
  const amounts = split.map((share) => 1 + Math.floor(remainder * share / total));
  amounts[0] += amountKobo - amounts.reduce((sum, amount) => sum + amount, 0);
  return amounts;
}
