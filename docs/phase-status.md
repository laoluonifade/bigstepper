# Phase Status

Last reviewed: 18 October 2026

## Foundation completed

- [x] pnpm workspace with the frontend and backend under `apps/`
- [x] NestJS modular monolith with strict TypeScript and `/v1` routes
- [x] PostgreSQL through TypeORM with an explicit initial migration
- [x] Redis connection, health check, and BullMQ queue infrastructure
- [x] Validated environment configuration and production-safe migration policy
- [x] JWT authentication with validated DTOs and authenticated ownership checks
- [x] Batched, idempotent GPS ingestion with database constraints
- [x] Free table creation, registration, discovery, and provisional standings
- [x] React/Vite app using the NestJS API, TanStack Router, and TanStack Query
- [x] Supabase client and migration removed
- [x] Paid-contest feature flags default to off

## Backend free-MVP core completed

- [x] Database-backed JWT sessions with logout/revocation
- [x] Email-verification and password-reset token workflows (development tokens until an email provider is connected)
- [x] Runner profiles, privacy defaults, units, username, and country
- [x] One-active-run constraint with start, pause, resume, sample upload, and idempotent finish
- [x] BullMQ activity verification with GPS accuracy, gap, timestamp, and plausible-speed checks
- [x] Recorded versus validated distance and verification confidence/reasons
- [x] Activity history, activity ownership, and verification review requests
- [x] Transactional free-table registration with capacity and deadline enforcement
- [x] Automatic verified-activity crediting using batched SQL and distance caps
- [x] Deterministic provisional standings and immutable final snapshots
- [x] Privileged review and free-table settlement with audit events
- [x] Clubs, memberships, league divisions/seasons, and notification endpoints
- [x] Consent, eligibility, outbox, idempotency, payment-inbox, and ledger schema foundations
- [x] Paid checkout/webhook routes fail closed
- [x] Paystack transaction initialization and independent verification
- [x] Raw-body HMAC-SHA512 webhook authentication with durable inbox and BullMQ processing
- [x] Atomic paid-seat fulfillment, full-table automatic refunds, and payment reconciliation
- [x] Paid-table draft/approval gates, fixed guaranteed prizes, awards, tokenized recipients, and two-person payout execution
- [x] Transfer success/failure/reversal and refund webhook state handling
- [x] Public discovery of approved/open free and paid competitions
- [x] Checkout handoff using Paystack's authorization URL without a per-request callback URL
- [x] Jump product rename across package scopes, API metadata, and visible web copy
- [x] Creator signup profiles with a fixed 5% commission snapshot on creator challenges
- [x] Creator commission accrual and two-person-admin Paystack payout requests
- [x] 30% standard and 35% creator-challenge winner deduction rules stored per challenge
- [x] Non-withdrawable wallet funding, wallet transaction history, and wallet-funded challenge entry
- [x] Walk, run, distance, step, and timed challenge scoring stored and enforced by the backend
- [x] Community API alias; any authenticated user can create a community
- [x] Paid-entry adult/eligibility enforcement with audited operator updates
- [x] Atomic single-claim payout execution, admin-only financial controls, and password step-up
- [x] Payout-recipient replacement hold and user security notification
- [x] Dispute-triggered wallet freeze, eligibility revocation, and pending-payout hold
- [x] Creator self-entry/self-award prevention for paid challenges
- [x] Global and sensitive-route rate limits, security headers, and production Swagger shutdown
- [x] Explicit Paystack test/live key-mode gates and high-severity dependency audit in CI

## Frontend integration completed

- [x] Stable `/v1` REST contract with DTO validation and consistent HTTP errors
- [x] Bearer-token authentication and session-validation endpoint
- [x] Payment status endpoint for authoritative post-checkout polling
- [x] Public table feed, table lookup, live standings, and immutable final results
- [x] Frontend implementation handoff documented in `docs/frontend-handoff.md`

## Still to implement

- [ ] Connect a production email provider; development currently returns verification/reset tokens directly
- [ ] Add interrupted/cancelled run transitions and the client-side offline recovery contract
- [ ] Club invitations and complete league promotion/relegation finalization
- [ ] Broader admin table lifecycle, appeals, exports, account deletion, and retention jobs
- [ ] Exercise the complete Paystack sandbox journey with the merchant's test key and configured webhook URL
- [ ] Obtain written legal/Paystack approval before changing any production financial feature flag
- [ ] Professionally review and sign off the ledger account classification and prize tax treatment
- [ ] Pino/OpenTelemetry/error monitoring and production deployment artifacts
- [ ] Add administrator MFA before live payouts (password step-up is implemented as the current minimum)
- [ ] Full unit, integration, and end-to-end test suites
