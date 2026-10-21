import { paidPrizePot } from './paid-prize';

describe('paid prize pot', () => {
  it('derives the fixed gross prize from capacity and entry fee', () => {
    expect(paidPrizePot(20, 100_000)).toBe(2_000_000);
  });

  it('rejects missing or excessive amounts', () => {
    expect(() => paidPrizePot(undefined as unknown as number, 100_000)).toThrow();
    expect(() => paidPrizePot(20, 100_000_000)).toThrow();
  });
});
