import { decideOutcomes, StandingInput } from './league-rules';

const row = (id: string, level: number, km: number): StandingInput => ({
  membershipId: id,
  divisionLevel: level,
  creditedDistanceMetres: km * 1000,
});

const outcomes = (rows: StandingInput[]) =>
  Object.fromEntries(decideOutcomes(rows, 1, 5).map((result) => [result.membershipId, result.outcome]));

describe('decideOutcomes', () => {
  it('promotes the top 20% and relegates the bottom 20% of a middle division', () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`r${i + 1}`, 3, 100 - i));
    const result = outcomes(rows);
    expect(result.r1).toBe('PROMOTED');
    expect(result.r2).toBe('PROMOTED');
    expect(result.r3).toBe('STAYED');
    expect(result.r8).toBe('STAYED');
    expect(result.r9).toBe('RELEGATED');
    expect(result.r10).toBe('RELEGATED');
  });

  it('ranks by distance, not input order', () => {
    const results = decideOutcomes([row('slow', 2, 1), row('fast', 2, 9)], 1, 5);
    expect(results.find((r) => r.membershipId === 'fast')).toMatchObject({ finalRank: 1, outcome: 'PROMOTED', nextLevel: 3 });
    expect(results.find((r) => r.membershipId === 'slow')).toMatchObject({ finalRank: 2, outcome: 'STAYED', nextLevel: 2 });
  });

  it('never promotes a runner with no verified distance', () => {
    expect(outcomes([row('idle', 1, 0)]).idle).toBe('STAYED');
  });

  it('a lone active runner moves up', () => {
    expect(outcomes([row('solo', 1, 3)]).solo).toBe('PROMOTED');
  });

  it('relegates anyone with no distance outside the bottom division', () => {
    const result = outcomes([row('a', 2, 10), row('b', 2, 0), row('c', 2, 0)]);
    expect(result.a).toBe('PROMOTED');
    expect(result.b).toBe('RELEGATED');
    expect(result.c).toBe('RELEGATED');
  });

  it('keeps the top and bottom divisions in bounds', () => {
    expect(outcomes([row('top', 5, 50)]).top).toBe('STAYED');
    const bottom = decideOutcomes([row('x', 1, 0), row('y', 1, 0)], 1, 5);
    expect(bottom.every((r) => r.outcome === 'STAYED' && r.nextLevel === 1)).toBe(true);
  });
});
