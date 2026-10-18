export function calculatePrizeBreakdown(grossPrizeKobo: number, platformFeeBps: number, creatorCommissionBps: number) {
  if (!Number.isInteger(grossPrizeKobo) || grossPrizeKobo <= 0) throw new Error('Gross prize must be positive integer kobo');
  if (creatorCommissionBps > platformFeeBps) throw new Error('Creator commission cannot exceed the total platform fee');
  const platformFeeKobo = Math.floor(grossPrizeKobo * platformFeeBps / 10_000);
  const creatorCommissionKobo = Math.floor(grossPrizeKobo * creatorCommissionBps / 10_000);
  return {
    grossPrizeKobo,
    platformFeeKobo,
    creatorCommissionKobo,
    platformRetainedKobo: platformFeeKobo - creatorCommissionKobo,
    winnerAmountKobo: grossPrizeKobo - platformFeeKobo,
  };
}
