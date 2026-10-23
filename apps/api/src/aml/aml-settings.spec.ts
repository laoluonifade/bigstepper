import { AML_DEFAULTS, mergeSettings, minEntrantsFor } from './aml-settings';
import { namesMatch } from './aml.service';

describe('AML settings', () => {
  it('needs more entrants as the pot grows', () => {
    expect(minEntrantsFor(AML_DEFAULTS, 5_000_000)).toBe(2);
    expect(minEntrantsFor(AML_DEFAULTS, 10_000_000)).toBe(5);
    expect(minEntrantsFor(AML_DEFAULTS, 80_000_000)).toBe(10);
  });

  it('keeps defaults for settings that were never saved', () => {
    const merged = mergeSettings({ maxEntryFeeKobo: 1_000, withdrawalLimits: { HIGH: { dailyKobo: 5, monthlyKobo: 9 } } as never });
    expect(merged.maxEntryFeeKobo).toBe(1_000);
    expect(merged.payoutReviewThresholdKobo).toBe(AML_DEFAULTS.payoutReviewThresholdKobo);
    expect(merged.withdrawalLimits.LOW).toEqual(AML_DEFAULTS.withdrawalLimits.LOW);
    expect(merged.withdrawalLimits.HIGH).toEqual({ dailyKobo: 5, monthlyKobo: 9 });
  });
});

describe('namesMatch', () => {
  it('accepts the bank’s name in any order and with middle names', () => {
    expect(namesMatch('Ayomide', 'Aluko', 'ALUKO AYOMIDE OLUWASEUN')).toBe(true);
  });

  it('rejects an account in someone else’s name', () => {
    expect(namesMatch('Ayomide', 'Aluko', 'STEPHEN OLAOLUWA')).toBe(false);
    expect(namesMatch('Ayomide', 'Aluko', 'AYOMIDE BELLO')).toBe(false);
  });
});
