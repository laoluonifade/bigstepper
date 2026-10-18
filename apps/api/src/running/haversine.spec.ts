import { haversineMetres } from './haversine';

describe('haversineMetres', () => {
  it('returns zero for identical points', () => {
    expect(haversineMetres(6.5244, 3.3792, 6.5244, 3.3792)).toBe(0);
  });

  it('calculates a known short distance', () => {
    const metres = haversineMetres(6.5244, 3.3792, 6.5254, 3.3792);
    expect(metres).toBeGreaterThan(110);
    expect(metres).toBeLessThan(112);
  });

  it('takes the short route across the antimeridian', () => {
    const metres = haversineMetres(0, 179.9, 0, -179.9);
    expect(metres).toBeGreaterThan(22_000);
    expect(metres).toBeLessThan(22_300);
  });
});
