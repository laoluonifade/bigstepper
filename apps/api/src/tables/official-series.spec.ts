import { DESCRIPTION_MAX, PLANS } from './official-series';

describe('official walking series', () => {
  it('has 30 distinct competitions', () => {
    expect(new Set(PLANS.map((plan) => plan.title)).size).toBe(30);
  });

  it('keeps every description within what a competition can store', () => {
    const overlong = PLANS.filter((plan) => plan.description.length > DESCRIPTION_MAX).map((plan) => `${plan.title} (${plan.description.length})`);
    expect(overlong).toEqual([]);
  });
});
