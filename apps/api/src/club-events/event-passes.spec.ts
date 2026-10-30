import { eventChanges, maskEmail } from './event-passes.service';

describe('event passes', () => {
  it('names what changed for attendees, once each', () => {
    expect(eventChanges({ startTime: '07:00', venue: 'Gate A', address: 'Ikoyi' }, { startTime: '08:00', venue: 'Gate B', address: 'Lekki' })).toEqual(['the time', 'the meeting point']);
  });

  it('ignores edits attendees don’t need to hear about', () => {
    expect(eventChanges({ title: 'Run', startTime: '07:00' }, { title: 'Run!', startTime: '07:00' })).toEqual([]);
  });

  it('shows only enough of an email to recognise it', () => {
    expect(maskEmail('onifade@gmail.com')).toBe('on•••••@gmail.com');
    expect(maskEmail('ab@x.co')).toBe('ab•@x.co');
  });
});
