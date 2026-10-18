# ENGINEERING BUILD SPECIFICATION — JUMP

**Version:** 1.0 | **Target:** Production-grade web MVP | **Market:** Nigeria first

> **Instruction to coding agent:** You are the founding principal engineer, product architect, security engineer, and implementation lead. Build an actual functioning application in the working repository, not a set of design mockups. Think carefully, make decisions explicit, implement vertical slices, test before moving on, and report what is truly implemented. Treat this document as a specification, not permission to bypass financial, legal, or platform requirements.

## 0. Executive product brief

Build Jump, a mobile-first walking and running challenge platform. Participants record physical activity, join time-boxed challenges, and climb leaderboards using the challenge's explicit server-verified scoring method. The product supports communities, creators, divisions, activity history, and a polished sporting experience.

**Proposed revenue/competition mechanic:** eligible adults pay a fixed entry fee to join a table. A disclosed prize amount is attached to that table. The highest-ranked eligible participant at settlement is the proposed sole winner. Other runners receive no cash prize, subject to prominently displayed competition rules and any legally required refunds/exception treatment. **This paid-entry / prize model MUST remain disabled in production until Nigerian legal advice, relevant licenses/permits where required, and Paystack's written prior approval are obtained.** Paid entry plus prizes may be regulated even where athletic skill determines results. No attempt may be made to misdescribe the business as ordinary event ticketing to evade restrictions.

**Critical vocabulary:** A *challenge* is a specific, finite competition. The legacy database and API may call it a *table*. A *bid* in user language means the participant's **standing/rank**, not a monetary wager. The MVP does not include raising stakes, side bets, peer-to-peer wagers, user-funded prize pots, or in-competition rebuys. A Jump wallet is a closed-loop payment balance for platform services: funded balances cannot be withdrawn or transferred to another user. Every competitor in a challenge faces identical, disclosed rules.

## 1. Non-negotiable stack

- **Backend:** NestJS, Node.js LTS, TypeScript strict, REST API, Swagger/OpenAPI, class-validator/class-transformer or Zod boundary schemas (pick one coherent strategy).
- **Primary database:** PostgreSQL with PostgreSQL transactions, schema migrations, constraints, indexes, and PostGIS for GPS/geospatial queries if justified.
- **Caching and queues:** Redis; BullMQ for durable, retryable background jobs using Redis, with PostgreSQL as canonical state. Never rely on Redis alone for financial state or finalized rankings.
- **Frontend:** React + Vite + TypeScript strict (not Next.js), TanStack Router for typed client routing, TanStack Query for server state, TanStack Table where useful for leaderboards/admin lists, Tailwind CSS + shadcn/ui + accessible primitives, React Hook Form + Zod. Add TanStack Virtual only for genuinely long lists.
- **State management:** local React state by default, Zustand only for session/GPS state that warrants shared client-side control; TanStack Query is the authority for remote state, not a duplicate global store.
- **Payments:** Paystack via a dedicated NestJS integration module; test mode only until written permission + regulatory clearance. Integrate transaction initialization, verification, authenticated webhooks, refunds where supported, and payout/transfer workflows behind explicit feature flags and admin approval.
- **Maps:** MapLibre GL JS + suitable, licensed map tiles; lazy-load map UI. Evaluate a routing/geospatial library; do not confuse road-snapped estimates with recorded GPS movement.
- **Testing:** Vitest for frontend, Jest/NestJS test tools for backend, Supertest for API, Playwright for e2e, Testcontainers or dockerized test PostgreSQL/Redis, deterministic fake GPS input.
- **Quality/operations:** pnpm monorepo, Docker Compose locally, ESLint, Prettier, GitHub Actions, structured logging (Pino), OpenTelemetry or comparable telemetry, error monitoring.
- **Hosting:** vendor-neutral deployment artifacts; evaluate the hosting provider for transactional DBs, reliable worker processes, WebSockets/SSE, Nigerian latency, cost, and secrets management.

No substitutions from this stack without a documented technical necessity. No Firebase/Supabase as the canonical auth/database replacement without approval. No direct browser-to-Postgres or browser-to-Redis access. No microservices in the MVP; implement a **modular monolith** in NestJS.

## 2. Core user journeys and persona capabilities

**Runner:** signs up, verifies eligibility/age, creates profile, allows location, sees available tables, understands rules and fee/prize, joins a free practice table, records a run, sees credible distance and pace, observes standings, reviews evidence and results, receives promotion/relegation and (only when approved) prize notification.

