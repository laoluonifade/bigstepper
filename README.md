# Jump

A pnpm monorepo for a mobile-first activity challenge platform. The current foundation uses a NestJS modular monolith, PostgreSQL as canonical storage, Redis/BullMQ for background jobs, and a React/Vite web app.

Supabase is not used. Paid contests and Paystack live operations remain disabled until the legal and provider approvals described in the engineering specification are complete.

Jump supports walk, run, distance, step, and timed challenges. Any signed-in user can start a community. Users who open a creator account can submit paid challenge drafts and earn a fixed 5% commission after an approved creator challenge settles. The total deduction from winnings is 30% for ordinary paid challenges and 35% for creator challenges; the extra 5% funds the creator commission.

Wallet deposits and direct platform payments are not user-withdrawable. This does not remove Jump's ability to issue required merchant refunds when an entry cannot be fulfilled, a challenge is cancelled, or law/provider rules require a reversal.

## Structure

```text
apps/
  api/  NestJS REST API, TypeORM migrations, Redis and BullMQ
  web/  React, Vite, TanStack Router and TanStack Query
docs/
docker-compose.yml
```

## Run locally with Homebrew

Requirements: Node.js 20+, pnpm 9, Homebrew, PostgreSQL, and Redis.

```bash
brew install postgresql@14 redis
brew services start postgresql@14
brew services start redis

# First-time database setup
psql postgres -c "CREATE ROLE jump WITH LOGIN PASSWORD 'jump';"
psql postgres -c "CREATE DATABASE jump OWNER jump;"

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm install
pnpm db:migrate
pnpm dev
```

Check the local services with `brew services list`, `psql --version`, and `redis-cli ping`. The development password is only for your local machine; use managed secrets and a strong unique password outside development.

The API uses single connection strings rather than separate host, port, and credential variables:

```dotenv
DATABASE_URL=postgresql://jump:jump@localhost:5432/jump
REDIS_URL=redis://localhost:6379
```

The web app runs at `http://localhost:5177`, the API at `http://localhost:9090/v1`, and Swagger at `http://localhost:9090/docs`.

## Useful commands

```bash
pnpm build
pnpm lint
pnpm test
pnpm db:migrate
pnpm db:revert
```

Database schema changes must be migrations; TypeORM `synchronize` is intentionally disabled in every environment.

`docker-compose.yml` remains available as an optional isolated setup, but Homebrew services are the default local workflow.

## Paystack safety gates

Payment code is present but fails closed by default. One setting controls it:

```dotenv
PAYMENTS_MODE=off            # off | test | live
PAYSTACK_SECRET_KEY=sk_test_...
```

- `off` (default): paid competitions, payouts and webhooks are disabled.
- `test`: Paystack sandbox. Requires an `sk_test_` key and refuses to start in production.
- `live`: real money. Requires `NODE_ENV=production` and an `sk_live_` key. Setting it is your confirmation that legal and Paystack approvals are in place.

Never commit the secret key. Configure `POST /v1/webhooks/paystack` as the webhook URL in the Paystack dashboard when testing through a public HTTPS tunnel or deployed test environment. Checkout initialization intentionally does not send a per-request `callback_url`; payment completion is established by webhook processing and server-side transaction verification, not by a browser redirect.
