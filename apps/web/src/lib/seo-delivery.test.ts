import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('public delivery preserves application routes', () => {
  it('Caddy permits every registered route, including auth, passes and payments', () => {
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    const config = readFileSync(
      new URL('../../../../deploy/Caddyfile.seo', import.meta.url),
      'utf8',
    );
    const patterns = [
      ...config.matchAll(/path_regexp (?:app|public) (.+)/g),
    ].map((match) => new RegExp(match[1]));
    const routes = [...app.matchAll(/path:\s*'([^']+)'/g)].map((match) =>
      match[1].replace(/\$\w+/g, 'example'),
    );
    expect(routes.length).toBeGreaterThan(50);
    for (const path of routes)
      expect(
        patterns.some((pattern) => pattern.test(path)),
        path,
      ).toBe(true);
    expect(patterns.some((pattern) => pattern.test('/missing-page'))).toBe(
      false,
    );
  });
});

describe('offline app and SEO status handling', () => {
  const source = readFileSync(
    new URL('../../public/sw.js', import.meta.url),
    'utf8',
  );
  async function navigate(fetch: () => Promise<unknown>) {
    const listeners: Record<string, (event: unknown) => void> = {};
    const requested: string[] = [];
    vm.runInNewContext(source, {
      URL,
      self: {
        location: { origin: 'https://startajump.com' },
        addEventListener: (
          type: string,
          callback: (event: unknown) => void,
        ) => {
          listeners[type] = callback;
        },
      },
      fetch,
      caches: {
        match: async (key: string) => {
          requested.push(key);
          return 'generic offline app';
        },
      },
    });
    let result: Promise<unknown> | undefined;
    listeners.fetch({
      request: {
        url: 'https://startajump.com/events/deleted',
        method: 'GET',
        mode: 'navigate',
      },
      respondWith: (response: Promise<unknown>) => {
        result = response;
      },
    });
    return { response: await result, requested };
  }
  it('preserves real missing and unavailable responses without caching page HTML', async () => {
    for (const status of [200, 404, 410, 503]) {
      const response = { status };
      expect(await navigate(async () => response)).toEqual({
        response,
        requested: [],
      });
    }
  });
  it('opens the generic app shell only when the network fails', async () => {
    expect(
      await navigate(async () => {
        throw new Error('offline');
      }),
    ).toEqual({
      response: 'generic offline app',
      requested: ['/offline.html'],
    });
  });
});
