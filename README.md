# Big Stepper

Walk more. Climb higher.

A mobile-first Progressive Web App (PWA) for creating and joining walking and running challenges. Discover public challenges, pay to enter via Paystack, track activity, compete on leaderboards, and (when configured) receive winner payouts.

## Tech Stack (Free-tier friendly)

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS
- **Backend / DB / Auth**: Supabase (PostgreSQL + Auth + Edge Functions)
- **Payments**: Paystack Checkout (test mode by default)
- **PWA**: Vite PWA plugin / manual manifest + service worker
- **Hosting**: Vercel or Netlify (free tier) for frontend; Supabase free tier for backend

## Same-day MVP Scope

Prioritized implementation order:

1. Auth (Supabase) + profiles
2. Public challenge discovery + short shareable links
3. Challenge creation (public/private)
4. Join challenges (with invitation context preservation)
5. Manual step / activity submission + leaderboard
6. PWA installable shell
7. Paystack test-mode payments + backend verification
8. Basic payout data model (disabled until regulatory approval)

GPS continuous tracking is a later stage due to PWA background limitations.

## Environment Variables

Create a `.env` file (never commit secrets):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PAYSTACK_PUBLIC_KEY=pk_test_...
# Secret key goes only in Supabase Edge Function secrets or server env
```

## Database Schema (Supabase)

Run the SQL in `/supabase/migrations/001_init.sql` (or via Supabase dashboard).

Key tables: profiles, challenges, participants, activities, payments, payouts, join_events.

Row Level Security (RLS) policies are included.

## Local Development

```bash
npm install
npm run dev
```

## Deployment

1. Push this repo to GitHub (already done).
2. Connect to Vercel: import the repo, set env vars, deploy.
3. Configure Supabase Auth redirect URLs to your Vercel domain.
4. Deploy Edge Functions for Paystack verification if using them.
5. Test the full flow with Paystack test cards.

## Regulatory Note

Real-money prize payouts are **disabled by default**. Enabling them requires:
- Legal/regulatory clearance for competitions in Nigeria
- Paystack Transfer API access and recipient verification
- Proper fee disclosure and ledger

See `/docs/payouts.md` for details.

## Status

This is a functional MVP foundation. Core flows (auth, discover, create, join, manual activity, leaderboard, test payments) are implemented. Continuous GPS is experimental.
