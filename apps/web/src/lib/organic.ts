const KEY = 'jump_organic_session';
export function organicToken() {
  try {
    return import.meta.env.VITE_SEO_ANALYTICS_ENABLED === 'true'
      ? sessionStorage.getItem(KEY)
      : null;
  } catch {
    return null;
  }
}
export function storeOrganicToken(token: string) {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    /* storage is optional */
  }
}
export function organicSource(referrer: string) {
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (/(^|\.)google\.[a-z.]+$/.test(host)) return 'google';
    if (host === 'bing.com' || host.endsWith('.bing.com')) return 'bing';
    if (host === 'duckduckgo.com' || host.endsWith('.duckduckgo.com'))
      return 'duckduckgo';
    if (host === 'search.yahoo.com') return 'yahoo';
  } catch {
    /* direct */
  }
  return null;
}