**Paid competition runner (gated):** sees fee and complete prize math, pays via Paystack-hosted checkout, waits for independently verified payment, is admitted exactly once, sees live/provisional rank, runs again to defend standing, sees dispute/verification state, receives final result, and if winner completes permitted payout onboarding.

**Organizer:** creates clubs, free practice tables, and, only if explicitly authorized, paid competition drafts; defines dates, eligibility, capacity, scoring, fees, prize guarantees, and minimum participants within admin policy. Organizers cannot withdraw participant funds, change rules after first join, self-award wins, or settle their own contested result.

**Admin/compliance:** configures policies, approves organizers/tables, sees ledger and payment reconciliation, reviews fraud/appeals, settles or cancels tables, processes approved payouts, audits privileged actions, and can disable all financial operations without taking down the running app.

## 3. User-facing product requirements

### 3.1 Auth and onboarding

Email verification, password-reset (if password auth), robust HTTP-only secure session cookies or a well-justified token system, token revocation, optional OAuth later. Username uniqueness, editable profile, avatar, preferred units, privacy settings, country, verified age eligibility for paid contests, optional identity verification where required. Never publish the precise home/start/end location by default. No public activity route until runner opts in; consider privacy zones.

### 3.2 Home screen

Mobile-first home: prominent **Start Run** CTA, recent run summary, this week's verified/credited distance, active table and rank, next rival's credited distance, time until entry closes and scoring closes, provisional promotion/relegation state, recent results, achievements, clear GPS and rule disclaimers. Accessible focus states, large touch targets, excellent small-device performance.

### 3.3 GPS run recording

A rigorous finite state machine: `IDLE -> ACQUIRING_PERMISSION -> GPS_READY -> RUNNING <-> PAUSED -> INTERRUPTED -> COMPLETING -> PENDING_VERIFICATION -> VERIFIED|FLAGGED|REJECTED` (with cancellation and failure paths). Use Geolocation API + `watchPosition`, timestamped latitude/longitude/horizontal accuracy; record source metadata and monotonic client sample sequence. Calculate displayed pace/distance provisionally on client; backend re-computes authoritative distance from accepted samples using a well-tested geodesic algorithm (e.g. Haversine or geographic library). Respect pause segments and elapsed versus moving time. Filter gross errors, low-confidence samples, impossible jumps, replayed routes, malformed timestamps; quarantine ambiguous data rather than automatically accusing an athlete. Distinguish **recorded distance**, **validated distance**, and **table-creditable distance** (capped by transparent competition policy).

**Honest web limitations:** React+Vite PWA does not guarantee background GPS on locked phones. Service workers cannot continuously record GPS. Detect permission loss, tab visibility changes, sleep, network interruption and app reload; persist locally to IndexedDB for recovery and upload in idempotent chunks with session/sample identifiers. Do not interpolate missing locations into prize-eligible distance; do not label low-confidence runs verified. UI must explain that active-screen tracking may be needed. Support a simulated-location mode in development only, clearly separated from production.

**Anti-cheat is not solved merely by GPS:** server-issued signed/opaque session challenge, rate-limited authenticated sample ingestion, unique sample sequence + idempotency, plausible speed/acceleration and route continuity analysis, long-gap penalties/quarantine, concurrent session controls, suspicious reuse/duplicates, risk scoring and manual adjudication, device/session signals only with proportionate privacy consent. A browser cannot prove the human was running, prevent spoofed coordinates, or reliably detect vehicle travel. For money competitions, establish stricter eligibility and manual review, or require a stronger data source before enabling.

### 3.4 Activities and stats

Persistent run history, activity page with private map, elapsed and active duration, distance, pace, GPS confidence, verification explanation, leaderboard contributions and dispute options. Weekly/monthly totals, longest run, trends, records, achievements. Backend computes authoritative metrics; raw points stored separately with retention rules and encryption/access limits. Store units precisely (e.g. integer millimeters/meters for metrics where practical, explicit conversion policies).

### 3.5 Tables, leagues, and clubs

Table cards show: title, organizer, table type, start/end, entry cutoff, scoring cutoff, participant count, entry fee (or FREE), guaranteed versus estimated prize, deductions/fees, participant criteria, scoring rules, distance caps, minimum entrants, cancel/refund policy, winner-takes-all rule, prize restrictions, verification hold, tie-breaker, and status.

