# Jump SEO audit — 1 November 2026

## Scope and evidence

Reviewed Vite/React 18, TanStack Router, NestJS PagesService, public event/club/competition repositories, service worker, assets and deployment script. Live GET checks used verified HTTPS via curl (Python's local trust bundle failed; certificate verification was not disabled). Reviewed the latest main commit a33522a and preserved the pending business copy revisions in PR #4.

Live https://startajump.com/, /business, /robots.txt, /sitemap.xml and a deliberately nonexistent URL all returned HTTP 200 and the identical 1,463-byte HTML shell, title Jump, one generic description and an empty #root. robots/sitemap returned text/html rather than their required formats. These are production observations, not assumptions about Google indexing.

## Priorities before architecture changes

| Priority | Finding | Safe implementation |
| --- | --- | --- |
| P0 | Empty initial public HTML; metadata-only event previews | Extend existing NestJS public page renderer; serve equivalent public HTML to every visitor, retaining the React assets for existing interactive routes |
| P0 | Universal SPA fallback returns soft 404s | Explicit public delivery routes, 404 for missing/private content, 410 only for known public deleted content, 503 for database outages |
| P0 | Preview competition query omits visibility restriction | Single shared public eligibility filter for HTML, metadata, discovery and sitemaps |
| P0 | robots/sitemap are HTML shells | Dynamic XML sitemap index and bounded shards; real robots text; checked-in Caddy integration |
| P0 | Sensitive routes lack noindex headers | Noindex/nofollow for account, pass, auth, dashboard and payment routes, plus API/admin host instructions; robots is not an authorization boundary |
| P1 | Generic metadata; no canonical or JSON-LD | Unique server and navigation metadata, canonical slug redirects, Organization/WebSite/BreadcrumbList, Event only for eligible real-world occurrences |
| P1 | Clubs directory requires authentication | Add public discovery hub without weakening existing authenticated club APIs |
| P1 | No organic acquisition/category/city surfaces | Curated useful category pages using real current data; location URLs only from actual club locations and sufficient public inventory; no guessed locations |
| P1 | Homepage waits for auth resolution; business primary heading is h2 | Initial readable HTML and semantic headings; public content must not require login |
| P1 | Service worker caches every navigation response under / | Preserve offline app shell separately; never let a personalized, missing or expired detail page overwrite it |
| P2 | Global fonts; large map chunk; no field CWV baseline | Preserve map lazy loading, explicit image dimensions and lazy below-fold images, caching rules and optional Web Vitals collection; measure field p75 before claiming improvements |
| P2 | No organic attribution or search-tool connection | Privacy-conscious first-party attribution, server-derived pass/club conversions, documented GSC/Bing setup and reporting |

## Existing strengths

Public event detail and guest Get Pass flows already exist. Individual club pages are public; club lists require authentication. Public competition detail, branding, design tokens, lazy map loading and event scheduling function already exist. Events have real start dates, time zones, venue/address and organizer data. Event tickets and recurring schedules must be rendered from these records; prices/availability must not be invented. The application already has a NestJS service capable of loading the built React shell, and existing CSS can style server HTML.

## Important limitations and exclusions

No real-user CrUX/Core Web Vitals data, search engine property access, index coverage or search performance exports have been supplied. Lighthouse is a lab check, not evidence of field CWV. No deployed Caddy config is checked into the repository; server routing must be integrated and smoke-tested before claiming live SEO improvement. No reliable city field exists for events; only explicit club location text may seed location pages, without geocoding or guessed city names. Missing venue/address or virtual-only competition records must not get physical Event markup. The server must not serialize members, profiles, emails, pass tokens, private competition rules or private club metadata.

## Chosen approach

Retain Vite/React/TanStack and NestJS. Extend the existing pages service into the public delivery layer, with shared public metadata/eligibility and real data-backed discovery. Generate static marketing HTML from existing React components where feasible; keep the SPA for interactions, auth and payments. Do not migrate to a new frontend framework. Add checked-in Caddy routing and a deploy checklist instead of editing production. Implement in a separate SEO PR stacked on the business page PR, so the existing copy work remains reviewable.

## Reference guidance

- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://developers.google.com/search/docs/appearance/structured-data/event
- https://developers.google.com/search/docs/crawling-indexing/robots/intro

Robots alone does not prevent indexing; use noindex or authorization. Event rich-result eligibility is not guaranteed by valid JSON-LD.
