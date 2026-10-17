# Phase Status

## Phase 1 — Repository, CI, data and auth
- [x] pnpm workspace
- [x] Docker Compose (Postgres + Redis)
- [x] NestJS + TypeORM
- [x] Auth (register/login with bcrypt + JWT)
- [x] User entity
- [x] Basic CI
- [x] RunningSession + CompetitionTable entities
- [ ] Full migrations
- [ ] Profiles, seed data
- [ ] Frontend fully moved and wired

## Phase 2 — Free tracking vertical slice
- [x] Running session start skeleton
- [ ] GPS sample ingestion + Haversine distance
- [ ] Activity verification
- [ ] Free table join + provisional leaderboard

## Phase 3+ — Clubs, leagues, fraud, payments (gated)
- Designed but not implemented
- Paid contests remain **hard disabled**

See `docs/architecture.md` for full design.