Table formats:
- Free practice competition (MVP fully available).
- Sponsored/free-entry prize competition only after legal/provider policy review where applicable.
- Paid-entry winner-takes-all competition **gated off in production pending approvals**.

Challenge scoring formats:
- `WALK` + `MOST_STEPS`: highest total verified steps during the scoring period.
- `STEP` + `MOST_STEPS`: highest total verified steps during the scoring period.
- `DISTANCE` + `FARTHEST_DISTANCE`: highest total verified walking/running distance.
- `RUN` + `FARTHEST_DISTANCE`: highest total verified running distance.
- `RUN` + `FASTEST_FIXED_DISTANCE`: fastest valid completion of the declared target distance.
- `TIMED` + `FASTEST_TIME`: fastest valid completion of the declared target distance/activity.

The challenge type, scoring method, target where required, eligible activity types, and tie-break policy are disclosed before entry and frozen once a paid entry is confirmed.

Any authenticated user may start a community. A user may separately open a creator profile as an influencer, community manager, run club, or other creator. Creator status does not bypass paid-challenge approval. Approved creator challenges snapshot a 5% creator commission.

Divisions: Bronze, Silver, Gold, Platinum, Elite; seed users fairly; seasonal cohorts; configurable progression/regression; no promotions/relegations until table result is finalized. Distinguish ongoing **competitive table results** from longer-running **league placement**. A user can participate in multiple tables only when explicitly allowed; define whether a single verified activity can be credited to multiple tables; document exact rules to prevent double counting or retrospective gaming. Clubs: admin/member roles, invite links, member lists, club standings and event organizers. Strong object-level authorization.

### 3.6 Real-time leaderboard

Near real-time updates using server-sent events or bounded polling (prefer TanStack Query polling for MVP and optional SSE for active tables), user pinned position, rival delta, provisional promotion/relegation zone, countdown to immutable deadline, activity verification badges. Rank only eligible activity distance for the relevant scoring window. Never display 'won' while pending reviews exist or before settlement. Stable deterministic ordering with documented tie-breaker: highest credited distance; then earliest moment the final credited total was achieved; if still equal, documented deterministic policy (e.g. equal split, refund, or earliest eligible registered participant) **must be legally/product approved and disclosed before entry**. Because winner-takes-all is a core promise, avoid ad hoc random tie decisions. Snapshot final leaderboard and scoring algorithm version.

### 3.7 Competition lifecycle

`DRAFT -> PENDING_APPROVAL -> SCHEDULED -> OPEN_FOR_ENTRY -> ACTIVE -> ENTRY_CLOSED -> SCORING_CLOSED -> VERIFICATION_HOLD -> SETTLEMENT_READY -> SETTLED -> PAYOUT_PENDING -> PAID`, and branches `CANCELLED`, `VOIDED`, `DISPUTED`. Not all states must exist individually if justified, but the distinction between **entry deadline**, **run/scoring deadline**, **verification period**, and **payout state** must be explicit. Reject late activities or late registration according to clearly posted policy; never allow the organizer to move deadlines after funds are accepted except through controlled documented resolution. All season/table timers derive from server time in UTC; display user's local timezone.

## 4. Winner-takes-all economics and the entry fee

**Semantics:** Participants pay a fixed, published admission fee to a defined challenge. The winning eligible participant receives **one prize** according to published challenge terms. Activity changes rank only; no extra payment is required to protect rank. Jump may provide a reloadable closed-loop wallet for challenge entry and other platform services. Funded balances are non-withdrawable and non-transferable; they are not betting credit, a user-funded prize pot, or escrow. Required merchant refunds remain distinct from user withdrawal.

The business must explicitly decide whether the prize is (a) a pre-funded **guaranteed fixed prize**, or (b) a **variable prize** based on eligible paid entrants; do not conflate them. **Default recommendation for legal review: fixed, guaranteed prize externally funded by the organizer/platform, with the entry fees treated through the merchant's approved processing structure, not represented as segregated deposits unless legally true.** Any variable participant-funded pool requires additional explicit legal/Paystack approval before activation.

If an illustrative configuration has 20 entries at NGN 2,000, gross receipts = NGN 40,000. **Do not claim the winner automatically receives NGN 40,000.** Actual disbursable prize depends on declared prize policy, processing fees, taxes/withholding where applicable, refund exposure, reserve policies, and payout fees. Provide a fully transparent breakdown; never silently deduct a platform fee from a guaranteed prize.

