# Jump AI discoverability audit

## Evidence and priorities

Reviewed the Vite/React/TanStack frontend, NestJS public renderer, shared routing, Caddy integration, PostgreSQL catalog eligibility, Apple Health sync/scoring and event/pass flows. This release builds on unmerged SEO PR #5 rather than replacing its architecture. Main remains a33522a; production is still the previous static delivery.

Live checks: 36 verified-HTTPS GETs across six paths (/, /business, /events, /running-clubs, /robots.txt, /sitemap.xml) and six user agents (ordinary browser, OAI-SearchBot, Googlebot, bingbot, PerplexityBot, GPTBot) returned HTTP 200 and the same 1,463-byte HTML with empty #root. Robots and sitemap are HTML, not their proper text/XML formats. Essential public content is unavailable before JS on those live paths.

These are synthetic user-agent probes from this machine, not requests originating from authenticated crawler IPs. No 403, 429 or challenge was observed in this sample. Caddy is visible in response headers; the actual CDN/WAF settings, bot IP allowlists and server access logs are not accessible, so genuine crawler access is not yet established. Do not whitelist arbitrary requests based only on a spoofable User-Agent.

| Priority | Gap | Action |
| --- | --- | --- |
| P0 | Live readable HTML, robots and sitemap fixes remain undeployed | Release and validate SEO PR #5's existing delivery layer; no second renderer or framework migration |
| P0 | Crawl availability cannot be verified from real bot origins | Review actual edge/server rules and verified bot requests against vendor-published verification/IP guidance; retain authentication and existing protection |
| P1 | No public product fact reference or knowledge center | Add source-reviewed product reference and six substantive guides with HTML, metadata, breadcrumbs and useful product links |
| P1 | AI referrers are not classified by existing attribution | Extend its host allowlist and server DTO/signing allowlist; reuse flags, table, conversions and admin reporting |
| P1 | No repeatable citation accuracy baseline | Monthly prompt matrix, evidence CSV, attribution limits and 90-day plan |
| P2 | Optional llms.txt absent | Defer experiment until standard HTML/sitemap delivery is live; not a ranking requirement or access-control mechanism |

## Search, training and access policies

OAI-SearchBot is for ChatGPT search discovery. GPTBot is a separate training crawler. Existing source robots uses a wildcard allowing public crawl; this release preserves that policy and documents the distinction rather than silently opting the owner into or out of training. Blocking GPTBot must not accidentally block OAI-SearchBot. Googlebot and Bingbot remain covered by the public wildcard, as does PerplexityBot. Sensitive content remains protected by authorization, public catalog filters and noindex, not by robots alone.

OpenAI: https://developers.openai.com/api/docs/bots
Google AI features: https://developers.google.com/search/docs/appearance/ai-features
Perplexity: https://docs.perplexity.ai/docs/resources/perplexity-crawlers
llms.txt proposal: https://llmstxt.org/

Standard indexing and snippet eligibility remain the priority. Structured data must reflect visible supported content; neither schema nor llms.txt guarantees a citation, recommendation or rich result. Google AI Overviews/AI Mode traffic and ordinary Google search traffic cannot reliably be separated by the referrer alone. Bing-hosted referrals likewise do not prove a Copilot citation.

A focused public web-search query (`site:startajump.com Jump running walking competitions events`) returned no results in the available search tool. This is a weak discovery observation, not proof that Google/Bing index no Jump pages or that any named AI product never cites Jump. Consumer-product visibility remains unmeasured until the documented manual review is run.

## Product truth and privacy boundaries

Source facts: iPhone builds connect Apple Health with read permission. Daily totals exclude manually entered samples; competitions count eligible data after connection and within their rules/windows. iOS controls background scheduling; opening Jump/manual sync can refresh data. All-day step totals are not GPS routes and are not eligible for every activity challenge. Do not claim instant continuous sync, no-permission tracking, Android Apple Health parity, guaranteed prizes or unrestricted paid ticket sales.

Clubs support public/invite membership and recurring daily/weekly/monthly events. Event creation/publishing and passes already exist, including guest Get Pass. Public event visibility is independent of invite-only host-club visibility. Guides must not expose attendee/contact/pass/member data or imply Jump replaces permissions, event operations or a measured/certified course. City landing pages remain limited to sufficient real public inventory; no event cities are inferred.

Google Search Console domain ownership was verified earlier in this chat. Reports were still processing then; that is not evidence of indexing or AI visibility. No independent cross-product citation baseline has been claimed.
