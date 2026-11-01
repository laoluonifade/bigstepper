import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PagesService } from './pages.service';
import { PagesController } from './pages.controller';
import { esc, json, documentHtml, locationSlug, safeImage } from './seo-render';
const origin = 'https://startajump.com';
const e = {
  id: '1e14e26e-2ebe-4c02-8503-b57f31995bcb',
  slug: 'burn-it-up',
  title: 'Burn It Up',
  activity: 'any',
  notes: null,
  venue: 'Bells Univerisity of Technology',
  address: 'Idi-Iroko Road, Ota, Ado Odo/Ota',
  countryCode: 'NG',
  latitude: 6.6865,
  longitude: 3.1698,
  coverUrl: null,
  timeZone: 'Africa/Lagos',
  durationMinutes: 120,
  updatedAt: new Date('2026-11-01'),
  deletedAt: null,
  publishedAt: new Date('2026-10-31'),
  clubSlug: 'host-club',
  clubName: 'Host Club',
  privacy: 'open',
  suspendedAt: null,
  location: 'Ota',
  nextAt: new Date('2026-11-07T06:00:00Z'),
};
const c = {
  id: 'club',
  slug: 'host-club',
  name: 'Host Club',
  description:
    'A public running community with weekly meetups and friendly movement challenges.',
  location: 'Ota',
  logoUrl: null,
  updatedAt: new Date('2026-11-01'),
};
const t = {
  id: 'table',
  code: 'ABCD1234',
  title: 'Walking challenge',
  description:
    'A public walking challenge with a shared step target and clearly defined scoring rules.',
  bannerUrl: null,
  type: 'free',
  status: 'ACTIVE',
  startsAt: new Date('2026-11-01'),
  scoringClosesAt: new Date('2026-11-08'),
  entryClosesAt: null,
  challengeType: 'STEP',
  scoringMethod: 'MOST_STEPS',
  eligibleActivities: ['walk', 'run'],
  targetSteps: 100000,
  targetDistanceMetres: null,
  minActivityMetres: 0,
  minActivitySeconds: 0,
  entryFeeKobo: 0,
  capacity: null,
  createdAt: new Date(),
  timeZone: 'UTC',
  visibility: 'public',
  deletedAt: null,
  clubName: c.name,
  clubSlug: c.slug,
};
const shell =
  '<!doctype html><html lang="en"><head><title>Jump</title><meta name="description" content="generic"><meta name="robots" content="noindex"><script src="/assets/app.js" type="module"></script></head><body><div id="root"></div></body></html>';
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jump-seo-'));
  writeFileSync(join(dir, 'index.html'), shell);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
