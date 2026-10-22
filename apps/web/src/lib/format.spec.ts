import { describe, expect, it } from 'vitest';
import { formatMoney, formatNairaInput, formatSpeed, nairaInputToKobo } from './format';

describe('naira amounts', () => {
  it('groups thousands in editable amounts', () => {
    expect(formatNairaInput('10000')).toBe('10,000');
    expect(formatNairaInput('1000000.50')).toBe('1,000,000.50');
    expect(formatNairaInput('1,000.')).toBe('1,000.');
  });

  it('sends an exact kobo amount to the API', () => {
    expect(nairaInputToKobo('10,000.50')).toBe(1_000_050);
    expect(formatMoney(1_000_050)).toBe('₦10,000.50');
  });
});

it('formats cycling speed from distance and moving time', () => {
  expect(formatSpeed(10_000, 1800)).toBe('20.0 km/h');
  expect(formatSpeed(0, 1800)).toBeNull();
});