Financial policy per table, versioned and frozen at first confirmed entry:
- currency NGN, entry price in kobo (integer)
- minimum and maximum entrants
- optional approved guaranteed prize (kobo)
- approved variable-prize formula (disabled until separately authorized)
- platform fee schedule and payment processor fee assumptions
- Jump's total deduction from gross winnings is 30% for an ordinary paid challenge. For an active creator's challenge it is 35%: 5% accrues to the creator and Jump retains the base 30%. The participant must see gross winnings, total deduction, creator commission, and net winner amount before paying.
- gross receipts vs merchant available funds vs prize liability
- prize eligibility and verification requirements
- what happens when nobody completes an eligible run
- low-turnout cancellation vs allowed single participant
- refunds/chargebacks/disqualified winner policy
- ties, no-shows, cancelled runs, deadline issues
- winner review window and final appeal deadline
- who funds chargebacks and payout failures

**Money safety:** financial liability must not rely on eventual participant count if a guaranteed prize is advertised. Enforce organizer deposit/funding proof or platform underwriting before publishing such a guarantee. No payout beyond reconciled available/approved funds. No financial writes from the UI alone. No conditional winnings represented as cash balances available to withdraw.

## 5. Paystack module — designed but gated

**Documented provider restriction as of specification writing:** Paystack's published acceptable-use terms include gaming, skill games, and activities involving both entry fees and prizes, requiring prior approval and lawful jurisdictions. Production paid-entry features are disabled until written approval and applicable legal clearance are recorded. The system must not simulate authorization or conceal the paid-prize nature from Paystack.

Feature gates: `PAID_CONTESTS_ENABLED=false`, `PAYSTACK_LIVE_ENABLED=false`, `PRIZE_PAYOUTS_ENABLED=false`, `VARIABLE_PRIZE_POOLS_ENABLED=false`. Enable in stages only through signed-off operational checklist; production must fail closed if required approvals are missing or expired. Sandbox tests may proceed without live funds, subject to Paystack test terms.

### 5.1 Payment initiation

`POST /v1/tables/:id/checkout` checks adult/region eligibility, table status, registration cutoff, duplicate membership, organizer status, capacity, fee snapshot, approval feature flag and sanctions/AML/KYC requirements as applicable. Create a durable `payment_intent` with UUID, unique merchant reference, exact amount/currency and state `INITIATED`; reserve a registration slot for short bounded time if needed. Only backend calls Paystack transaction initialize with secret credentials; never expose secret key. Return hosted authorization URL/reference; no membership is granted yet. Client success callback is **never** proof of payment.

### 5.2 Verification/webhooks

Implement `/v1/webhooks/paystack` using raw unmodified request body and documented `x-paystack-signature` HMAC verification (verify current docs). Validate expected event, amount, currency, reference, payment status, and reference-to-user/table mapping; handle duplicates, reordering, retries and invalid signatures. A successful callback must be reconciled using provider verification as necessary. Persist unique `provider_event_id` or stable dedupe key; durable inbox/outbox for downstream processing. On independent confirmed success, atomically mark payment verified and assign **one** seat, or invoke documented refund path if table is already full/closed due to race. Do not blindly trust asynchronous webhook ordering. Never accept unverified payment amount or arbitrary table ID from client metadata.

Payment states: `INITIATED`, `PENDING`, `SUCCEEDED`, `FAILED`, `EXPIRED`, `REFUND_PENDING`, `REFUNDED`, `PARTIALLY_REFUNDED`, `CHARGEBACK`, `RECONCILIATION_REQUIRED`. Distinguish gateway truth from internal fulfillment truth. Perform scheduled reconciliation for stuck states. Refund decisions are audited and subject to provider capability.

### 5.3 Payouts

Paystack recipient creation/bank verification/transfer initiation/transfer status handling behind a NestJS provider interface. Use documented provider transfer reference/idempotency controls, approved payout states, signed webhooks, reconciliation. One approved winner award per table with unique DB constraint. Restrict payout initiation to approved service identities and two-step privileged approval. Reconcile `transfer.success`, `transfer.failed`, `transfer.reversed`; a request acceptance is not a completed payout. Handle KYC/identity checks, tax treatment, blocked accounts, and payout reversals. A winner cannot alter their prize amount, target user ID or settlement outcome.

**Do not assume Paystack transaction splits create escrow or legally segregated prize custody.** Read and validate actual merchant agreement and settlement model. Avoid collecting and retaining bank data beyond operational necessity. Sensitive tokens stored in secrets manager, never logs.

