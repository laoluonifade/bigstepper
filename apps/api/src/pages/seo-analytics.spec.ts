import { SeoAnalyticsService } from './seo-analytics.service';
function setup(enabled = true) {
  const query = jest.fn().mockResolvedValue([]);
  const pages = {
    resolve: jest
      .fn()
      .mockResolvedValue({ indexable: true, status: 200, path: '/business' }),
  };
  const config = {
    get: () => enabled,
    getOrThrow: () => 'test-only-signing-secret',
  };
  return {
    service: new SeoAnalyticsService(
      { query } as never,
      config as never,
      pages as never,
    ),
    query,
    pages,
  };
}
const session = '00000000-0000-4000-8000-000000000001';
describe('organic acquisition', () => {
  it('is disabled without opt-in and does not touch storage', async () => {
    const { service, query } = setup(false);
    expect(await service.landing(session, 'google', '/business')).toEqual({
      enabled: false,
    });
    expect(query).not.toHaveBeenCalled();
  });
  it('signs validated public landings and accepts only supported sources', async () => {
    const { service } = setup();
    expect(await service.landing(session, 'newsletter', '/business')).toEqual({
      enabled: false,
    });
    expect(
      (await service.landing(session, 'google', '/business')).token,
    ).toContain('.');
  });
  it.each(['chatgpt', 'perplexity', 'gemini', 'copilot', 'claude'])(
    'attributes confirmed conversions from %s without storing referrer queries',
    async (source) => {
      const { service, query } = setup();
      const { token } = await service.landing(session, source, '/about');
      await service.conversion(token, 'event_registration', 'new-pass');
      const params = query.mock.calls[query.mock.calls.length - 1][1];
      expect(params[1]).toBe(source);
      expect(params[3]).toBe('event_registration');
      expect(params).toHaveLength(5);
    },
  );
  it('does not attribute private or non-indexable pages', async () => {
    const { service, pages } = setup();
    pages.resolve.mockResolvedValue({
      indexable: false,
      status: 404,
      path: '/business',
    });
    expect(await service.landing(session, 'google', '/business')).toEqual({
      enabled: false,
    });
  });
  it('rejects tampered conversion tokens without inserting', async () => {
    const { service, query } = setup();
    await service.conversion('forged.signature', 'club_join', 'club');
    expect(query).not.toHaveBeenCalled();
  });
  it('records actual server-confirmed conversions with idempotent keys', async () => {
    const { service, query } = setup();
    const { token } = await service.landing(session, 'google', '/business');
    await service.conversion(token, 'event_registration', 'attendee');
    expect(query.mock.calls[query.mock.calls.length - 1]?.[1]).toEqual([
      session,
      'google',
      '/business',
      'event_registration',
      'event_registration:attendee:' + session,
    ]);
    expect(query.mock.calls[query.mock.calls.length - 1]?.[0]).toContain(
      'ON CONFLICT DO NOTHING',
    );
  });
  it('never turns telemetry failure into a failed product conversion', async () => {
    const { service, query } = setup();
    const { token } = await service.landing(session, 'google', '/business');
    query.mockRejectedValue(new Error('unavailable'));
    await expect(
      service.conversion(token, 'club_join', 'club'),
    ).resolves.toBeUndefined();
  });
});
