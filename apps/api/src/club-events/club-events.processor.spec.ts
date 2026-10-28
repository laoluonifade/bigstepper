import { dayReminder, hourReminder } from './club-events.processor';
import { clockLabel, passCode, whenLabel } from './club-events.service';

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
    expect(whenLabel({ repeat: 'weekly', weekdays: [6], startsOn: '2026-10-31', startTime: '07:00' })).toBe('Saturdays at 7:00 am');
    expect(whenLabel({ repeat: 'weekly', repeatEvery: 2, weekdays: [4, 2], startsOn: '2026-10-27', startTime: '06:30', endsOn: '2026-12-20' }))
      .toBe('every other week on Tuesday and Thursday at 6:30 am, until 20 Dec');
    expect(whenLabel({ repeat: 'daily', repeatEvery: 3, startsOn: '2026-10-31', startTime: '07:00' })).toBe('every 3 days at 7:00 am');
    expect(whenLabel({ repeat: 'monthly', monthMode: 'date', startsOn: '2026-10-22', startTime: '07:00' })).toBe('the 22nd of every month at 7:00 am');
    expect(whenLabel({ repeat: 'monthly', repeatEvery: 2, monthMode: 'weekday', monthWeek: 5, startsOn: '2026-10-31', startTime: '07:00' })).toBe('the last Saturday of every 2 months at 7:00 am');
    expect(whenLabel({ repeat: 'once', startsOn: '2026-11-14', startTime: '06:30' })).toBe('Saturday 14 Nov at 6:30 am');
  });

  it('issues pass codes from letters that can’t be misread', () => {
    expect(passCode(() => 0)).toBe('JMP-AAAAAA');
    expect(passCode()).toMatch(/^JMP-[A-HJ-NP-Z2-9]{6}$/);
  });
});
