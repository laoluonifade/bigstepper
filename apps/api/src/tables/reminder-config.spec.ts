import { reminderConfig } from './reminder-config';

describe('daily challenge reminder configuration', () => {
  it('is off unless a creator chooses a time', () => {
    expect(reminderConfig()).toEqual({ reminderTime: null, reminderTimeZone: null });
  });

  it('keeps the chosen local time and valid time zone', () => {
    expect(reminderConfig('08:30', 'Africa/Lagos')).toEqual({ reminderTime: '08:30', reminderTimeZone: 'Africa/Lagos' });
  });

  it('rejects incomplete or invalid time zone settings', () => {
    expect(() => reminderConfig('08:30')).toThrow();
    expect(() => reminderConfig('08:30', 'Not/AZone')).toThrow();
  });
});
