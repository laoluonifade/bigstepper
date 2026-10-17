# Big Stepper

Walk more. Climb higher.

Competitive running platform (Nigeria first). Free tracking and free tables available. Paid contests hard-gated pending legal and Paystack approval.

## Monorepo (pnpm)

```
apps/
  api/     # NestJS modular monolith
  web/     # React + Vite + TanStack
docs/
  architecture.md
docker-compose.yml  # Postgres + Redis
```

## Phase 1 Status (Repository, CI, data and auth)

- [x] pnpm workspace + docker-compose (Postgres + Redis)
- [x] NestJS API skeleton with TypeORM
- [x] Auth module skeleton (register/login endpoints)
- [x] User entity
- [x] Basic GitHub Actions CI
- [ ] Full migrations, password hashing, JWT/session, profiles, seed data
- [ ] Frontend moved and wired to API

## Local Development

```bash
# Start services
docker compose up -d

# Install
pnpm install

# API
pnpm dev:api

# Web (after moving files)
pnpm dev:web
```

See `docs/architecture.md` for full decisions and risks.

**Paid contests remain disabled.**
