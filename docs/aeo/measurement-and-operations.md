# AI search measurement and operations

## Distinguish discovery, citations and visits

A crawler response proves neither indexing nor citation. A visible citation proves neither a visit nor a conversion. Store these as separate observations.

The existing acquisition flow now recognizes `chatgpt.com`, `chat.openai.com`, `perplexity.ai`, `gemini.google.com`, `copilot.microsoft.com`, `copilot.com`, `copilot.cloud.microsoft`, `m365.cloud.microsoft` and `claude.ai`, including proper subdomains with hostname-boundary checks. It records only a source category, eligible landing path, random session identifier and event kind using the existing signed-token flow. It does not store full referrers, search queries, chat IDs, prompts, user IDs, pass tokens or health records. Microsoft documents its current Copilot web entry points at https://support.microsoft.com/en-us/microsoft-365-copilot/what-is-microsoft-copilot-app . Query parameters such as `utm_source=chatgpt` are not sufficient to assert an AI origin. Google and Bing host referrals remain ordinary Google/Bing categories because their AI and traditional traffic is not reliably distinguishable from referrers.

Existing flags remain off by default: API `SEO_ANALYTICS_ENABLED` and web build `VITE_SEO_ANALYTICS_ENABLED`. Both must be enabled only after the existing migration, privacy/consent decision and staging conversion validation. No new table, service, scheduler, vendor or cookie is introduced. Reuse `/v1/admin/seo/performance` with the existing JWT/admin authorization: aggregates already group by source, page, date and kind, including the new source categories. Test a signed AI landing followed by a new pass issuance and a new club membership in staging. Tampered, private-page and duplicate/retry behavior stays covered by tests.

Measurement remains first-touch in the same browser tab/session with a 24-hour token; missing/referrer-stripped traffic, app-to-browser handoffs, cross-device and later sessions will be missed. Pass registration and club-join counts come from successful domain operations. Business mailto clicks are intent, not delivered inquiries. Do not label these referral counts as citation counts, AI share of voice, model endorsement or incremental revenue.

## Search property reporting

Jump's Google Search Console domain was verified in this chat. After production HTML/routing deployment, submit the working XML sitemap and inspect real public pages. Google states that existing SEO practices apply to AI features and no dedicated AI text file or special schema is required. Its AI feature guidance describes performance reporting in Search Console: https://developers.google.com/search/docs/appearance/ai-features . Treat Google host attribution as blended search, not a reliable AI-only segment.

Verify the business-owned Bing Webmaster Tools property through its existing DNS/import flow when the owner is ready. Use its AI Performance report if available to the property for cited URLs and citation trends across supported Microsoft surfaces; this is independent of Jump's referral analytics. Microsoft documents those metrics and their limits here: https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/ . No Bing property, permissions or external account settings were changed by this code release.

## Manual visibility review

Run the same eight scenarios in `monthly-review-template.csv` across ChatGPT Search, Google AI Overviews, Google AI Mode, Gemini, Perplexity and Bing Copilot. Use the named search mode where available. Do not use the Codex web-search tool as a substitute for results in each named consumer product. Do not claim a product was tested if access, region, authentication, subscription or an AI answer was unavailable.

For each run:

1. Start a fresh conversation or clean search session. Record date, product/mode/model where shown, country/language/device and sign-in/personalization state. Use the fixed prompt and avoid adding Jump to an unbranded prompt to force a mention.
2. Record whether an AI answer appeared, whether Jump was mentioned, the actual cited public URLs and the description given. Open each citation and confirm it points to the claimed page and supports the answer. A brand mention without a link is not a citation. Save the evidence URL or a screenshot with private account information redacted.
3. Compare claims with `/about`, guide text and the product truth ledger below. Classify each observed product claim as supported, inaccurate or unclear. Watch specifically for claims of instant background sync, Apple Health on Android, guaranteed prizes, private club/event confusion, paid ticket sales, certified courses or team scoring not actually supported.
4. If results contradict each other, repeat that scenario in a separate fresh session and keep both observations. Do not select only the favorable answer. Record unavailable/no-AI-answer cases explicitly instead of treating them as a ranking failure.
5. Report counts with denominators: citation rate = answers citing Jump / AI answers actually returned; mention rate = answers mentioning Jump / AI answers returned. Show unavailable/AI-not-shown counts separately. Summarize accuracy findings rather than inventing a single precision score from missing answers. Compare matched prompt/product/locale cohorts month to month, noting model and product changes.

