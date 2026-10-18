# Frontend Handoff

This document is the implementation contract for the Jump frontend. The backend is a NestJS REST API backed by PostgreSQL and Redis/BullMQ. It does not use Supabase.

## Local connection

- Web: `http://localhost:5173`
- API base URL: `http://localhost:9090/v1`
- Swagger: `http://localhost:9090/docs`
- Frontend environment variable: `VITE_API_URL=http://localhost:9090/v1`

Use `VITE_API_URL` everywhere rather than embedding the URL in components.

## Shared API behaviour

Authenticated routes require:

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

Dates are ISO 8601 strings in UTC. Distances are integer metres. Money is integer kobo; format `100000` as `₦1,000.00`, never as `₦100,000`.

Nest validation errors normally have this shape:

```json
{
  "statusCode": 400,
  "message": ["field must be ..."],
  "error": "Bad Request"
}
```

`message` may be either a string or an array. The API client should normalize it to one readable message. Handle status codes as follows:

- `400`: invalid input
- `401`: missing, expired, or revoked session; clear local auth and send the user to login
- `403`: authenticated but not eligible/authorized
- `404`: resource does not exist or does not belong to this user
- `409`: state conflict such as duplicate registration, a full table, or an invalid transition
- `503`: paid competitions or payouts are deliberately disabled by a backend feature gate

## Authentication

### Register

`POST /auth/register`

```json
{
  "email": "runner@example.com",
  "password": "minimum-8-characters",
  "displayName": "Ayo"
}
```

### Login

`POST /auth/login`

```json
{
  "email": "runner@example.com",
  "password": "minimum-8-characters"
}
```

Register and login return:

```json
{
  "access_token": "...",
  "user": {
    "id": "uuid",
    "email": "runner@example.com",
    "displayName": "Ayo"
  }
}
```

Store the token through one central auth module. On app startup call `GET /auth/session`; do not treat the presence of a stored token as proof that it is still valid.

Other auth routes:

- `GET /auth/session` — validate the current session
- `POST /auth/logout` — revoke the current session
- `POST /auth/verify-email` with `{ "token": "..." }`
- `POST /auth/reset-password/request` with `{ "email": "..." }`
- `POST /auth/reset-password/complete` with `{ "token": "...", "password": "..." }`

Development responses can contain verification/reset tokens until the production email provider is connected. Do not design production UI around those development-only fields.

## Profiles

- `GET /me` — current runner profile
- `PATCH /me` — update any subset of the fields below
- `GET /users/:username` — public profile, subject to privacy settings

```json
{
  "username": "ayo_runs",
  "displayName": "Ayo",
  "preferredUnit": "km",
  "activityVisibility": "private",
  "countryCode": "NG"
}
```

Allowed units are `km` and `mi`; visibility is `private`, `followers`, or `public`; country codes are two uppercase letters.

## Run recording

Run states used by the backend include `RUNNING`, `PAUSED`, `PENDING_VERIFICATION`, `VERIFIED`, `FLAGGED`, and `REJECTED`.

1. `POST /runs/start` with `{ "activityType": "walk" }` or `{ "activityType": "run" }`. Omitting the body defaults to `run` for older clients.
2. Upload samples in batches to `POST /runs/:id/samples`.
3. Use `POST /runs/:id/pause` and `POST /runs/:id/resume` as needed.
4. Call `POST /runs/:id/finish` once. It is idempotent and creates an activity.
5. Poll the returned activity via `GET /activities/:id` until verification is no longer pending.

Sample upload body, maximum 500 samples per request:

```json
{
  "samples": [
    {
      "sequence": 1,
      "latitude": 6.5244,
      "longitude": 3.3792,
      "accuracy": 8.5,
      "stepCount": 142,
      "recordedAt": "2026-10-18T09:30:00.000Z"
    }
  ]
}
```

