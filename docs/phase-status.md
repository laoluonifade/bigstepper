# Phase Status

## Phase 1 — Repository, CI, data and auth
- [x] pnpm workspace
- [x] Docker Compose (Postgres + Redis)
- [x] NestJS + TypeORM
- [x] Auth (register/login with bcrypt + JWT)
- [x] User, RunningSession, GpsSample, CompetitionTable, TableRegistration entities
- [x] Basic CI
- [ ] Full migrations, profiles, seed data
- [ ] Frontend fully moved and wired

## Phase 2 — Free tracking vertical slice
- [x] Start run session
- [x] GPS sample ingestion (`POST /runs/:id/samples`)
- [x] Haversine distance calculation and persistence
- [x] Finish session
- [x] Free table creation
- [x] Free registration
- [x] Provisional standings endpoint
- [ ] Frontend GPS capture + recovery
- [ ] Credit distance to table registration
- [ ] Basic UI for live run and leaderboard

## Phase 3+ — Clubs, leagues, fraud, payments (gated)
- Designed but not implemented
- Paid contests remain **hard disabled**

See `docs/architecture.md`.
