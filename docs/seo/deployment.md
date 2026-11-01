# SEO delivery and measurement runbook

## Release order

This change is not deployed. Keep the existing API, TLS, admin, OAuth, payments, Expo and email configuration. The new public delivery layer uses the existing NestJS process and PostgreSQL database, not a new service or frontend framework.

1. Build on the repository's pinned Node 22 and pnpm 9.15.9 with frozen lockfile. Run API/web/shared/admin checks and existing tests. `pnpm --filter @jump/web build` must produce `dist/index.html`, `dist/seo-static.json`, `dist/offline.html` and matching hashed assets. `seo-static.json` contains the existing homepage hero and business components rendered at build time.
2. Deploy the API and web artifacts together to staging. Set `WEB_INDEX_PATH` to the deployed web `dist/index.html`. API file permissions must permit reading the HTML and static JSON beside it. Production `WEB_ORIGIN` must equal `https://startajump.com`; staging must not emit indexable production content to crawlers (use staging access control or a deferred overriding noindex header). Preserve existing `VITE_API_URL`.
3. Apply migration `1793550000000-OrganicAcquisition` through the existing migration runner. It only creates the attribution table/index; no product tables are rewritten. Leave `SEO_ANALYTICS_ENABLED=false` and `VITE_SEO_ANALYTICS_ENABLED=false` initially. The admin report requires the migration even while tracking is off.
4. Merge `deploy/Caddyfile.seo` into the actual server Caddy configuration. Retain the API/admin host blocks and existing operational settings. Confirm the web root and API upstream port (blueprint uses existing documented port 6311). Run `caddy adapt --config ... --adapter caddyfile --validate` and `caddy validate --config ... --adapter caddyfile` on the target Caddy version before any reload. Local route coverage tests are not a replacement for Caddy validation. Add deferred `header >X-Robots-Tag "noindex, nofollow"` to API/admin hosts so upstream public HTML cannot override it; public page responses on the web host must retain their specific index directives.
5. Complete the smoke matrix below. Deploy and reload through the normal release procedure only after checks pass. Never ship only the web index's default noindex change while leaving the old universal SPA delivery in place: public HTML, web assets and routing must ship as one release.
6. Submit the sitemap only after checking production responses. Watch errors, conversion flows and search coverage. Roll back API/web/Caddy together if needed; keep attribution flags off. The analytics table can remain during rollback. Revert its migration only if the collected telemetry is intentionally disposable.

## Required staging and production smoke checks

Use a real published event, an open club with a useful description, a public competition, and disposable staging accounts. Do not create synthetic production listings for search tests.

| Check | Expected result |
| --- | --- |
| `/`, `/business`, eligible public detail and discovery pages with JS disabled | Readable content, exactly one h1, unique title/description, self canonical and safe public JSON-LD |
| `/robots.txt`, `/sitemap.xml`, each listed shard | 200; text/plain or application/xml; HTTPS canonical URLs only; sitemap URLs resolve 200/indexable |
| Missing public record / unknown URL | 404/noindex, not a successful app shell |
| Known formerly public deleted event/competition | 410/noindex, absent from sitemap |
| Private or unpublished record | 404/noindex from public SEO layer; no private details in HTML, JSON or sitemap |
| Existing private club invite link in browser | Existing SPA invite/join behavior remains available after JS; initial SEO response intentionally 404/noindex |
| ID or noncanonical case / trailing slash | Single 308 to canonical slug/code; no loops |
| `/login`, pass tokens, dashboards, profiles, payment return, API, admin | Noindex; sensitive application routes still serve their app and retain normal authorization |
| Public API/database unavailable | 503/no-store/noindex; no cached successful empty detail page |
| Get Pass | Guest registration, existing-pass handling, ticket capacity, email/pass link and QR still work |
| Join club / competition | Sign-in redirect and existing membership/entry behavior work; no bypass of eligibility or payments |
| OAuth / payment return | Existing web/mobile deep links and payment reconciliation work |
| Installed PWA | Online navigation keeps 404/410/503; offline opens generic app shell, previously loaded hashed assets still work; no personalized page stored as the home shell |
| Mobile widths / keyboard | No horizontal overflow; useful headings, readable controls, focus and Get Pass/join actions |
| Sharing | Event/club/competition preview uses the correct title, description and public image |

The checked-in delivery regex is tested against all explicitly registered app routes. Repeat that check when adding routes: an unknown path intentionally stops falling through to the SPA.