## 6. Accounting and immutable auditability

Model a balanced double-entry ledger where money movement or liabilities warrant it, denominated entirely in integer kobo per currency, with unique event references, immutable entries, and explicit posting rules. Suggested conceptual accounts: merchant processor clearing, cash/settled bank, contest entry revenue or liability as advised by accountant, payment processing expenses, guaranteed prize liability, payout payable, refunds/chargebacks, platform income. Accounting treatment **must be reviewed professionally**; engineering must not invent legal ownership of participant funds.

Every payment, refund, reward approval, transfer, failed/reversed transfer, and adjustment has a durable state transition and audit trail. Transactional outbox ensures business state and notification/jobs cannot diverge. Implement daily provider reconciliation and report unexpected balances, duplicated references, unmatched payments, settlement gaps. No `float` for money, no manual alteration of ledger journal entries: corrections use reversing entries.

## 7. Anti-cheat and physical safety

Threat model: fabricated GPS, mock location, car/bike transport, replayed routes, API spoofing, time tampering, multiple accounts, shared phones, invalid sessions, privilege bypass, organizer collusion, location spoofing, last-second bulk uploads, deliberately interrupted runs, GPS drift, payout fraud and chargebacks.

Backend never trusts user-submitted kilometers, raw completion time, eligibility or ranking. Verify route consistency, repeated traces, plausible human pace over time, accuracy quality, session integrity and device evidence only where lawful/consented. Define automatic acceptance, manual review and rejection criteria; version scoring algorithm; minimize false positives. High-stakes contests may require stronger independently validated data sources: browser-only GPS alone cannot give robust anti-cheat assurance. Include appeal flow and evidentiary retention with data protection. **Do not describe GPS spoof detection as foolproof.** Flag atypical performances rather than silently stripping earnings.

Health guardrails: configurable daily/weekly credit caps; cooldowns or rest messaging; don't celebrate unsafe mileage escalation; no 'run until exhaustion' push messaging. Clearly show maximum eligible credited distance so runners do not feel forced into unlimited competition. Require legal age and competition rules acceptance; include safety guidance and emergency disclaimer.

## 8. Core domain, data model and invariants

Create migrations, entity relationship diagram, constraints, and indexes for at least:

- `users`, `profiles`, `sessions`, `consents`, `user_eligibility`
- `clubs`, `club_memberships`, `organizer_approvals`
- `running_sessions`, `gps_samples`, `activities`, `activity_processing_runs`, `activity_verification_reviews`
- `competition_tables`, `table_rules_versions`, `table_registrations`, `table_activity_credits`, `table_leaderboard_snapshots`, `table_settlements`, `table_appeals`
- `league_divisions`, `league_seasons`, `league_cohorts`, `league_memberships`, `league_transitions`
- `payment_intents`, `payment_events`, `provider_webhook_inbox`, `refund_requests`
- `prize_awards`, `payout_recipients` (tokenized), `payout_requests`, `payout_attempts`
- `ledger_accounts`, `ledger_journals`, `ledger_entries`, `reconciliation_runs`
- `achievements`, `user_achievements`, `notifications`, `admin_audit_events`, `idempotency_keys`, `outbox_events`

Invariants enforced with database constraints and transactions:
1. Runner has max one confirmed registration per table.
2. Paid table registration requires independently verified matching payment (except explicitly documented complementary admin seat, which paid-prize policy may prohibit).
3. Activity credit is derived from verified activity with actual timestamp within valid scoring window, accepted before cutoff/review rules.
4. An activity cannot accrue the same table's credits twice, regardless of repeated submissions.
5. Table rule snapshots are immutable after first confirmed paid entry.
6. One final settlement per table per settlement version; re-settlement only via explicitly audited corrective version under controlled process.
7. At most one winner award for winner-takes-all table; tie policy disclosed ahead of time.
8. One executed payout per approved award, idempotent against retries.
9. Every ledger journal is balanced for each currency.
10. Permission checks happen server-side for every mutation.
11. Redis cache invalidation cannot change canonical DB results.
12. Historical scoring/rules are versioned and reproducible.

Use `SELECT ... FOR UPDATE`, appropriate transaction isolation, advisory locks where needed, durable job dedupe, and unique indexes for concurrency. Analyze race conditions: simultaneously last slot paid; payment after entry closes; duplicate `charge.success`; competing settlement workers; changing table capacity; late GPS batch; concurrent review/appeal; failed payout retries.