Sequence numbers make uploads idempotent. `stepCount` is an optional session-relative cumulative count and should begin at zero; the backend flags decreasing values and implausible cadence. Buffer samples in IndexedDB and retry the same batches after a connection failure. Do not invent new sequence numbers during a retry. A successful upload returns the current `distanceMetres`, `stepCount`, and `sampleCount`.

`GET /runs/:id` restores a known server-side session. The backend does not yet provide explicit cancel/interrupted-run transitions, so the frontend must not show a destructive “discard server run” action as if it were supported.

Activity routes:

- `GET /activities` — up to 100 activities for the current runner
- `GET /activities/:id` — owned activity detail
- `POST /activities/:id/review-request` with `{ "reason": "..." }` — request review of a flagged/rejected activity

Show recorded distance immediately, but label leaderboard credit as provisional until `verificationStatus` is `VERIFIED`. Surface `verificationReasons` in plain language for flagged activities.

## Competitions

The product calls these **challenges**. The backend keeps `/tables` for compatibility and exposes the same routes under `/challenges`; new frontend code should prefer `/challenges`.

### Discovery and detail

- `GET /tables` — up to 50 open free and approved paid competitions
- `GET /tables/:code` — lookup by invite code
- `GET /tables/:id/standings` — current provisional standings
- `GET /tables/:id/result/final` — latest immutable settled result, or `404` before settlement

A competition includes fields such as:

```json
{
  "id": "uuid",
  "title": "October 50K",
  "code": "A1B2C3D4",
  "type": "free",
  "status": "OPEN_FOR_ENTRY",
  "entryFeeKobo": 0,
  "guaranteedPrizeKobo": null,
  "minimumEntrants": 1,
  "startsAt": "2026-10-18T00:00:00.000Z",
  "entryClosesAt": "2026-10-20T00:00:00.000Z",
  "scoringClosesAt": "2026-10-25T00:00:00.000Z",
  "capacity": 100,
  "distanceCapMetres": 50000
}
```

Additional scoring and fee fields are:

```json
{
  "challengeType": "RUN",
  "scoringMethod": "FASTEST_FIXED_DISTANCE",
  "targetDistanceMetres": 5000,
  "communityId": null,
  "platformFeeBps": 3500,
  "creatorCommissionBps": 500
}
```

Allowed combinations:

- `WALK` → `MOST_STEPS`: highest total verified steps
- `STEP` → `MOST_STEPS`: highest total verified steps
- `DISTANCE` → `FARTHEST_DISTANCE`: highest verified walk/run distance
- `RUN` → `FARTHEST_DISTANCE`: highest verified running distance
- `RUN` → `FASTEST_FIXED_DISTANCE`: lowest valid completion time for `targetDistanceMetres`
- `TIMED` → `FASTEST_TIME`: lowest valid completion time for `targetDistanceMetres`

Fastest formats require `targetDistanceMetres`. Standings now include `creditedSteps` and `completionTimeSeconds` alongside `creditedDistanceMetres`; render the field matching `scoringMethod`.

Use `type` to choose the entry flow. Do not infer free versus paid from display text.

### Create a free competition

`POST /tables`

```json
{
  "title": "Weekend 10K",
  "startsAt": "2026-10-24T06:00:00.000Z",
  "entryClosesAt": "2026-10-24T05:30:00.000Z",
  "scoringClosesAt": "2026-10-25T18:00:00.000Z",
  "capacity": 100,
  "distanceCapMetres": 10000
}
```

Only `title` is required. Capacity must be 2–10,000 and distance cap 1,000–500,000 metres when supplied.

Join a free competition with `POST /tables/:id/register-free`. A `409` should become useful UI copy: already joined, closed, or full.

### Standings

`GET /tables/:id/standings` returns:

```json
[
  {
    "rank": 1,
    "userId": "uuid",
    "displayName": "Runner",
    "creditedDistanceMetres": 12450
  }
]
```

Verified activities are credited automatically. Ranking follows the challenge's `scoringMethod`; ties then use join time and user ID deterministically. Label this view “Provisional” until a final result exists.

## Paid competition checkout

