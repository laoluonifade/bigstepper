import { editionLabel, nextStart } from './club-challenges';

const lagos = (local: string) => new Date(`${local}+01:00`);

describe('series calendar', () => {
  it('rolls daily, weekly and custom editions on local midnight', () => {
    expect(nextStart(lagos('2026-11-21T00:00:00'), 'daily')).toEqual(lagos('2026-11-22T00:00:00'));
    expect(nextStart(lagos('2026-11-23T00:00:00'), 'weekly')).toEqual(lagos('2026-11-30T00:00:00'));
    expect(nextStart(lagos('2026-12-01T00:00:00'), 'custom', 'Africa/Lagos', 90)).toEqual(lagos('2027-03-01T00:00:00'));
  });

  it('keeps monthly editions on the 1st in local time, across the year end', () => {
    expect(nextStart(lagos('2026-11-01T00:00:00'), 'monthly')).toEqual(lagos('2026-12-01T00:00:00'));
    expect(nextStart(lagos('2026-12-01T00:00:00'), 'monthly')).toEqual(lagos('2027-01-01T00:00:00'));
    expect(nextStart(lagos('2027-01-31T00:00:00'), 'monthly')).toEqual(lagos('2027-02-28T00:00:00'));
  });

  it('keeps wall-clock midnight across a daylight-saving change', () => {
    const before = new Date('2026-10-24T23:00:00Z');
    expect(nextStart(before, 'daily', 'Europe/London').toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });

  it('names each edition after its dates', () => {
    expect(editionLabel(lagos('2026-11-21T00:00:00'), lagos('2026-11-22T00:00:00'), 'daily')).toBe('Sat 21 Nov');
    expect(editionLabel(lagos('2026-11-23T00:00:00'), lagos('2026-11-30T00:00:00'), 'weekly')).toBe('23–29 Nov');
    expect(editionLabel(lagos('2026-11-30T00:00:00'), lagos('2026-12-07T00:00:00'), 'weekly')).toBe('30 Nov – 6 Dec');
    expect(editionLabel(lagos('2026-12-01T00:00:00'), lagos('2027-01-01T00:00:00'), 'monthly')).toBe('December 2026');
  });
});
