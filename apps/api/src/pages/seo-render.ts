export interface SeoPage {
  title: string;
  description: string;
  path: string;
  body: string;
  status: number;
  indexable: boolean;
  image?: string | null;
  jsonLd: Record<string, unknown>[];
  redirect?: string;
}
export const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
export const json = (value: unknown) =>
  JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'),
  );
export function safeImage(value: unknown) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
export function locationSlug(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
}
export function breadcrumbs(
  origin: string,
  items: Array<{ name: string; path: string }>,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: origin + item.path,
    })),
  };
}
export function documentHtml(shell: string, page: SeoPage, origin: string) {
  const canonical = origin + page.path;
  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(
      /<meta\b[^>]*(?:name=["'](?:description|robots|twitter:[^"']+)["']|property=["']og:[^"']+["'])[^>]*>/gi,
      '',
    )
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '');
  const image = safeImage(page.image) ?? origin + '/icon-512.png';
  const tags = `<title>${esc(page.title)}</title><meta name="description" content="${esc(page.description)}"><meta name="robots" content="${page.indexable ? 'index,follow' : 'noindex,nofollow'}"><link rel="canonical" href="${esc(canonical)}">
 <meta property="og:type" content="website"><meta property="og:site_name" content="Jump"><meta property="og:title" content="${esc(page.title)}"><meta property="og:description" content="${esc(page.description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(page.title)}"><meta name="twitter:description" content="${esc(page.description)}"><meta name="twitter:image" content="${esc(image)}">${page.jsonLd.map((schema) => `<script type="application/ld+json" data-jump-seo>${json(schema)}</script>`).join('')}`;
  html = html.replace('</head>', () => tags + '</head>');
  const body = `<header class="border-b border-line"><nav aria-label="Main" class="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center gap-5 px-4 py-3"><a href="/" class="wide mr-auto text-xl font-black">Jump</a><a href="/running-events">Events</a><a href="/running-clubs">Clubs</a><a href="/step-challenges">Challenges</a><a href="/business">For businesses</a></nav></header><main id="main-content" class="mx-auto max-w-5xl px-4 py-8">${page.body}</main><footer class="mx-auto flex max-w-5xl flex-wrap gap-4 px-4 py-8"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Contact</a><a href="/brands">For brands</a><a href="/learn">Guides</a><a href="/about">About Jump</a></footer>`;
  const seed =
    /^\/(about|learn|running-events|running-clubs|step-challenges|virtual-fitness-challenges)(\/|$)/.test(
      page.path,
    )
      ? `<script type="application/json" id="jump-public-page">${json(page)}</script>`
      : '';
  return html
    .replace('</body>', () => seed + '</body>')
    .replace(/<div id="root">\s*<\/div>/, () => `<div id="root">${body}</div>`);
}
export function heading(title: string, description: string) {
  return `<h1 class="display text-4xl leading-tight sm:text-6xl">${esc(title)}</h1><p class="mt-4 max-w-2xl text-lg text-ink-2">${esc(description)}</p>`;
}
export function link(path: string, label: string) {
  return `<a class="btn-primary mt-5" href="${esc(path)}">${esc(label)}</a>`;
}
