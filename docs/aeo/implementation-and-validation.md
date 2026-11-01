# AI search implementation and validation

## Shipped in source

This follow-up builds on SEO PR #5, which is still unmerged and undeployed. It does not deploy production, change DNS/search account ownership or claim current AI citations.

- `/about`: a clear product reference covering audiences, competition creation/joining, iPhone Apple Health synchronization and limits, clubs, recurring runs, public events/Get Pass and workplaces. Visible FAQs match FAQPage JSON-LD exactly. SoftwareApplication describes supported Web/iOS functionality without invented pricing, ratings, app-store releases or endorsements.
- `/learn`: a public knowledge index and six substantive guides for virtual running challenges, employee step competitions, creating a club, 5K event organization, phone-based walking competitions and recurring club events. Each has distinct content, useful next actions, related links, metadata, canonical URL, Article/BreadcrumbList and readable pre-JS HTML. The same escaped body is used by the existing React discovery page. No extra frontend framework, CMS or AI API is introduced.
- Routing, sitemap inclusion, initial query-cache seed, server-rendered CSS and public footer links are integrated with the existing SEO architecture. Unknown guides are 404/noindex; canonical trailing slashes redirect. Existing public event/club/competition eligibility, genuine-location thresholds, private routes and PWA/auth/payment behavior remain unchanged. No event-city pages or fake inventory were added.
- AI referral categories reuse the existing signed acquisition tokens, PostgreSQL table, server-confirmed pass/club conversion hooks and admin reporting. Supported hosts cover ChatGPT, Perplexity, Gemini, current/legacy Copilot web entry points and Claude. Spoofed host suffixes, malformed/non-web URLs and query-only source labels are rejected. Google/Bing traffic remains blended rather than falsely labeled AI. Tracking remains disabled by default through the existing flags.
- Robots comments distinguish search crawlers from GPTBot training; the existing wildcard access policy is preserved. No new training opt-in/out decision or WAF permission change was made. llms.txt is assessed and deferred in favor of standard delivery.
- Added a repeatable public HTTPS crawler audit and offline checker tests, a source-of-truth ledger, a 48-scenario blank monthly review CSV and 90-day plan. No consumer-AI prompts, fabricated citation results, automated messages or scheduled automation were created.

## Validation

Pinned Node 22.23.4 and pnpm 9.15.9 were used for the workspace checks. No dependency declaration, lockfile, new database migration or external service was needed for this follow-up.

| Check | Result |
| --- | --- |
| API suite | 50 suites, 341 tests passed, including existing payments, passes, activity and private-page behavior |
| Web suite | 6 suites, 53 tests passed, including referrer boundaries, all registered routes against delivery rules and offline/404/410/503 behavior |
| Python checker suite | 5 tests passed, including real-world content types with charset, invalid HTML/XML/robots, denied/challenged responses and independent GPTBot observation |
| Workspace lint/type checks | API, shared, web, admin and mobile passed |
| Production builds | API, web including marketing/offline artifacts, and admin passed |
| PostgreSQL scheduling/catalog/sitemap integration | Existing SQL runner passed in isolated PGlite PostgreSQL engine, including the added knowledge URLs resolving to indexable canonical pages |
| Source checks | `git diff --check` passed; Python checker imports/executes successfully |

Total: 399 passing tests across API, web and Python, plus the SQL integration run. Guide tests check readable HTML without JS, one h1/title, unique metadata, safe JSON parsing, visible FAQ/schema parity, Article identities, sufficient real content, sitemap membership and canonical redirects. They do not certify Google rich-result eligibility or AI ranking. New knowledge schemas were not submitted as deployed URLs to external validators because the release is not live. Existing build warnings about the lazy map chunk, mixed auth imports and a gradient utility remain; no measured CWV improvement is claimed.

## Live evidence

An initial 36-request audit observed the identical 1,463-byte empty HTML shell for six public paths and six user agents, with no 403/429/challenge. The committed checker then ran 42 observations across seven paths and six agents: all 35 search/browser delivery checks failed the expected semantic HTML/robots/sitemap requirements. Seven GPTBot responses were kept observational so the checker does not impose a training policy. No unexpected cross-host redirects remained after correcting and testing content-type parsing. Evidence JSON stores response metadata and error signals without full bodies, queries or user data.

A focused site-restricted web search returned no results in the available tool. It is not a full Google/Bing coverage report or a cross-product AI visibility test. Real vendor crawler IP access, CDN/WAF internals, actual AI citations, recommendation accuracy and attributable production conversions remain unmeasured. No guarantee of rankings, mentions or citations is made.

## Before production

1. Review/merge the existing business and SEO prerequisites in order, then this follow-up; retarget stacked PRs to main for the existing CI trigger. Local checks above passed; no remote CI result is implied for a non-main base.
2. Use the existing SEO deployment runbook: matching API/web artifacts, original attribution migration, correct WEB_INDEX_PATH/WEB_ORIGIN and target-server Caddy validation. The Caddy integration blueprint was not applied or validated on the actual server in this task.
3. Complete staging guest-pass/join, private invite, OAuth/payment, PWA and mobile visual smoke checks. Public knowledge rendering and regression tests passed; those are not native-device or third-party payment certification.
4. Run the live crawler checker again, submit the real XML sitemap to the verified Google property, and inspect eligible real event/club/competition/guide URLs. Review authenticated vendor bot traffic with the operator; UA simulation alone cannot prove it.
5. Keep analytics flags off until the existing privacy/consent and staging conversion checks pass. Follow measurement-and-operations.md for host categories, attribution limitations, admin metrics and the monthly review. Use Bing AI Performance where available, separate from referral analytics.

## Changed files

- `apps/api/src/pages/knowledge.spec.ts`
- `apps/api/src/pages/knowledge.ts`
- `apps/api/src/pages/pages.service.ts`
- `apps/api/src/pages/seo-analytics.controller.ts`
- `apps/api/src/pages/seo-analytics.service.ts`
- `apps/api/src/pages/seo-analytics.spec.ts`
- `apps/api/src/pages/seo-render.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/components/Shell.tsx`
- `apps/web/src/lib/organic.ts`
- `apps/web/src/lib/seo.test.ts`
- `apps/web/tailwind.config.ts`
- `deploy/Caddyfile.seo`
- `docs/aeo/90-day-growth-plan.md`
- `docs/aeo/audit.md`
- `docs/aeo/implementation-and-validation.md`
- `docs/aeo/measurement-and-operations.md`
- `docs/aeo/monthly-review-template.csv`
- `packages/shared/src/seo.ts`
- `scripts/audit-public-crawlers.py`
- `scripts/test_public_crawlers.py`
