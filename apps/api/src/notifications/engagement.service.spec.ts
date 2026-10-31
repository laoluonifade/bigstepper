import { EngagementService } from './engagement.service';
import { Candidate, DEFAULT_PREFERENCES, DEFAULT_SETTINGS } from './engagement-policy';
const c: Candidate = {
  sourceId: 'n',
  userId: 'u',
  type: 'MILESTONE',
  key: 'k',
  link: '/activities',
  createdAt: new Date(),
};
function setup({
  existing = null,
  push = 0,
  email = 0,
  hasPush = true,
  settings = DEFAULT_SETTINGS,
}: { existing?: unknown; push?: number; email?: number; hasPush?: boolean; settings?: typeof DEFAULT_SETTINGS } = {}) {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('SELECT id,status')) return existing ? [existing] : [];
    if (sql.includes('SELECT u.'))
      return [
        {
          emailVerified: true,
          hasPush,
          value: { ...DEFAULT_PREFERENCES, timeZone: 'UTC', quietStart: 0, quietEnd: 0 },
        },
      ];
    if (sql.includes('SELECT value FROM notification_settings')) return [{ value: settings }];
    if (sql.includes('count(*) FILTER')) return [{ push, email }];
    if (sql.includes('INSERT INTO notification_deliveries')) return [{ id: 'd' }];
    return [];
  });
  const transaction = jest.fn(async (fn: (m: { query: typeof query }) => Promise<unknown>) => fn({ query }));
  return { service: new EngagementService({ query, transaction } as never), query, transaction };
}
describe('EngagementService reservations', () => {
  it('locks the user before checking duplicate/budget and reserves once', async () => {
    const { service, query } = setup();
    expect(await service.reserve(c, 'push')).toMatchObject({ allowed: true, id: 'd' });
    expect(query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
  });
  it.each([
    { push: 2, channel: 'push' },
    { email: 3, hasPush: false, channel: 'email' },
  ])('enforces shared channel caps: %s', async (input) => {
    const { service } = setup(input);
    expect(await service.reserve(c, input.channel as 'push' | 'email')).toMatchObject({
      allowed: false,
      reason: 'frequency_limit',
    });
  });
  it('suppresses a duplicate accepted or ambiguous attempt rather than resending', async () => {
    for (const status of ['sent', 'reserved', 'uncertain'])
      expect(await setup({ existing: { id: 'd', status } }).service.reserve(c, 'push')).toMatchObject({
        allowed: false,
        reason: 'duplicate',
      });
  });
  it('retries only explicit rate-limit rejection with a bounded attempt count', async () => {
    expect(
      await setup({ existing: { id: 'd', status: 'failed', reason: 'retryable', attempts: 1 } }).service.reserve(
        c,
        'push',
      ),
    ).toMatchObject({ allowed: true, id: 'd' });
    expect(
      await setup({ existing: { id: 'd', status: 'failed', reason: 'retryable', attempts: 3 } }).service.reserve(
        c,
        'push',
      ),
    ).toMatchObject({ allowed: false });
  });
  it('does not consume an email for the same update when a phone is registered', async () =>
    expect(await setup().service.reserve(c, 'email')).toMatchObject({ allowed: false, reason: 'push_preferred' }));
  it('bypasses optional limits for essential payments', async () => {
    const { service, transaction } = setup({ push: 99 });
    expect(await service.reserve({ ...c, type: 'PAYOUT_SENT' }, 'push')).toEqual({ allowed: true });
    expect(transaction).not.toHaveBeenCalled();
  });
  it('recovers visibility for the same inbox row after a worker crash', async () => {
    expect(
      await setup({ existing: { id: 'd', status: 'reserved', sourceId: 'n' } }).service.reserve(c, 'inapp'),
    ).toMatchObject({ allowed: true, id: 'd' });
    expect(
      await setup({ existing: { id: 'd', status: 'sent', sourceId: 'different' } }).service.reserve(c, 'inapp'),
    ).toMatchObject({ allowed: false });
  });
  it('records holdout only after eligibility', async () => {
    expect(
      await setup({
        settings: { ...DEFAULT_SETTINGS, newTriggersEnabled: true, rolloutPercent: 100, holdoutPercent: 100 },
      }).service.reserve({ ...c, newTrigger: true }, 'push'),
    ).toMatchObject({ allowed: false, reason: 'holdout' });
  });
});
