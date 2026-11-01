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
    const url = new URL(referrer);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    const aiHosts = {
      'chatgpt.com': 'chatgpt',
      'chat.openai.com': 'chatgpt',
      'perplexity.ai': 'perplexity',
      'gemini.google.com': 'gemini',
      'copilot.microsoft.com': 'copilot',
      'copilot.com': 'copilot',
      'copilot.cloud.microsoft': 'copilot',
      'm365.cloud.microsoft': 'copilot',
      'claude.ai': 'claude',
    };
    for (const [domain, source] of Object.entries(aiHosts))
      if (host === domain || host.endsWith('.' + domain)) return source;
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