Paid features fail closed and may return `503` while disabled. The frontend should show a clear unavailable message rather than retrying indefinitely.

1. Require a signed-in, email-verified user.
2. Call `POST /tables/:id/checkout`.
3. Save the returned `reference` locally before navigation.
4. Navigate the browser to `authorizationUrl`.
5. When the user returns to the app—or reopens it—poll `GET /payments/:reference/status`.
6. Treat only `SUCCEEDED` as a successful entry. The backend creates the table registration atomically after verifying the transaction with Paystack.

Checkout response:

```json
{
  "authorizationUrl": "https://checkout.paystack.com/...",
  "accessCode": "...",
  "reference": "jump-..."
}
```

Status response:

```json
{
  "reference": "jump-...",
  "status": "PENDING",
  "amountKobo": 250000,
  "currency": "NGN"
}
```

Statuses the UI must tolerate include `INITIATED`, `PENDING`, `SUCCEEDED`, `FAILED`, `REFUND_PENDING`, and `RECONCILIATION_REQUIRED`. Refund processing may also be reflected after the competition becomes unavailable/full. Keep pending states recoverable across refreshes.

There is intentionally no per-request `callback_url`. A redirect only controls browser navigation and cannot prove payment. Webhooks plus server-side verification are authoritative. If the Paystack dashboard has a default callback URL, it may point to a lightweight frontend return page; that page should read the locally saved reference and poll status. Without a configured redirect, the user can return to the app and the same recovery flow still works.

The Paystack webhook is backend-only: `POST /v1/webhooks/paystack`. Never call it from the frontend and never expose `PAYSTACK_SECRET_KEY` in Vite variables.

### Fee display

All money is integer kobo. `platformFeeBps` is the total amount deducted from the gross winnings:

- Ordinary paid challenge: 3,000 basis points = 30% total fee; winner receives 70%.
- Active creator challenge: 3,500 basis points = 35% total fee; winner receives 65%, the creator earns 5%, and Jump retains the base 30%.

Show gross winnings, total fee, creator commission where applicable, and net winner amount before checkout. Never label the gross amount as the amount the winner receives.

## Creator accounts

Creator enrollment is a second step after ordinary account registration:

- `POST /creators/signup`
- `GET /creators/me`
- `GET /creators/me/earnings`
- `POST /creators/me/earnings/:earningId/payout`
- `POST /challenges/paid-drafts`

Signup body:

```json
{
  "creatorType": "influencer",
  "displayName": "Ayo Runs",
  "socialUrl": "https://example.com/ayo",
  "bio": "Weekly Lagos running challenges"
}
```

`creatorType` is `influencer`, `community_manager`, `run_club`, or `other`. A creator challenge is saved as `PENDING_APPROVAL`; creator status does not bypass financial, legal, or admin approval gates. Creator earnings are accrued only when an approved paid challenge settles. A creator uses the same tokenized payout recipient endpoint as a winner, requests payout for one earning, and then waits for the same two-administrator approval/execution flow.

## Wallet

- `GET /wallet` — balance plus `withdrawable: false`
- `GET /wallet/transactions` — latest 100 immutable transactions
- `POST /wallet/fund` with `{ "amountKobo": 100000 }` — Paystack hosted funding flow
- `POST /challenges/:id/enter-wallet` — atomically deduct entry fee and register

Wallet funding returns the same `authorizationUrl`, `accessCode`, and `reference` shape as challenge checkout. Save and poll that reference through `GET /payments/:reference/status`.

Wallet funds cannot be withdrawn or transferred back by the user. Do not render a withdrawal button. Merchant-initiated refunds required for failed/cancelled services are a separate operation and must not be described as wallet withdrawal.

## Rewards and payouts

- `GET /me/rewards` — list the runner's prize awards
- `POST /me/payout-recipient` — create or replace payout bank details
- `POST /me/rewards/:awardId/payout` — request payment for an eligible award

Recipient body:

```json
{
  "accountName": "Ayo Example",
  "accountNumber": "0123456789",
  "bankCode": "058",
  "password": "the-user-current-password"
}
```