function setup(
  events: unknown[] = [e],
  clubs: unknown[] = [c],
  tables: unknown[] = [t],
) {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('FROM event_ticket_types'))
      return [
        { name: 'Free pass', priceMinor: 0, currency: 'NGN', remaining: null },
      ];
    if (sql.startsWith('SELECT 1 FROM competition_tables')) return [];
    if (sql.includes('count(*)::int AS count')) return [{ count: 1 }];
    if (sql.includes('FROM club_events e JOIN clubs c')) return events;
    if (sql.includes('FROM competition_tables t LEFT JOIN clubs c'))
      return tables;
    if (sql.includes('FROM clubs c')) return clubs;
    return [];
  });
  const config = {
    get: (key: string) =>
      key === 'WEB_INDEX_PATH' ? join(dir, 'index.html') : undefined,
    getOrThrow: () => origin,
  };
  return {
    pages: new PagesService({ query } as never, config as never),
    query,
  };
}
describe('public SEO rendering and privacy', () => {
  it.each(['/', '/business', '/brands'])(
    'renders readable unique public HTML before JS on %s',
    async (path) => {
      const { pages } = setup();
      const page = await pages.html(path);
      expect(page.html).toContain('<h1');
      expect(page.html).toContain('rel="canonical"');
      expect(page.html).toContain(origin + path);
      expect(page.html).toContain('src="/assets/app.js"');
      expect(page.html).not.toContain('<div id="root"></div>');
      expect(page.html.match(/<title>/g)).toHaveLength(1);
      expect(page.html.match(/name="description"/g)).toHaveLength(1);
      expect(page.html).toContain('index,follow');
    },
  );
  it('uses real event date, venue, organizer and registration data', async () => {
    const { pages } = setup();
    const page = await pages.eventModel(e.slug);
    expect(page.indexable).toBe(true);
    expect(page.body).toContain(e.address);
    expect(page.body).toContain('Get Pass');
    expect(page.body).toContain('Free pass: Free');
    const schema = page.jsonLd.find((s) => s['@type'] === 'Event')!;
    expect(schema.startDate).toBe('2026-11-07T06:00:00.000Z');
    expect(schema.eventAttendanceMode).toBe(
      'https://schema.org/OfflineEventAttendanceMode',
    );
    expect(schema.organizer).toMatchObject({ name: e.clubName });
  });
  it.each([{ venue: null }, { address: null }, { nextAt: null }])(
    'does not index incomplete or expired events: %j',
    async (change) => {
      const page = await setup([{ ...e, ...change }]).pages.eventModel(e.slug);
      expect(page.indexable).toBe(false);
      expect(page.jsonLd.some((s) => s['@type'] === 'Event')).toBe(false);
    },
  );
  it('keeps explicitly published events discoverable without exposing their invite-only host page', async () => {
    const page = await setup([{ ...e, privacy: 'invite' }]).pages.eventModel(
      e.slug,
    );
    expect(page.indexable).toBe(true);
    expect(page.body).toContain(e.clubName);
    expect(page.body).not.toContain('href="/clubs/' + e.clubSlug);
    expect(page.jsonLd.find((s) => s['@type'] === 'Event')?.organizer).toEqual({
      '@type': 'Organization',
      name: e.clubName,
    });
  });
  it('does not imply a physical event without real coordinates', async () => {
    const page = await setup([
      { ...e, latitude: null, longitude: null },
    ]).pages.eventModel(e.slug);
    expect(page.jsonLd.some((s) => s['@type'] === 'Event')).toBe(false);
  });
  it('uses 410 only for a known formerly-public deleted event', async () => {
    const page = await setup([{ ...e, deletedAt: new Date() }]).pages.resolve(
      '/events/' + e.slug,
    );
    expect(page.status).toBe(410);
    expect(page.indexable).toBe(false);
  });
  it('does not return private or missing content as a successful app shell', async () => {
    const { pages, query } = setup([], [], []);
    for (const path of [
      '/events/private-event',
      '/clubs/private-club',
      '/competitions/PRIVATE1',
      '/not-a-page',
    ])
      expect((await pages.resolve(path)).status).toBe(404);
    expect(
      query.mock.calls.find(([sql]) => sql.includes('e.slug=$1'))?.[0],
    ).toContain('e."publishedAt" IS NOT NULL');
    expect(
      query.mock.calls.find(([sql]) => sql.includes('t.code=$1'))?.[0],
    ).toContain('"visibility"=\'public\'');
  });
  it('never emits physical Event markup for virtual competitions', async () => {
    const page = await setup().pages.competitionModel(t.code);
    expect(page.body).toContain('100,000 steps');
    expect(page.body).toContain('Rules and participation');
    expect(page.jsonLd.some((s) => s['@type'] === 'Event')).toBe(false);
  });
  it('canonicalizes IDs, case and trailing slashes', async () => {
    const { pages } = setup();
    expect(await pages.resolve('/events/' + e.id)).toMatchObject({
      status: 308,
      redirect: '/events/' + e.slug,
    });
    expect(await pages.resolve('/competitions/abcd1234')).toMatchObject({
      status: 308,
      redirect: '/competitions/ABCD1234',
    });
    expect(await pages.resolve('/business/')).toMatchObject({
      status: 308,
      redirect: '/business',
    });
  });
  it('consolidates workplace synonyms instead of publishing duplicate pages', async () => {
    for (const path of [
      '/workplace-step-challenges',
      '/corporate-wellness-competitions',
    ])
      expect(await setup().pages.resolve(path)).toMatchObject({
        status: 308,
        redirect: '/business',
      });
  });
  it('keeps empty discovery hubs out of the index', async () => {
    const page = await setup([], [], []).pages.resolve('/running-events');
    expect(page.status).toBe(200);
    expect(page.indexable).toBe(false);
    expect(page.body).toContain('No matching public listings');
  });
  it('never guesses event city from a host club location', async () => {
    expect((await setup().pages.resolve('/running-events/in/ota')).status).toBe(
      404,
    );
  });
  it('requires multiple real public clubs before indexing location pages', async () => {
    expect(
      (await setup().pages.resolve('/running-clubs/in/ota')).indexable,
    ).toBe(false);
    const second = {
      ...c,
      id: 'other',
      slug: 'other-club',
      name: 'Second Club',
    };
    const page = await setup([e], [c, second]).pages.resolve(
      '/running-clubs/in/ota',
    );
    expect(page.indexable).toBe(true);
    expect(page.body).toContain(second.name);
  });
  it('propagates database failure rather than manufacturing an indexable 200', async () => {
    const { pages, query } = setup();
    query.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(pages.resolve('/events/' + e.slug)).rejects.toThrow();
  });
  it('returns 503 with no-store if rendering fails', async () => {
    const controller = new PagesController({
      html: jest.fn().mockRejectedValue(new Error()),
    } as never);
    const res = {
      status: jest.fn(),
      setHeader: jest.fn(),
      removeHeader: jest.fn(),
    };
    await expect(
      controller.html('/events/example', res as never),
    ).rejects.toMatchObject({ status: 503 });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
  it('never serializes pass, member or attendee data into public HTML', async () => {
    const html = (
      await setup([
        {
          ...e,
          email: 'private@example.test',
          ticketToken: 'secret-token',
          faces: [{ name: 'Private' }],
        },
      ]).pages.html('/events/' + e.slug)
    ).html;
    expect(html).not.toContain('private@example.test');
    expect(html).not.toContain('secret-token');
  });
});
describe('XML, robots and structured data safety', () => {
  it('emits an actual sitemap index and XML shards on the canonical host', async () => {
    const { pages, query } = setup();
    expect(await pages.sitemapIndex()).toContain('<sitemapindex');
    query.mockImplementation(async (sql: string) =>
      sql.includes('SELECT e.slug')
        ? [{ slug: e.slug, updatedAt: e.updatedAt }]
        : [],
    );
    const shard = await pages.sitemapShard('events-1.xml');
    expect(shard).toContain('<urlset');
    expect(shard).toContain('<loc>' + origin + '/events/' + e.slug + '</loc>');
    expect(await pages.sitemapShard('events-0.xml')).toBeNull();
    expect(await pages.sitemapShard('events-2.xml')).toContain(e.slug); // fresh query, no stale exported URL list
  });
  it('keeps empty shards and malformed shard names out', async () => {
    const { pages, query } = setup();
    query.mockResolvedValue([]);
    expect(await pages.sitemapShard('events-99.xml')).toBeNull();
    expect(await pages.sitemapShard('../private')).toBeNull();
  });
  it('filters private/deleted data in every sitemap resource query', async () => {
    const { pages, query } = setup();
    for (const name of ['events-1.xml', 'clubs-1.xml', 'competitions-1.xml'])
      await pages.sitemapShard(name);
    expect(
      query.mock.calls.find(([sql]) => sql.includes('SELECT e.slug'))?.[0],
    ).toContain('"deletedAt" IS NULL');
    expect(
      query.mock.calls.find(([sql]) => sql.includes('SELECT c.slug'))?.[0],
    ).toContain("'open'");
    expect(
      query.mock.calls.find(([sql]) => sql.includes('SELECT t.code'))?.[0],
    ).toContain("'public'");
  });
  it('robots permits crawling so noindex can be read, and advertises sitemap', () => {
    const robots = setup().pages.robots();
    expect(robots).toContain('Sitemap: ' + origin + '/sitemap.xml');
    expect(robots).not.toContain('Disallow: /login');
  });
  it('safely escapes HTML, JSON-LD and replacement tokens', () => {
    const value = '</script><img src=x onerror=alert(1)> $&';
    expect(json({ name: value })).not.toContain('</script>');
    expect(JSON.parse(json({ name: value })).name).toBe(value);
    expect(esc(value)).toContain('&lt;');
    const page = {
      title: value,
      description: value,
      path: '/events/a',
      body: '<h1>' + esc(value) + '</h1>',
      status: 200,
      indexable: true,
      jsonLd: [{ '@type': 'Event', name: value }],
    };
    const html = documentHtml(shell, page, origin);
    expect(html).not.toContain('<img src=x');
    expect(html.match(/id="root"/g)).toHaveLength(1);
    expect(html).toContain('$&');
  });
  it('rejects unsafe images and does not invent location labels', () => {
    expect(safeImage('javascript:alert(1)')).toBeNull();
    expect(locationSlug('São Paulo')).toBe('sao-paulo');
    expect(locationSlug('')).toBe('');
  });
});