## 9. NestJS module boundaries and suggested monorepo

```text
apps/
  web/                           # React + Vite + TanStack
  api/                           # NestJS HTTP API
  worker/                        # NestJS context / BullMQ processors (if separated at deploy time)
packages/
  contracts/                     # typed API schemas and DTO interfaces
  config/                        # shared env validation and utilities
  ui/                            # optional shared UI primitives
  test-fixtures/                 # deterministic GPS/table/payment fixtures
infra/
  docker/
  migrations/
docs/
```

NestJS module boundaries: `IdentityModule`, `ProfilesModule`, `RunningModule`, `ActivityVerificationModule`, `TablesModule`, `LeagueModule`, `ClubsModule`, `LeaderboardModule`, `PaymentsModule`, `PayoutsModule`, `LedgerModule`, `FraudModule`, `NotificationsModule`, `AdminModule`, `AuditModule`, `JobsModule`. Use controllers -> application services -> repositories/domain policies; avoid circular Nest imports and giant services. Define shared domain events/outbox contracts, not hidden cross-module database writes. ORM: choose Prisma or Drizzle (state choice/rationale); geospatial SQL can use tested raw queries as needed.

## 10. REST API contract requirements

Versioned `/v1` endpoints, OpenAPI generated, authenticated ownership checks, pagination and cursor stability:

- `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/session`, `/auth/verify-email`, `/auth/reset-password`
- `/me`, `/users/:username`, `/me/privacy`, `/me/data-export`, `/me/delete`
- `/runs/start`, `/runs/:sessionId/samples` (idempotent batched append), `/runs/:sessionId/pause`, `/resume`, `/finish`, `/runs/:sessionId`
- `/activities`, `/activities/:id`, `/activities/:id/review-request`
- `/tables`, `/tables/:id`, `/tables/:id/standings`, `/tables/:id/register-free`, `/tables/:id/checkout` (gated), `/tables/:id/my-standing`, `/tables/:id/rules`, `/tables/:id/result`, `/tables/:id/appeal`
- `/leagues`, `/leagues/me`, `/leagues/:id/standings`
- `/clubs`, `/clubs/:id`, `/clubs/:id/invitations`, `/clubs/:id/members`
- `/payments/:reference/status` (only owner), `/me/rewards`, `/me/payouts` (gated)
- `/webhooks/paystack` (authenticated via provider signature, not user cookie)
- `/admin/tables/:id/approve`, `/admin/verification/reviews`, `/admin/payments/reconciliation`, `/admin/settlements`, `/admin/payouts/:id/approve`, `/admin/audit`

Document exact request/response DTOs, error codes and RBAC policies. Use request IDs, structured domain errors, server-calculated authority fields, bounded input sizes, secure rate limits and data retention policies. Avoid leaking whether a private table, user identity or bank account exists to unauthorized clients.

## 11. Backend performance and consistency

PostgreSQL is canonical. Redis caches leaderboard read models with keys scoped by table ID/scoring version and short TTL; invalidate on verified activity credit, fraud reversal or settlement. Never use Redis sorted-set scores as the sole source of truth. Evaluate aggregate table-credit projections to avoid scans over every GPS point for a leaderboard read. Index `table_id`, status, credited_distance, tie-break timestamp, activity timestamp, user; index GPS samples by session and sequence and consider partition/retention at scale. No unbounded route data in leaderboard responses. Separate ingestion from analysis via BullMQ and server-issued verifiable session IDs. Expose provisional and final standings distinctly.

## 12. React/Vite UX and TanStack design

Pages: marketing home, login/register, onboarding, runner dashboard, run live, run finish/summary, activity list/detail, table discovery, table details/rules, checkout (gated), provisional standings, final winner/results, leagues, clubs, rewards (gated), notification center, profile/settings/privacy, organizer management, admin console. Route-level code splitting with TanStack Router; TanStack Query for typed fetching, mutation invalidation and refresh; TanStack Table for large/interactive lists; React Hook Form + Zod for forms. Build an optimistic UI only where it cannot lie about payment or competition state. Use clear skeletons, empty states, errors, offline banners, low-data mode, accessible color contrast. Athletic premium look: sports typography, restrained dark palette, bright accent, large numerals, focus on kilometers and rivals, delight without manipulative FOMO.

Critical UX copy must differentiate:
- **Distance recorded** vs **distance verified** vs **distance credited**.
- **Payment started** vs **payment confirmed** vs **entry active**.
- **You're in 1st (provisional)** vs **You won (final)**.
- **Prize advertised** vs **prize guaranteed** vs **prize payable after review**.
- **Tracking interrupted** vs **activity rejected**.

