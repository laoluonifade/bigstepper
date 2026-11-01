import { GUIDES, PRODUCT_FAQS, knowledgePage } from './knowledge';
import { PagesService } from './pages.service';
import { documentHtml } from './seo-render';
const origin = 'https://startajump.com';
const shell =
  '<!doctype html><html lang="en"><head><title>Jump</title></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>';
describe('public product knowledge', () => {
  const paths = ['/about', '/learn', ...GUIDES.map((g) => '/learn/' + g.slug)];
  const pages = new PagesService(
    { query: async () => [] } as never,
    { get: () => undefined, getOrThrow: () => origin } as never,
  );
  it.each(paths)(
    'serves useful independently readable HTML for %s',
    async (path) => {
      const page = await pages.resolve(path);
      const html = documentHtml(shell, page, origin);
      expect(page).toMatchObject({ status: 200, indexable: true, path });
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(html.match(/<title>/g)).toHaveLength(1);
      expect(html).toContain('href="' + origin + path + '"');
      expect(html).toContain('name="description"');
      expect(html).toContain('id="jump-public-page"');
      expect(html).not.toContain('<div id="root"></div>');
      expect(page.jsonLd.some((s) => s['@type'] === 'Event')).toBe(false);
      const jsons = [
        ...html.matchAll(
          /<script type="application\/ld\+json" data-jump-seo>(.*?)<\/script>/g,
        ),
      ];
      expect(jsons.length).toBeGreaterThan(0);
      for (const [, raw] of jsons) expect(() => JSON.parse(raw)).not.toThrow();
    },
  );
  it('has canonical sitemapped guide URLs and no guessed guide pages', async () => {
    const xml = await pages.sitemapShard('static.xml');
    for (const path of paths)
      expect(xml).toContain('<loc>' + origin + path + '</loc>');
    expect((await pages.resolve('/learn/invented-guide')).status).toBe(404);
    expect(
      await pages.resolve('/learn/virtual-running-challenge/'),
    ).toMatchObject({
      status: 308,
      redirect: '/learn/virtual-running-challenge',
    });
  });
  it('keeps article identity and internal links consistent with substantive visible content', () => {
    expect(new Set(GUIDES.map((g) => g.slug)).size).toBe(6);
    const titles = new Set<string>();
    for (const guide of GUIDES) {
      const page = knowledgePage('/learn/' + guide.slug, origin)!;
      expect(page.body.split(/\s+/).length).toBeGreaterThan(200);
      const article = page.jsonLd.find((s) => s['@type'] === 'Article')!;
      expect(article.headline).toBe(guide.title);
      expect(article.mainEntityOfPage).toBe(origin + page.path);
      expect(page.body).toContain(guide.title);
      for (const related of guide.related)
        expect(page.body).toContain(
          'href="' + related.path.replace(/&/g, '&amp;') + '"',
        );
      titles.add(page.title);
    }
    expect(titles.size).toBe(GUIDES.length);
  });
  it('uses only visible FAQs and supported application facts without invented ratings or pricing', () => {
    const page = knowledgePage('/about', origin)!;
    const faq = page.jsonLd.find((s) => s['@type'] === 'FAQPage')!;
    const entries = faq.mainEntity as Array<{
      name: string;
      acceptedAnswer: { text: string };
    }>;
    expect(entries).toHaveLength(PRODUCT_FAQS.length);
    for (const f of entries) {
      expect(page.body).toContain(f.name);
      expect(page.body).toContain(f.acceptedAnswer.text);
    }
    const app = page.jsonLd.find((s) => s['@type'] === 'SoftwareApplication')!;
    expect(app.name).toBe('Jump');
    expect(app.url).toBe(origin + '/about');
    expect(app.offers).toBeUndefined();
    expect(app.aggregateRating).toBeUndefined();
    expect(page.body).toContain('controlled by iOS');
  });
  it('preserves the existing public crawl policy and distinguishes training from search', () => {
    const robots = pages.robots();
    expect(robots).toContain('User-agent: *\nAllow: /');
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain('GPTBot training access is separate');
    expect(robots).not.toMatch(
      /User-agent: (OAI-SearchBot|Googlebot|bingbot|PerplexityBot)\s+Disallow: \/\s/,
    );
  });
});
