# SEO implementation and validation

Status: implemented for review; not deployed. No production configuration, search property, DNS record, payment setting or notification flag was changed. The SEO change is stacked on the existing business-page work in PR #4.

## What was built

- Extended the existing NestJS PagesService into a public HTML delivery layer for every visitor. Retained Vite, React, TanStack Router, existing APIs and interactive product routes. No new runtime dependency or production service was added.
- Prerendered the existing homepage hero and business section at build time. Dynamic event, open-club and public-competition pages contain readable headings, dates/rules, organizer/location information and actions before JavaScript. The React assets still provide existing product behavior.
- Added server and client-navigation titles, descriptions, canonical links, Open Graph/Twitter previews and escaped JSON-LD. Canonical IDs/case/trailing slashes redirect to the real slug/code; workplace/corporate keyword aliases consolidate into `/business`.
- Added live XML sitemap index/shards and robots.txt. The same public eligibility rules govern discovery, metadata and sitemap membership. Deleted, suspended, unpublished, private, empty and incomplete records are excluded as appropriate; formerly public deleted events/competitions use 410, unknown/private content 404 and HTML delivery failures 503.
- Added `/running-events`, `/running-clubs`, `/step-challenges` and `/virtual-fitness-challenges`, plus existing events/competitions hubs and footer discovery links. Content comes from real current public records. Empty hubs are noindex. Exact recorded club locations can generate location pages only with multiple public running clubs; event cities are never guessed from a club's address.
- Added Organization/WebSite on the homepage, BreadcrumbList on public pages, public-club Organization and competition WebPage markup. Only scheduled, published, venue-based events with valid recorded coordinates receive physical Event markup. Virtual challenges never receive Event markup. Prices and availability use actual supported ticket options; paid tickets that the current registration flow cannot sell are not advertised as on sale.
- Added noindex defaults and route-specific headers for sensitive SPA routes, API responses and the admin shell. Public SEO output never serializes private profiles, members, guest faces, contact details or pass tokens. Published events remain public even when the host club is invite-only; that club's private page is not promoted as a public destination.
- Preserved the PWA's offline app shell separately so a detail/private/error page cannot overwrite it. Hashed asset caching and lazy maps remain; added explicit event-cover/logo dimensions, a high-priority event cover and compression/cache instructions. CSS builds include server-rendered utility classes. No measured CWV gain is claimed.
- Added disabled-by-default first-party organic attribution, signed expiring session tokens, deduplicated landing/action events and successful server-confirmed pass/club conversions. Reused PostgreSQL and existing admin guards. Added a basic admin reporting endpoint; Google/Bing metrics remain explicitly unknown until connected externally. No extra worker, analytics vendor or consent manager was introduced.

## Validation performed

Validated locally with pinned Node 22.23.4 and pnpm 9.15.9 after installing existing locked mobile dependencies; no lockfile or dependency declaration changed.