Use site terms, organizer identity, fee disclosure, eligibility, winner-takes-all conditions, cancellation/refund policy and approval status conspicuously before any permitted paid checkout.

## 13. Compliance and go-live gate (hard blocker)

Build and ship **free running tracking and free tables** even if paid contests are not authorized. The real-money feature may exist as inaccessible modules/tests/config and UX drafts but must be **hard-disabled** in production until all conditions are verified:

1. Nigerian counsel analyzes the competition in each jurisdiction offered; identifies gaming, lottery, promotional competition, consumer protection, advertising, data protection, tax and prize obligations, and confirms required licensing/permits and age restrictions. Do not assume 'skill' automatically exempts paid contests.
2. Paystack confirms **in writing** the merchant, exact pay-to-enter/winner-prize model, permitted geography and payout method are approved under its acceptable-use terms.
3. Merchant onboarding/KYB/KYC and payout beneficiary verification is complete.
4. Approved published rules, refunds, chargebacks, tax handling, dispute procedure, fraud handling and transparent prize economics exist.
5. Real payout custody/settlement route, reconciliation, monitoring, funding reserve, administrative approval, incident response and liability are signed off.
6. Geolocation collection and financial/identity data comply with appropriate privacy law; privacy notice, consent, retention and deletion controls exist.
7. Adults-only eligibility for paid tables unless counsel documents a different lawful framework.
8. Abuse and anti-cheat evidence meets the accepted risk threshold for cash prizes, with human review.
9. Operational kill switches are tested for halting new entries and payout execution.

If any condition fails, leave all real-money features disabled; do not replace the payment provider silently or obscure the business model to secure processing.

Authoritative reading to inspect/reconfirm at implementation:
- Paystack terms and acceptable use: https://paystack.com.ng/terms
- Paystack supported/ineligible businesses: https://support.paystack.com/en/articles/2127042
- Paystack webhooks: https://paystack.com/docs/payments/webhooks/
- Paystack payment verification: https://paystack.com/docs/payments/verify-payments/
- Paystack transaction initialize: https://paystack.com/docs/api/transaction/
- Paystack transfers: https://paystack.com/docs/transfers/single-transfers/

Do not infer present commercial approval from technical API availability.

## 14. Testing — mandatory edge cases

**Unit:** Haversine with antimeridian/poles, accuracy cutoff, pause/resume, GPS dropout, speed outliers, unit conversions, cap rules, table eligibility, ranking ties, settlement time boundaries, promotions/relegations, prize formula, accounting balanced entries, financial state machines.

**Integration:** Nest auth guards, row-level object ownership, GPS batch dedupe, session finalization, credit write-once constraints, safe concurrent entries, payment verification with mocked Paystack sandbox responses, webhook signature verification, out-of-order/duplicate webhook events, refunds, signed settlement, BullMQ retries, database idempotency and crash recovery.

**End to end:** New runner -> free table -> location consent -> start -> deterministic GPS trace -> finish -> verification -> provisional leaderboard -> cutoff -> reviewed settlement -> final winner -> league progression. Payment sandbox: new runner -> paywall info -> gated checkout blocked without approvals; when test flags enabled -> sandbox checkout -> authenticated webhook -> exactly one seat; replay callback -> no duplicate; no second payout for same award. Admin fraud review must alter provisional standings and delay payout safely.

**Security:** injection, CSRF if cookies, XSS, CORS, IDOR, leaked routes, replay attacks, forged client success, arbitrary amount injection, fake GPS, overposting DTOs, privilege escalation, unauthorized bank recipient changes, SSRF through callback fields, malicious images, rate-limit exhaustion. Static analysis and dependency scanning in CI.

**Load/chaos:** 10k leaderboard reads vs concurrent run uploads (use realistic staged load, not promises); PostgreSQL worker contention, Redis restart, worker killed after provider call, duplicate payment confirmation, delayed webhook, clock drift, network instability. Define SLOs and actual measured performance targets after first benchmark.

## 15. Deliverables and implementation plan

### Phase 0 — Design and risk register

Write `docs/product-spec.md`, `docs/architecture.md`, `docs/competition-rules.md`, `docs/running-engine.md`, `docs/financial-model.md`, `docs/compliance-gates.md`, and ADRs. Clarify user-provided ambiguities with safe defaults; document them instead of silently changing economics. Produce data flow, ERD, event diagrams and threat model.

