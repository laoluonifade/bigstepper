import { dayReminder, hourReminder } from './club-events.processor';
import { clockLabel, whenLabel } from './club-events.service';

describe('club event reminders', () => {
  const event = { id: 'e1', title: 'Saturday Social 5K', venue: 'Muri Okunola Park', timeZone: 'Africa/Lagos', clubName: 'Lagos Run Club', nextAt: '2026-10-31T06:00:00Z' };

  it('says tomorrow the day before, in the venue’s time', () => {
    expect(dayReminder(event, new Date('2026-10-30T08:00:00Z')).title).toBe('Tomorrow at 7:00 am: Saturday Social 5K');
  });

  it('says today when the reminder lands on the day', () => {
    expect(dayReminder(event, new Date('2026-10-30T23:30:00Z')).title).toBe('Today at 7:00 am: Saturday Social 5K');
  });

  it('names the start time and place an hour before', () => {
    expect(hourReminder(event)).toEqual({
      title: 'Saturday Social 5K starts at 7:00 am',
      body: 'Head to Muri Okunola Park to run with Lagos Run Club. Record it on Jump so it counts.',
    });
  });

  it('describes the schedule', () => {
    expect(clockLabel('18:30')).toBe('6:30 pm');
    expect(clockLabel('00:05')).toBe('12:05 am');
    expect(whenLabel({ weekday: 6, startTime: '07:00' })).toBe('Saturdays at 7:00 am');
  });
});