## Search Console

Use the business-owned Google account in [Search Console](https://search.google.com/search-console). Add a Domain property for `startajump.com`, copy the exact DNS TXT value shown, add it through the existing DNS provider and verify. Retain the TXT record. Do not invent a verification token or remove another owner's record. Google's [ownership guide](https://support.google.com/webmasters/answer/9008080) describes the available methods.

After deployment submit `https://startajump.com/sitemap.xml`. Inspect `/`, `/business`, a real event and an eligible club/competition. Compare live-test HTML, declared/Google-selected canonical and indexing directives. Check Page indexing, Sitemaps, Event enhancements and Core Web Vitals weekly. Export Performance by date, page, query, country and device with impressions, clicks and CTR. Export indexing coverage separately: eligible URLs in Jump's report are not proof of Google indexing. Google describes [sitemap submission](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

Run [Rich Results Test](https://search.google.com/test/rich-results) on deployed event URLs after routing is live. Code-mode validation cannot verify live accessibility, canonical redirects, image fetches or crawl eligibility. Valid schema does not guarantee rich-result display. Never add invented performers, reviews, sale dates, addresses or ratings to silence optional warnings. Follow Google's [Event requirements](https://developers.google.com/search/docs/appearance/structured-data/event).

## Bing Webmaster Tools

Sign in to [Bing Webmaster Tools](https://www.bing.com/webmasters/) with the business-owned account. Add the HTTPS site manually and use the DNS verification option presented by Bing, or import an already verified Search Console property if the owner chooses that permission flow. Retain the issued DNS record. Submit `/sitemap.xml`; inspect the same real public URLs. Review indexing/crawl reports and export search impressions, clicks, CTR and landing pages weekly. No Bing/Google credentials or verification values are stored in this PR.

## Optional first-party attribution

Enable only after the owner approves the site's privacy/consent behavior for the intended markets and the staging checks pass. Set API `SEO_ANALYTICS_ENABLED=true`; build the web with `VITE_SEO_ANALYTICS_ENABLED=true`. Both must be on. Leaving either off disables collection. This work does not add a consent manager; if affirmative consent is required, wire these calls to that existing consent decision before enabling.

The browser classifies only Google, Bing, DuckDuckGo or Yahoo referrer hosts, generates a random session UUID and obtains a signed 24-hour token for an eligible public landing path. It stores the token in sessionStorage, not a cross-site cookie. Full referrers, queries, user IDs, emails, IPs and pass tokens are not inserted into the acquisition table. Existing server access logs are outside this table's retention policy. This is a bounded first-touch, same-tab-session attribution model; referrer suppression, cross-device and later sessions cause undercounting.

`GET /v1/admin/seo/performance` uses existing JWT/admin guards and returns 30-day aggregate counts by date/source/landing/kind plus current eligible record counts. It exposes no user-level drill-down. `landing`, `cta_click` and `business_contact_click` are deduplicated per session/kind. `event_registration` records only a successfully issued new pass, and `club_join` only a new committed membership; duplicate retries are ignored. Attribution failures do not fail those product transactions. Best-effort cleanup removes telemetry older than 90 days when tracking receives a landing; no new scheduled worker is added.

Business contact clicks measure inquiry intent, not confirmed delivered leads. Jump currently uses mailto and has no confirmed business inquiry submission endpoint. Report that distinction until a real inquiry flow exists. Search impressions/clicks/CTR and confirmed indexed pages remain null in the app report until external reports are connected; do not substitute page views or sitemap counts for those metrics.

## Repeatable validation

```sh
pnpm --filter @jump/api lint
pnpm --filter @jump/api test -- --runInBand
pnpm --filter @jump/api build
pnpm --filter @jump/shared lint
pnpm --filter @jump/web lint
pnpm --filter @jump/web test
pnpm --filter @jump/web build
pnpm --filter @jump/admin lint
# Optional integration check: isolated disposable PostgreSQL schema, never production.
TEST_DATABASE_URL=postgresql://... node scripts/check-seo.cjs
```

The SQL check creates/drops its own schema using the existing pg dependency. It exercises the actual schedule function, catalog queries, sitemap-to-indexable-page consistency, public/private/deleted records and attribution migration/idempotency. Unit tests also cover HTML/JSON escaping, valid canonical targets, metadata, sitemap rules, no physical Event schema for virtual challenges and offline response behavior.