The API response only exposes the account name, bank code, last four digits, and `availableForPayoutAt`. Do not retain the complete account number or password after submission. Replacing an existing recipient creates a 24-hour payout hold and a security notification. Payouts require separate backend enablement and two different administrators to approve and execute.

## Clubs, leagues, and notifications

Clubs:

- `POST /clubs` with `{ "name": "...", "slug": "lowercase-slug" }`
- `GET /clubs/:id`
- `GET /clubs/:id/members`
- `POST /clubs/:id/members` with `{ "userId": "uuid" }`

New frontend code may use `/communities` instead of `/clubs`; both paths currently map to the same backend service. Any authenticated user may create one. Challenge creation accepts an optional `communityId`, but the creator must be that community's owner or admin.

Leagues:

- `GET /leagues`
- `GET /leagues/me`
- `GET /leagues/:id/standings`

Notifications:

- `GET /notifications` — newest 100 for the current user
- `PATCH /notifications/:id/read` — returns `{ "success": true }`

Club invitations and complete promotion/relegation finalization are not implemented yet. Do not build UI that implies those operations already exist.

## Admin-only routes

Both `admin` and `compliance` roles may use review, settlement, draft, and eligibility routes:

- `GET /admin/verification/reviews`
- `PATCH /admin/verification/reviews/:id`
- `PATCH /admin/settlements` with `{ "tableId": "uuid" }`
- `POST /admin/tables/paid-drafts`
- `PATCH /admin/users/:id/eligibility` with `{ "adultVerified": true, "paidCompetitionEligible": true, "countryCode": "NG" }`

The following financial-control routes require the `admin` role specifically:

- `POST /admin/tables/:id/approve-paid`
- `POST /admin/payouts/:id/approve` with `{ "password": "current-admin-password" }`
- `POST /admin/payouts/:id/execute` with `{ "password": "current-admin-password" }`
- `POST /admin/payments/reconciliation` with `{ "password": "current-admin-password" }`

Paid tables are created as `PENDING_APPROVAL`. Approval requires both `{ "fundingConfirmed": true, "rulesApproved": true }`. Payout approval and execution must be performed by different administrators, and each administrator must confirm their password.

Paid checkout, wallet funding/entry, recipient creation, and payout requests return `403` until an operator has recorded both adult verification and paid-competition eligibility. A challenge creator cannot enter or win their own paid challenge.

## Suggested frontend routes

- `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`
- `/dashboard`
- `/run`, `/runs/:id`, `/activities`, `/activities/:id`
- `/competitions`, `/competitions/new`, `/competitions/:code`
- `/payments/return`, `/rewards`, `/settings/profile`, `/notifications`
- `/clubs/:id`, `/leagues`, `/leagues/:id`
- `/admin/reviews`, `/admin/competitions`, `/admin/payouts`

## Query and mutation rules

Suggested TanStack Query keys:

```text
['session']
['profile', 'me']
['activities']
['activity', activityId]
['tables']
['table', code]
['standings', tableId]
['payment', reference]
['rewards']
['notifications']
```

Invalidate `['tables']` after creating a table, `['standings', tableId]` after entry or verified activity credit, `['payment', reference]` while checkout is pending, and `['rewards']` after requesting a payout. Stop payment polling on a terminal state, but leave `RECONCILIATION_REQUIRED` visible with support-oriented copy.

## Known backend work that must not be hidden by UI

- Production email delivery is not connected.
- Interrupted/cancelled run transitions are not implemented.
- Club invitations and complete league promotion/relegation are not implemented.
- Broader admin appeals, exports, account deletion, and retention jobs remain.
- The merchant must still exercise and sign off the complete Paystack sandbox journey.
- Production financial features require written legal/provider approval and flags that default to off.
- Production observability, rate limiting, deployment artifacts, and broader integration/E2E tests remain.

These are backend readiness items, not frontend tasks. The frontend should handle disabled and unavailable states honestly rather than simulating success.
