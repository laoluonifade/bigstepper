import { useEffect } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { isSeoPath, type SeoMetadata } from '@jump/shared/seo';
import { api } from '../lib/api';
const ORIGIN = 'https://startajump.com';
function meta(attribute: 'name' | 'property', name: string, value: string) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${name}"]`,
  );
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, name);
    document.head.append(element);
  }
  element.content = value;
}
export function applySeo(page: SeoMetadata) {
  document.title = page.title;
  meta('name', 'description', page.description);
  meta('name', 'robots', page.indexable ? 'index,follow' : 'noindex,nofollow');
  let canonical = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.append(canonical);
  }
  canonical.href = ORIGIN + page.path;
  for (const [name, value] of Object.entries({
    'og:title': page.title,
    'og:description': page.description,
    'og:url': ORIGIN + page.path,
    'og:type': 'website',
    'og:site_name': 'Jump',
    'og:image': page.image ?? ORIGIN + '/icon-512.png',
  }))
    meta('property', name, value);
  meta('name', 'twitter:card', 'summary_large_image');
  meta('name', 'twitter:title', page.title);
  meta('name', 'twitter:description', page.description);
  meta('name', 'twitter:image', page.image ?? ORIGIN + '/icon-512.png');
  document.head
    .querySelectorAll('script[data-jump-seo]')
    .forEach((element) => element.remove());
  for (const schema of page.jsonLd) {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.jumpSeo = 'true';
    script.textContent = JSON.stringify(schema).replace(/</g, '\u003c');
    document.head.append(script);
  }
}
export function SeoHead() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => {
    const controller = new AbortController();
    // Do not leave public metadata/JSON-LD behind after navigation into an account or token route.
    if (!isSeoPath(path)) {
      document.title = 'Jump';
      meta('name', 'robots', 'noindex,nofollow');
      meta('name', 'description', 'Your Jump account.');
      document.head
        .querySelectorAll(
          'link[rel="canonical"],script[data-jump-seo],meta[property^="og:"],meta[name^="twitter:"]',
        )
        .forEach((el) => el.remove());
      return;
    }
    void api<SeoMetadata>('/pages/metadata?path=' + encodeURIComponent(path), {
      signal: controller.signal,
    })
      .then(applySeo)
      .catch((error) => {
        if (error?.name !== 'AbortError')
          meta('name', 'robots', 'noindex,nofollow');
      });
    return () => controller.abort();
  }, [path]);
  return null;
}
