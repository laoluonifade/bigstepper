import { useEffect } from 'react';
import { isSeoPath } from '@jump/shared/seo';
import { post } from '../lib/api';
import { organicSource, organicToken, storeOrganicToken } from '../lib/organic';
export function OrganicAttribution() {
  useEffect(() => {
    if (import.meta.env.VITE_SEO_ANALYTICS_ENABLED !== 'true') return;
    const source = organicSource(document.referrer);
    if (source && isSeoPath(window.location.pathname) && !organicToken())
      void post<{ token?: string }>('/pages/acquisition', {
        session: crypto.randomUUID(),
        source,
        landing: window.location.pathname,
      })
        .then((result) => {
          if (result.token) storeOrganicToken(result.token);
        })
        .catch(() => undefined);
    const clicked = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest('a') : null;
      const token = organicToken();
      if (!anchor || !token) return;
      const href = anchor.getAttribute('href') ?? '';
      const kind =
        href.startsWith('mailto:') && window.location.pathname === '/business'
          ? 'business_contact_click'
          : href.startsWith('/register') ||
              href.includes('getPass=1') ||
              href.includes('join=true')
            ? 'cta_click'
            : null;
      if (kind)
        void post('/pages/acquisition/action', { token, kind }).catch(
          () => undefined,
        );
    };
    document.addEventListener('click', clicked);
    return () => document.removeEventListener('click', clicked);
  }, []);
  return null;
}
