import { calculatePrizeBreakdown, cashPrizeEligible } from './financial-policy';
import { allocatePrizes } from '../tables/prize-split';

describe('Jump prize fee policy', () => {
  it('deducts 30% for an ordinary challenge', () => {
    expect(calculatePrizeBreakdown(100_000, 3000, 0)).toEqual({
      grossPrizeKobo: 100_000,
      platformFeeKobo: 30_000,
      creatorCommissionKobo: 0,
      platformRetainedKobo: 30_000,
      winnerAmountKobo: 70_000,
    });
  });

  it('reserves 85% of a funded-free deposit for all prize places', () => {
    const result = calculatePrizeBreakdown(10_001, 1500, 0);
    expect(result.platformRetainedKobo).toBe(1500);
    expect(allocatePrizes(result.winnerAmountKobo, [5000, 3000, 2000])).toEqual([4251, 2550, 1700]);
  });

  it('deducts 35% and allocates 5% to the creator', () => {
    expect(calculatePrizeBreakdown(100_000, 3500, 500)).toEqual({
      grossPrizeKobo: 100_000,
      platformFeeKobo: 35_000,
      creatorCommissionKobo: 5_000,
      platformRetainedKobo: 30_000,
      winnerAmountKobo: 65_000,
    });
  });
});

describe('funded prize eligibility', () => {
  const funders = new Set(['runner', 'host']);

  it('lets a contributor win in an open funded-free pool', () => {
    expect(cashPrizeEligible({ type: 'sponsored', creatorId: 'host', guaranteedPrizeKobo: null }, 'runner', funders)).toBe(true);
  });

  it('still excludes the host and keeps fixed funded prizes separate', () => {
    expect(cashPrizeEligible({ type: 'sponsored', creatorId: 'host', guaranteedPrizeKobo: null }, 'host', funders)).toBe(false);
    expect(cashPrizeEligible({ type: 'sponsored', creatorId: 'host', guaranteedPrizeKobo: 10_000 }, 'runner', funders)).toBe(false);
  });
});
