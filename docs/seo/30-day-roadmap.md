# 30-day organic acquisition roadmap

## Days 1–3: release safely and record the baseline

Complete staging/Caddy validation and the smoke matrix in deployment.md, then release API/web/routing together. Verify Google/Bing properties and submit the sitemap. Record eligible versus indexed pages, existing impressions/clicks/CTR, top landing pages, and conversion counts before comparing changes. Validate real event URLs in Rich Results Test. Run mobile Lighthouse/PageSpeed on the deployed homepage, business page, discovery hub and event detail; use Search Console/CrUX field data where available. Establish p75 LCP ≤2.5s, INP ≤200ms and CLS ≤0.1 as targets, not achieved results.

## Days 4–7: fix crawl and listing quality

Check sitemap fetches, indexing exclusions, canonicals, 404/410/503 and Event enhancements. Ask existing organizers to complete accurate descriptions, venue/address, date/time/timezone and registration availability in their existing listings. Ask public running clubs to provide useful descriptions and their actual location. Fix genuine stale/broken links. Keep empty/thin pages noindex. Enable opt-in attribution only after the privacy/consent decision and a successful staging pass registration and club join.

## Days 8–14: strengthen useful discovery

Review real search queries and listing demand. Improve the content of the running, club, step and virtual challenge hubs using real active inventory and organizer information. Invite existing clubs to link to their public Jump club and events from their own sites; prioritize useful referral paths over bulk link building. Club location pages appear only where there are at least two real matching public running clubs. Define an authoritative event city field/editor flow before building event city acquisition pages; do not derive city from the host's location or guess from address strings.

## Days 15–21: improve conversions with evidence

Compare organic landing-to-pass issuance and landing-to-club join by source/page. Inspect mobile Get Pass and join drop-offs, sign-in redirects and page loading. Improve titles/descriptions or action clarity where real impressions exist but CTR/conversions lag. Evaluate LCP images and JavaScript long tasks from measured evidence; preserve lazy map loading. Use business contact-click counts as intent only; manually reconcile received inquiries without claiming they are the same metric.

## Days 22–30: assess and choose the next small release

Compare the most recent complete week with the baseline and prior equivalent days, accounting for event schedules and low sample sizes. Report Google and Bing indexed coverage, impressions, clicks, CTR, organic event registrations, joins and business intent separately. List high-value excluded URLs and reasons, not just a total. Prioritize the next fixes from observed data: authoritative event locations, richer club descriptions, missing event fields, LCP or INP issues. Do not create city pages without useful inventory, thousands of keyword variants, fabricated reviews or automated filler. Thirty days establishes an operating baseline; it does not guarantee rankings or enough field traffic for CWV conclusions.

## Ownership and cadence

Engineering owns status/indexing regression checks and deployments. Growth owns weekly search exports, genuine organizer outreach and landing-page comparisons. Operations/organizers own listing accuracy. Review every Monday; change only what the evidence supports. No recurring automation or external messages were created by this implementation.
