# Architecture Decisions

## Stack (Non-negotiable per spec)

- **Backend**: NestJS modular monolith (TypeScript strict)
- **Database**: PostgreSQL (canonical state) + TypeORM or Prisma
- **Cache/Queues**: Redis + BullMQ
- **Frontend**: React + Vite + TypeScript + TanStack Router/Query + Tailwind + shadcn/ui
- **Payments**: Paystack (gated behind feature flags)
- **Monorepo**: pnpm workspaces

## Why Modular NestJS

Single deployable unit for MVP speed while keeping clear module boundaries (Identity, Running, Tables, Payments, Ledger, etc.). Avoids microservices complexity.

## Risks & Blockers

1. **Web GPS limitations**: Background tracking unreliable in PWAs. Foreground-only with IndexedDB recovery.
2. **Anti-cheat**: Browser GPS cannot prove human activity. Manual review required for any future paid contests.
3. **Compliance**: Paid entry + prizes disabled until Nigerian legal advice + Paystack written approval. Feature flags hard-disabled.

## Domain Model (Core)

- Users / Profiles / Sessions
- Running Sessions / GPS Samples / Activities (verified distance)
- Competition Tables (finite contests) / Registrations / Leaderboard Snapshots
- Payment Intents / Events (gated)
- Ledger (double-entry, integer kobo)

State machines:
- Running: IDLE → RUNNING ↔ PAUSED → COMPLETED → VERIFIED|FLAGGED
- Table: DRAFT → OPEN_FOR_ENTRY → ACTIVE → SCORING_CLOSED → SETTLED
- Payment: INITIATED → SUCCEEDED|FAILED (verified server-side)

## Free MVP Flow

Register → Start Run (GPS) → Submit samples → Backend verifies distance → Join free table → View provisional leaderboard → Settlement.

Paid flow remains behind flags.

## Next

Phase 1: Clean monorepo structure, Docker Compose (Postgres + Redis), basic auth, migrations.
