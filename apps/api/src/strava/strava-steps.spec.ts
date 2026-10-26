import { stravaStepTotals } from './strava-steps';

const seconds = (count: number) => Array.from({ length: count }, (_, index) => index);
const still = (count: number) => Array.from({ length: count }, () => [6.5, 3.4] as [number, number]);

describe('stravaStepTotals', () => {
  it('doubles per-foot running cadence', () => {
    const totals = stravaStepTotals('run', seconds(61), still(61), Array(61).fill(85))!;
    expect(totals.at(-1)).toBe(170);
  });

  it('keeps whole-body walking cadence as it is', () => {
    const totals = stravaStepTotals('walk', seconds(61), still(61), Array(61).fill(110))!;
    expect(totals.at(-1)).toBe(110);
  });

  it('estimates from distance when there is no cadence', () => {
    const distance = seconds(101).map((s) => s * 1.44);
    expect(stravaStepTotals('walk', seconds(101), still(101), undefined, distance)!.at(-1)).toBe(200);
  });

  it('never outruns the verifier, even across a GPS spike', () => {
    const distance = [0, 1, 500, 501];
    const totals = stravaStepTotals('walk', [0, 1, 2, 3], still(4), undefined, distance)!;
    for (let index = 1; index < totals.length; index += 1) expect(totals[index] - totals[index - 1]).toBeLessThanOrEqual(4);
  });

  it('counts no steps for rides', () => {
    expect(stravaStepTotals('cycle', seconds(10), still(10))).toBeNull();
  });
});
