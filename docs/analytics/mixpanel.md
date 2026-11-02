# Jump product analytics

## Workspace and rollout status

Mixpanel organization/project: Jump. Owner account: hellovoya@gmail.com.
Company size: 2–10. Data residency: EU. Free plan; no upgrade or payment method added.
Project ID: 4079833; view: 4576510.
Board: https://eu.mixpanel.com/project/4079833/view/4576510/app/boards#id=11626391

The account and board exist. Application instrumentation is disabled by default and has not been deployed. The board is a measurement plan until genuine events arrive; it is not a populated dashboard. No synthetic production users or backfilled customer data were sent.

## Collection design

Existing API sends explicit HTTPS events directly to Mixpanel's EU ingestion endpoint. No SDK, additional dependency, table or queue. Delivery is best effort with a two-second timeout, maximum 32 concurrent requests, no retries or durable delivery guarantee. Failures never block normal product operations. This supports directional PM metrics, not billing or an authoritative activity ledger.

Authenticated web and mobile screen events use the existing JWT API. Clients cannot choose an identity; the server uses the authenticated account. Account identities and occurrence keys are HMAC-SHA256 with a dedicated secret salt. No email, name, phone, raw account/resource ID, query string, full URL, GPS coordinate, step total, distance, payment details, message, or health record is serialized. IP-based inference is disabled. No autocapture or session replay.

Connection and sync status events still reveal use of a health integration. Assess applicable consent, privacy notice, Apple requirements and deletion obligations before enabling. Hashes remain pseudonymous data, not anonymous data. No consent manager is added in this change. End-user opt-out/erasure must be resolved before a broad rollout; disabling flags stops future collection but does not delete vendor data.

## Events

| Event | Trigger | Coverage/interpretation |
| --- | --- | --- |
| Account Created | Account insertion commits | Includes guest/OAuth accounts; does not mean email verified or onboarding complete |
| Screen Viewed | Authenticated eligible route or mobile foreground | Coarse screen category, optional web search-referrer category; no anonymous visitors |
| Club Joined | New direct membership commits | Existing membership retries excluded |
| Pass Issued | New event pass issued | Existing pass lookups excluded; not payment revenue |
| Competition Joined | Free/sponsored manual registration commits | Paid joins and automatic club enrolment excluded |
| Activity Saved | New phone-recorded activity saved | Not verified/eligible activity; does not include all imported activities |
| Apple Health Connected | Connected link confirmed | Stable connection timestamp/key; vendor deduplication handles repeated calls |
| Apple Health Sync Succeeded | Existing sync-complete endpoint updates status | Client-reported completion; does not prove fresh/eligible movement or expose health totals |

Approved custom properties: `platform` (web/ios/android/server), `screen` (fixed route-category allowlist), `source` (fixed search-referrer allowlist), `environment` (production/development). Domain events do not assert client platform. Referrer describes a screen's originating browser document, not persistent multi-touch attribution. No revenue claims or cross-device anonymous merging.

Event insertion keys are hashed and stable for existing resource occurrences; screen views use random keys. New direct club joins use a per-join occurrence. Mixpanel deduplication is vendor-side, not an exactly-once guarantee. Concurrent delivery limits or provider failures can lose events. Monitor event volume and Free plan limits before rollout; no automatic paid upgrade was configured.

## Configure and validate

1. Create a separate development project in the same EU organization for staging traffic. Keep its token separate from production.
2. Obtain the project token from Mixpanel's project settings/Copy Token. Store it in API deployment secrets, never source control or browser/mobile bundles. Generate a dedicated random secret of at least 32 characters for `MIXPANEL_ID_SALT`. Keep it stable across releases and API instances; rotation creates new identities and breaks longitudinal cohorts. Do not reuse JWT or attribution secrets.
3. API: `MIXPANEL_ENABLED=true`, `MIXPANEL_REGION=EU`, `MIXPANEL_PROJECT_TOKEN=<environment project token>`, `MIXPANEL_ID_SALT=<dedicated secret>`. Configuration fails closed if enabled without credentials. Leave false in production until validation.
4. Web build: `VITE_PRODUCT_ANALYTICS_ENABLED=true`. Mobile build: `EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED=true`. These only enable authenticated coarse screen telemetry. API flag controls all external event delivery. Existing releases do not gain screen tracking until rebuilt/released.
5. In staging, create a test account, visit an event/club, issue a pass, join a club/free competition, save a recording, and test Health connection/sync only on a permitted test device. Inspect Mixpanel event payloads, pseudonymous identity continuity, duplicates, logout/account switching, offline/error behavior and provider failure isolation. Confirm no health measurements, identifiers or private URLs appear. No production ingestion has been validated by this change.
6. Resolve privacy notice/consent, opt-out and vendor erasure operations; record approval for the actual event set. Confirm retention, organization access and budget monitoring. Then deploy API and rebuild web/mobile, enable a controlled production rollout and inspect first real events. Roll back with API flag false; disable client flags on the next build.

No database migration is required for this integration. Earlier SEO/AEO branches have their own deployment requirements.

## PM reports after real event validation

Filter every report to `environment=production`; use the same project timezone and explicit date range. Add the following to Jump Product Overview after events are available:

- Activation: Account Created → Club Joined or Competition Joined, within 7 days. Count unique users. Report separately because competition coverage excludes paid/automatic joins.
- Event conversion: Screen Viewed (`screen=event_detail`) → Pass Issued within 24 hours. Authenticated users only; this is a user funnel across any events, not per-event conversion.
- Club conversion: Screen Viewed (`screen=club_detail`) → Club Joined within 7 days. Authenticated users only; any-club conversion.
- Weekly active users: unique users with Screen Viewed in 7 days. Excludes anonymous visitors and old clients without this instrumentation; server actions can be reported separately.
- Retention: Account Created → Screen Viewed, weekly returning users. Use a completed observation window before interpreting retention.
- Feature adoption: unique users with Activity Saved, Apple Health Connected and Apple Health Sync Succeeded. Do not equate sync status to exercise, verified competition activity or health outcomes.

Existing SEO attribution remains independent. No business inquiry or revenue event is implemented here. Avoid claiming a full acquisition funnel, paid competition conversion, all-activity volume or causal retention impact from this initial event set.

## Validation

Automated tests cover default-off configuration, HMAC identities/insertion keys, payload field allowlisting, EU routing, no IP inference, provider failure isolation, bounded delivery and exclusion of sensitive routes. Existing domain tests cover product flows; recording tests additionally verify saved-only emission and no emission for rejected empty recordings. Workspace lint, API/web tests and API/web/admin builds must pass before review. Native device and live ingestion checks remain rollout requirements.