The CSV is an unfilled observation template, not a set of collected rankings or citations. No consumer-AI prompts were submitted on the user's behalf in this implementation. There is no paid monitoring service or automated outreach.

## Monthly cadence

On the first working day each month, growth runs the matrix and exports Search Console/Bing reports plus the existing admin acquisition aggregates. Engineering checks crawl errors and handles factual corrections. An organizer/product owner reviews changes to tracking, pricing, passes and privacy. Record the reviewed source version and actions in the monthly notes. Prioritize incorrect claims and broken cited URLs before producing more content. No scheduled automation was created; this is an operating checklist.

## Crawler access and deployment checks

Deploy the existing SEO prerequisites and this follow-up together through the normal staging/release workflow. The Caddy blueprint now routes `/about`, `/learn` and `/learn/<slug>` through the same public renderer. Sitemaps include exactly the curated guide URLs; unknown guides are noindex/404. Knowledge markup is seeded into the existing React query cache to avoid replacing readable content with an initial loading state. Existing PWA/auth/payment routes and public catalog privacy checks are unchanged.

Run `PYTHONDONTWRITEBYTECODE=1 python3 scripts/audit-public-crawlers.py --base-url https://startajump.com --output crawler-evidence.json` after release. It returns nonzero for broken public HTML, robots, sitemap or search-crawl responses. GPTBot responses are observational and do not impose a training policy. `python3 -m unittest discover -s scripts -p test_public_crawlers.py` tests the checker without the network. Unit/integration tests cover guide HTML/metadata/schema, canonical/sitemap consistency, safe private handling and AI source validation.

Synthetic user-agent checks cannot establish real crawler access. Inspect the actual CDN/WAF rules and server logs with the operator. Verify vendor identity using current official documentation/IP ranges or supported verified-bot facilities. Do not disable rate limits, challenges or security rules globally, and do not grant special access to private APIs based on a User-Agent string. There was no observed 403/429/challenge in the sampled live responses, but edge configuration and verified-origin access remain uninspected.

OpenAI separates OAI-SearchBot search discovery from GPTBot training access: https://developers.openai.com/api/docs/bots . Google-Extended controls certain Gemini training/grounding uses and does not determine inclusion or ranking in Google Search: https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers . Perplexity documents its crawler and user-triggered fetcher separately: https://docs.perplexity.ai/docs/resources/perplexity-crawlers . Current wildcard public crawl policy is preserved. An owner decision to restrict training must use the specific control without inadvertently removing search discovery, and be tested independently.

## llms.txt decision

Defer adding llms.txt until the HTML/sitemap release is working and the knowledge center has useful content. It is an experimental documentation proposal, not a ranking requirement, citation guarantee, crawler permission or privacy boundary: https://llmstxt.org/ . If later trialed, generate a short public-document link index from the same guide registry, monitor verified usage, and remove it if maintenance exceeds demonstrated value. Never include private profiles, API responses, pass tokens or full health data. Standard HTML, canonical URLs, sitemaps and genuine external references take priority.

## Product truth ledger

| Claim | Source reviewed in repository | Boundary |
| --- | --- | --- |
| iPhone Apple Health read permissions, daily imports and background updates | `apps/mobile/src/lib/apple-health.ts`, `components/apple-health.tsx` | Supported native build; permission required; iOS controls timing; no Android parity claim |
| Eligible health totals and connection/scoring windows | `apps/api/src/apple-health/apple-health.service.ts`, `tables/health-days.spec.ts` | History totals are not automatically competition credit; no public health serialization |
| Competitions and scoring | `apps/api/src/tables/competition-rules.ts`, public table entity; web competition forms | Actual eligible activity/format/windows apply; no guaranteed prize or team-scoring promise |
| Club membership | `apps/api/src/clubs/clubs.service.ts`, web club pages | Open versus invite membership; account/eligibility unchanged |
| Event repeats and publishing | `apps/api/src/club-events/club-events.service.ts`, scheduling migration/function | Actual local schedule and next occurrence; no inferred event cities |
| Guest Get Pass, capacity and delivery | `apps/api/src/club-events/event-passes.service.ts`, web Events page | Eligible published event; do not advertise unsupported paid ticket sales |

Review this ledger and affected guides whenever those product behaviors change. No fake locations, attendees, customer results, testimonials, ratings or external endorsements were added.
