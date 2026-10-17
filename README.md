# Big Stepper

Walk more. Climb higher.

A mobile-first Progressive Web App for walking and running challenges.

## Monorepo Structure

```
/
├── apps/
│   ├── web/          # React + Vite frontend (PWA)
│   └── api/          # NestJS backend
├── packages/
│   └── shared/       # Shared types (optional)
├── docker-compose.yml  # Postgres for local development
└── README.md
```

## Tech Stack

- **Frontend** (`apps/web`): React 18 + Vite + TypeScript + Tailwind CSS + PWA
- **Backend** (`apps/api`): NestJS + TypeORM (or Prisma) + PostgreSQL
- **Database**: PostgreSQL (local via Docker, production on Neon/Supabase/Render/Railway free tier)
- **Auth**: JWT (Passport) or session-based in NestJS
- **Payments**: Paystack (test mode)
- **Hosting**: Vercel (frontend) + Render/Railway/Fly.io (backend + Postgres)

## Local Development

```bash
# Start Postgres
docker compose up -d

# Backend
cd apps/api
npm install
npm run start:dev

# Frontend
cd apps/web
npm install
npm run dev
```

## Environment Variables

See `apps/api/.env.example` and `apps/web/.env.example`.

## Status

Restructuring into monorepo. Previous Supabase setup is being migrated to NestJS + Postgres.
