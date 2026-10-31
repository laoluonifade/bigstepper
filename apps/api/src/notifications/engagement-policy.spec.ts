import {
  Candidate,
  DEFAULT_PREFERENCES,
  DEFAULT_SETTINGS,
  localWindow,
  notificationCandidate,
  reasonFor,
  validLink,
  validZone,
  cohort,
} from './engagement-policy';
import { validatePreferences, validateSettings } from './engagement.controller';
const now = new Date('2026-10-31T12:00:00Z');
const candidate: Candidate = { userId: 'runner', type: 'MILESTONE', key: 'event', link: '/activities', createdAt: now };
const preferences = { ...DEFAULT_PREFERENCES, timeZone: 'Africa/Lagos' };
describe('shared notification policy', () => {
  it('defaults all new triggers off with conservative channel limits', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ newTriggersEnabled: false, pushDaily: 2, emailWeekly: 3 });
    expect(Object.values(DEFAULT_SETTINGS.triggers).every((on) => !on)).toBe(true);
    expect(reasonFor({ ...candidate, newTrigger: true }, 'push', preferences, DEFAULT_SETTINGS, now)).toBe(
      'feature_disabled',
    );
  });
  it('permits an actionable optional notification in daytime', () =>
    expect(reasonFor(candidate, 'push', preferences, DEFAULT_SETTINGS, now)).toBeNull());
  it.each([
    'PAYOUT_SENT',
    'PAYOUT_REJECTED',
    'PAYOUT_RECIPIENT_CHANGED',
    'KYC_FAILED',
    'KYC_VERIFIED',
    'PRIZE_WON',
    'CLUB_EVENT_REMINDER',
  ])('preserves %s when optional delivery is disabled', (type) => {
    expect(
      reasonFor(
        { ...candidate, type, link: null, createdAt: new Date(0) },
        'email',
        DEFAULT_PREFERENCES,
        { ...DEFAULT_SETTINGS, deliveryEnabled: false },
        now,
        false,
      ),
    ).toBeNull();
  });
  it('suppresses proximity even when scores have just updated', () =>
    expect(reasonFor({ ...candidate, type: 'STANDING_BOOST' }, 'push', preferences, DEFAULT_SETTINGS, now)).toBe(
      'unestablished_sync_freshness',
    ));
  it('requires a known timezone and available deep link', () => {
    expect(reasonFor(candidate, 'push', DEFAULT_PREFERENCES, DEFAULT_SETTINGS, now)).toBe('missing_time_zone');
    expect(reasonFor({ ...candidate, link: null }, 'push', preferences, DEFAULT_SETTINGS, now)).toBe(
      'missing_deep_link',
    );
    for (const link of ['https://evil.test', '//evil.test', '/a%2fb', '/a%0a']) expect(validLink(link)).toBe(false);
    expect(validZone('fake/zone')).toBe(false);
  });
  it('applies local quiet hours across midnight, same-day intervals and DST', () => {
    expect(reasonFor(candidate, 'push', { ...preferences, timeZone: 'Asia/Tokyo' }, DEFAULT_SETTINGS, now)).toBe(
      'quiet_hours',
    );
    expect(reasonFor(candidate, 'push', { ...preferences, quietStart: 12, quietEnd: 15 }, DEFAULT_SETTINGS, now)).toBe(
      'quiet_hours',
    );
    expect(localWindow(new Date('2026-11-01T05:30:00Z'), 'America/New_York').hour).toBe(1);
    expect(localWindow(new Date('2026-11-01T06:30:00Z'), 'America/New_York').hour).toBe(1);
    expect(localWindow(new Date('2026-11-02T01:00:00Z'), 'America/Los_Angeles').week).toBe('2026-10-26');
  });
  it('rejects stale or future activity claims and respects explicit event expiry', () => {
    expect(
      reasonFor(
        { ...candidate, createdAt: new Date(now.getTime() - 31 * 60_000) },
        'push',
        preferences,
        DEFAULT_SETTINGS,
        now,
      ),
    ).toBe('stale');
    expect(
      reasonFor({ ...candidate, expiresAt: new Date(now.getTime() - 1) }, 'push', preferences, DEFAULT_SETTINGS, now),
    ).toBe('stale');
    expect(
      reasonFor(
        { ...candidate, createdAt: new Date(now.getTime() + 120_000) },
        'push',
        preferences,
        DEFAULT_SETTINGS,
        now,
      ),
    ).toBe('stale');
  });
  it('respects each optional category/channel and legacy email opt-outs', () => {
    expect(
      reasonFor(
        candidate,
        'push',
        { ...preferences, categories: { milestones: { push: false } } },
        DEFAULT_SETTINGS,
        now,
      ),
    ).toBe('preference');
    expect(reasonFor(candidate, 'email', preferences, DEFAULT_SETTINGS, now, false)).toBe('preference');
    expect(reasonFor({ ...candidate, onlyChannel: 'email' }, 'push', preferences, DEFAULT_SETTINGS, now)).toBe(
      'other_channel',
    );
  });
  it('uses one fingerprint for the same event across all channels', () => {
    const row = {
      id: 'a',
      userId: 'runner',
      type: 'MILESTONE',
      title: 'Done',
      body: '100',
      link: '/activities',
      createdAt: now,
    };
    expect(notificationCandidate(row).key).toBe(notificationCandidate({ ...row, id: 'b' }).key);
    expect(notificationCandidate(row).key).not.toBe(notificationCandidate({ ...row, title: 'Different' }).key);
  });
  it('uses stable deterministic holdout assignment', () => {
    expect(cohort('runner', 10)).toBe(cohort('runner', 10));
    expect(cohort('runner', 100)).toBe('holdout');
    expect(cohort('runner', 0)).toBe('treatment');
  });
  it('validates controls without enabling proximity or accepting arbitrary JSON', () => {
    expect(() => validatePreferences({ ...preferences, categories: { milestones: { push: 'no' } } })).toThrow();
    expect(() => validatePreferences({ ...preferences, quietStart: 24 })).toThrow();
    expect(() => validateSettings({ pushDaily: -1 }, DEFAULT_SETTINGS)).toThrow();
    expect(() => validateSettings({ triggers: { proximity: true } }, DEFAULT_SETTINGS)).toThrow();
    expect(validateSettings({ pushDaily: 1 }, DEFAULT_SETTINGS).pushDaily).toBe(1);
  });
});
