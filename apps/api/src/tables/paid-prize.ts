export function paidPrizePot(capacity: number, entryFeeKobo: number): number {
  const amount = capacity * entryFeeKobo;
  if (!Number.isSafeInteger(capacity) || capacity < 2 || capacity > 10000 ||
      !Number.isSafeInteger(entryFeeKobo) || entryFeeKobo < 100 ||
      !Number.isSafeInteger(amount) || amount > 1_000_000_000) {
    throw new Error('Max runners × entry fee must produce a prize pot between ₦2 and ₦10,000,000');
  }
  return amount;
}
