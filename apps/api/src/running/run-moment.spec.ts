import { momentOf } from './running.service';

describe('momentOf (pause, resume and finish done offline)', () => {
  const now = new Date('2026-10-25T18:00:00Z');
  const started = new Date('2026-10-25T17:00:00Z');

  it('uses now when the phone sends no time', () => {
    expect(momentOf(undefined, started, now)).toEqual(now);
  });

  it('keeps the real moment it happened offline', () => {
    expect(momentOf('2026-10-25T17:42:10Z', started, now)).toEqual(new Date('2026-10-25T17:42:10Z'));
  });

  it('never accepts the future, a time before the start, or something days old', () => {
    expect(momentOf('2026-10-25T19:00:00Z', started, now)).toEqual(now);
    expect(momentOf('2026-10-25T16:00:00Z', started, now)).toEqual(started);
    expect(momentOf('2026-10-20T10:00:00Z', new Date('2026-10-01T00:00:00Z'), now)).toEqual(new Date('2026-10-24T18:00:00Z'));
    expect(momentOf('not a date', started, now)).toEqual(now);
  });
});