### Phase 1 — Repository, CI, data and auth

Set up pnpm workspace, Vite React app, Nest API, PostgreSQL, Redis, migrations, Docker Compose, typed OpenAPI/client contracts, health checks, lint/type/test CI, auth and profile. Seed deterministic dev data.

### Phase 2 — Vertical slice: real free tracking

`Register -> Start Run -> Geolocation capture -> recover interrupted session -> backend GPS validation -> persist -> view route and metrics -> free table leaderboard`. Every step must be functional and tested before moving on.

### Phase 3 — Competition, clubs and seasonal leagues

Table creation, admission rules, caps, provisional leaderboard, seasons, cohorts, promotion/relegation, appeals, archived final standings, invitations, organizer/admin workflows.

### Phase 4 — Fraud and financial sandbox architecture

Review system, deterministic risk pipeline, Paystack test-only initiation/webhook verification and reconciliation, fixed prize policy, balanced ledger, refund handling, transfer adapter and fake/sandbox payout flow. Production cash flags remain OFF until approval.

### Phase 5 — Premium experience and operations

Home dashboard, visual polish, route map, notifications, achievements, accessibility, mobile optimizations, metrics, security hardening, backup/restore, deploy runbooks, production monitoring.

### Phase 6 — Conditional regulated real-money release

**Do not execute automatically.** Requires human verification of Section 13, signed legal/provider documentation, realistic fraud risk assessment, operations approval, live key provisioning, staged rollout, payout limits, daily reconciliation and kill switches.

## 16. Agent working agreement

1. Start with a short architecture proposal, safety/risk notes, typed domain model and ordered implementation plan.
2. Check installed versions and current framework/Paystack API documentation; do not hallucinate library APIs.
3. Inspect the existing repository before making changes. Preserve useful code.
4. Create small coherent commits or milestone checkpoints. Implement one usable vertical slice at a time.
5. After each slice run typecheck, linter, unit/integration tests, migration checks and a smoke test. Fix regressions before continuing.
6. Expose `.env.example` without real credentials; validate required env at startup and fail closed for missing approvals/secrets.
7. Never manufacture external integration success. Distinguish test/sandbox behavior from real processing. Report exact commands and evidence.
8. Track engineering debt and known limitations, particularly web GPS and anti-cheat. Do not claim zero bugs.
9. Avoid pointless abstractions and infrastructure costs. Choose simple, recoverable operational design.
10. Keep `README.md`, OpenAPI docs, architecture diagrams, migrations, deployment guide and runbooks current.
11. Never activate production paid entry, cash handling, or payout based solely on the user's product request; require the documented approvals.
12. If blocked by missing external credentials or approval, complete all legal non-financial parts and build thoroughly tested sandbox/mock integration boundaries with production flags off.

## 17. Definition of done

A verified adult/user can sign up; track a real foreground web run on supported devices; recover or appropriately flag an interrupted run; receive backend-calculated metrics; view private route; join free tables; observe correct deterministic provisional rank; have competitions settle exactly once after verification; view final results; move between configured leagues; join a club; submit an appeal; see clear errors. API authorization, GPS privacy, database constraints, migrations, CI, observability, backup/recovery and security tests must operate. In the test environment only, Paystack sandbox events are authenticated, payment state reconciles, one paid registration is created for one verified eligible payment, prize selection creates one award, and duplicate payout requests cannot create duplicate disbursements. **Live paid entry remains off until legal, provider and security gates pass.**

## 18. First response format for the implementation agent

Return, in this order:

1. **Architecture decisions** (why modular NestJS, Postgres, Redis, Vite/React/TanStack).
2. **Risks/blockers** (web GPS limitations, cheating with financial incentives, pay-to-enter prize compliance).
3. **Domain/ERD** with core indexes, constraints and activity/payment/settlement state machines.
4. **Exact free-MVP product flow** and paid flow behind gates.
5. **API outline** and authorization policy.
6. **Repo structure**, local run commands, env checklist, dependencies.
7. **Sprint-sized implementation checklist** with pass/fail acceptance tests.
8. Begin coding Phase 1 immediately and report the verified files/tests, not just a plan.

**Important:** Preserve the central product excitement: a runner can see someone take first place, run more verified kilometers within safe and published caps, reclaim the lead, and defend it until the table closes. Never trade accurate results, user safety, privacy, or payment integrity for dramatic UI.
