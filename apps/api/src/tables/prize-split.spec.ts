import { allocatePrizes, assertPrizeSplit } from './prize-split';

describe('challenge prize splits', () => {
  it('defaults to winner-take-all', () => {
    expect(assertPrizeSplit(undefined, null)).toEqual([10000]);
    expect(allocatePrizes(10001, [10000])).toEqual([10001]);
  });

  it('allocates every kobo across the selected places', () => {
    const amounts = allocatePrizes(10001, assertPrizeSplit([5000, 3000, 2000], 10));
    expect(amounts).toEqual([5001, 3000, 2000]);
    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(10001);
  });

  it('normalizes shares when fewer runners finish', () => {
    expect(allocatePrizes(10000, [5000, 3000])).toEqual([6250, 3750]);
  });

  it('rejects invalid splits and amounts too small for all places', () => {
    expect(() => assertPrizeSplit([6000, 3000], 3)).toThrow();
    expect(() => assertPrizeSplit([5000, 5000], 1)).toThrow();
    expect(() => allocatePrizes(2, [5000, 3000, 2000])).toThrow();
  });
});
