# Architecture Decisions

## Stack (Non-negotiable per spec)

- **Backend**: NestJS modular monolith (TypeScript strict)
- **Database**: PostgreSQL (canonical state) + TypeORM with explicit migrations
- **Cache/Queues**: Redis + BullMQ
- **Frontend**: React + Vite + TypeScript + TanStack Router/Query + Tailwind + shadcn/ui
- **Payments**: Paystack (gated behind feature flags)
- **Monorepo**: pnpm workspaces

## Why Modular NestJS

Single deployable unit for MVP speed while keeping clear module boundaries (Identity, Running, Tables, Payments, Ledger, etc.). Avoids microservices complexity.

Redis supports short-lived cache data and BullMQ jobs only. PostgreSQL remains the source of truth for users, activities, registrations, rankings, and any future financial state.

The browser talks only to the versioned NestJS API. It never connects directly to PostgreSQL or Redis, and Supabase is not part of the architecture.

## Risks & Blockers

1. **Web GPS limitations**: Background tracking unreliable in PWAs. Foreground-only with IndexedDB recovery.
2. **Anti-cheat**: Browser GPS cannot prove human activity. Manual review required for any future paid contests.
3. **Compliance**: Paid entry + prizes disabled until Nigerian legal advice + Paystack written approval. Feature flags hard-disabled.

## Domain Model (Core)

- Users / Profiles / Sessions
- Running Sessions / GPS Samples / Activities (verified distance)
- Competition Tables (finite contests) / Registrations / Leaderboard Snapshots
- Payment Intents / Events (gated)
- Creator Profiles / Creator Earnings
- Non-withdrawable Wallets / Wallet Transactions
- Ledger (double-entry, integer kobo)

Challenges retain the existing `competition_tables` storage name for migration compatibility, while the public API supports both `/tables` and `/challenges`. Communities similarly retain the existing club tables while supporting both `/clubs` and `/communities`.

Scoring is an immutable challenge rule: `MOST_STEPS`, `FARTHEST_DISTANCE`, `FASTEST_FIXED_DISTANCE`, or `FASTEST_TIME`. Run challenges must explicitly choose farthest-distance or fixed-distance-fastest. Paid challenges snapshot fee basis points when created: 3,000 (30%) normally, or 3,500 (35%) with 500 (5%) accrued to an active creator.

State machines:
- Running: IDLE → RUNNING ↔ PAUSED → PENDING_VERIFICATION → VERIFIED|FLAGGED|REJECTED
- Table: DRAFT → OPEN_FOR_ENTRY → ACTIVE → SCORING_CLOSED → SETTLED
- Payment: INITIATED → SUCCEEDED|FAILED (verified server-side)

## Free MVP Flow

Register → Start Run (GPS) → Submit samples → Backend verifies distance → Join free table → View provisional leaderboard → Settlement.

Paid flow remains behind flags.

Activity verification runs in BullMQ and persists its decision in PostgreSQL. Crediting uses one `INSERT ... SELECT` followed by one aggregate `UPDATE`, avoiding a query-per-table loop. Redis can retry work, but PostgreSQL uniqueness constraints make repeated processing idempotent.

## Next

Phase 1: Clean monorepo structure, Docker Compose (Postgres + Redis), basic auth, migrations.