| Check | Result |
| --- | --- |
| API tests | 49 suites, 324 tests passed, including payments, pass issuance, auth validation, activity and notifications |
| Web tests | 6 suites, 32 tests passed, including sensitive/public route classification, every registered app route against delivery rules and offline/404/410/503 behavior |
| Workspace lint/type checks | API, shared, web, admin and mobile passed |
| Production builds | API, web with marketing prerender and offline shell, admin passed |
| PostgreSQL SQL/migration integration | Passed with PGlite's PostgreSQL engine in an isolated local database: actual recurring schedule function, public/private/deleted records, sitemap canonical targets, location gating, migration up/down and conversion deduplication |
| Google Rich Results Test | Final generated real public event code: 2 valid items (Event and BreadcrumbList). [Result](https://search.google.com/test/rich-results/result?id=s_bh8LQu3rwZE31E_IOVRQ) |
| Whitespace/conflict checks | `git diff --check` passed |

Rich Results Test reported three noncritical optional omissions for the representative event: performer, Offer.validFrom and organizer.url. Jump has no supported performer/sale-start value; the organizer's club is invite-only, so a public organizer URL is deliberately omitted. No values were invented to remove warnings. This was code-mode validation, not a deployed-URL crawl or rich-result guarantee. Local unit tests validate homepage/club/competition JSON-LD; production URL tests remain required.

Build warnings remain for the existing large lazy map chunk, the existing auth module's mixed static/dynamic imports, and an existing gradient utility. They did not fail builds. PageSpeed Insights returned HTTP 429/quota exceeded, so no Lighthouse score or field LCP/CLS/INP result is reported.

## Outstanding requirements and limits

1. Review and merge the business PR and this SEO change in order. Apply the analytics migration, deploy matching API/web artifacts, and integrate/validate the Caddy blueprint against the real server configuration. Local Caddy binary downloads timed out; target-version `caddy validate` has not been run. The checked-in routing blueprint was not applied to production.
2. Complete guest pass, authenticated join, private invite, OAuth/payment-return, installed-PWA and mobile visual smoke checks on staging, then deployed URL checks. Existing automated domain tests passed, but they are not a live third-party payment or native-device test.
3. Verify business-owned Google/Bing properties, submit the live sitemap, inspect real public URLs and collect indexing/search performance exports. There is no confirmed index-coverage or organic acquisition baseline yet.
4. Leave both attribution flags off until migration, privacy/consent decision and staging conversion validation. Measurement is same-tab first-touch with a signed 24-hour lifetime; it will undercount suppressed referrers, cross-device and later sessions. Contact clicks are inquiry intent, not delivered business inquiries; the current mailto flow cannot confirm delivery.
5. Add authoritative structured event city data before releasing event-city pages. No event city SEO pages or invented locations were created. Location pages and empty hubs will remain unindexed when genuine inventory is insufficient. No mass content generation was added.
6. Measure real mobile LCP/CLS/INP and loading behavior after deployment. Larger bundle work, verified inquiry submission, a search-console API importer, and richer editorial city content remain follow-ups driven by evidence, not hidden completed claims.

See deployment.md for exact release/search-tool/measurement instructions and 30-day-roadmap.md for the operating plan.

## Changed files

- `apps/admin/index.html`
- `apps/api/.env.example`
- `apps/api/src/club-events/club-events.controller.ts`
- `apps/api/src/club-events/event-passes.service.ts`
- `apps/api/src/clubs/clubs.controller.ts`
- `apps/api/src/clubs/clubs.service.ts`
- `apps/api/src/config/environment.ts`
- `apps/api/src/database/migrations/1793550000000-OrganicAcquisition.ts`
- `apps/api/src/main.ts`
- `apps/api/src/pages/pages.controller.ts`
- `apps/api/src/pages/pages.module.ts`
- `apps/api/src/pages/pages.service.ts`
- `apps/api/src/pages/pages.spec.ts`
- `apps/api/src/pages/public-catalog.ts`
- `apps/api/src/pages/seo-analytics.controller.ts`
- `apps/api/src/pages/seo-analytics.service.ts`
- `apps/api/src/pages/seo-analytics.spec.ts`
- `apps/api/src/pages/seo-config.ts`
- `apps/api/src/pages/seo-render.ts`
- `apps/web/.env.example`
- `apps/web/index.html`
- `apps/web/package.json`
- `apps/web/public/sw.js`
- `apps/web/scripts/prerender.mjs`
- `apps/web/src/App.tsx`
- `apps/web/src/components/BusinessSection.tsx`
- `apps/web/src/components/LandingHero.tsx`
- `apps/web/src/components/OrganicAttribution.tsx`
- `apps/web/src/components/SeoHead.tsx`
- `apps/web/src/components/Shell.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/organic.ts`
- `apps/web/src/lib/seo-delivery.test.ts`
- `apps/web/src/lib/seo.test.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/pages/Discover.tsx`
- `apps/web/src/pages/Events.tsx`
- `apps/web/src/pages/Landing.tsx`
- `apps/web/src/seo/static-pages.tsx`
- `apps/web/tailwind.config.ts`
- `deploy/Caddyfile.seo`
- `docs/seo/30-day-roadmap.md`
- `docs/seo/audit.md`
- `docs/seo/deployment.md`
- `docs/seo/implementation.md`
- `packages/shared/src/api.ts`
- `packages/shared/src/seo.ts`
- `scripts/check-seo.cjs`
