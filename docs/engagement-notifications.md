# Engagement notifications: first release

## Architecture and compatibility

The existing BullMQ push queue evaluates inbox visibility and dispatches Expo push notifications. The existing email queue and ZeptoMail/SMTP service remain the mail transport. Existing host reminder emails pass notification context to that same mail service. There is one worker per existing queue; the new evaluator is an injected service, not a second competing BullMQ worker. No new provider, broker, AI service or native dependency is added.

`EngagementService` is the shared optional-notification gate for push, email and new in-app inbox entries. All existing SQL notification producers feed the same inbox/delivery path. Unknown notification types are optional by default. The explicit operational allowlist covers payments/prizes, KYC, registered-event operations, account moderation, direct/group chat delivery and joined-duel operations. Chat **email** remains optional and respects the old email opt-out. Password resets, verification, sign-in codes, welcome messages, user-requested invitation emails, purchased event passes and registered-event emails keep their existing transactional mail paths.

The migration marks existing inbox history visible. New entries wait for evaluation (normally at most five seconds). Policy suppression hides optional entries, but never deletes domain data or changes competition enrollment, activity verification, scoring, authentication or payments. The monthly club leaderboard API is preserved.

## Policy

- Optional push: at most **2 per user/local calendar day**. Engagement email: at most **3 per user/local calendar week**, Monday start. Admin can adjust limits from 0 to 10. Essential operations bypass these caps.
- Category preferences independently cover phone push, email and in-app updates for competitions/leaderboards, clubs, personal achievements, recommended competitions, weekly summaries and social activity. Existing email activity/digest opt-outs are also honored.
- Quiet hours default to 21:00–08:00 in the saved IANA time zone. Equal start/end disables quiet hours. Missing/invalid zone suppresses optional delivery. Updated clients initialize the zone on a foreground return; an explicitly saved zone is not overwritten. Users can change it in notification settings after travel.
- Quiet-hours, expired, irrelevant and disabled notifications are **suppressed**, not queued for a later burst. Push normally expires after 30 minutes; explicit deadline/recap expiries override that default. Competition availability/status is checked again at delivery.
- Existing generic “standings updated” alerts are suppressed as insignificant. Legacy standing boosts cannot run without trustworthy synchronization evidence. Generic streak/digest schedules default off and can be independently controlled.
- One event fingerprint across channels prevents duplicate engagement. An available opted-in phone is preferred for ordinary timely updates; weekly recaps select email. An existing external-channel reservation blocks the same event on the other channel. In-app visibility is independent of external-channel caps.
- PostgreSQL per-user advisory transaction locks serialize duplicate and cap checks. Unique ledger keys enforce event/channel idempotency. Reservations count against limits even if delivery later fails, keeping limits conservative.
- Expo HTTP 429 / explicit device rate-limit rejections can retry up to three attempts, rechecking policy and freshness. A timeout/ambiguous acceptance is recorded as uncertain and never blindly resent. Operational push retries retain their previous behavior. Optional email does not fall back to SMTP after ambiguous ZeptoMail acceptance; existing transactional fallback is preserved.
- Expo tickets and later receipts distinguish accepted from handed to APNs/FCM. Expired device tokens are removed. Receipt failures are visible; device invalidation is a signal, not proof of uninstall. Email is tracked as provider-accepted, not confirmed inbox delivery or open.

## New triggers and verified data

All new triggers require **newTriggersEnabled**, an explicit per-trigger flag, and membership in the configured rollout percentage. Defaults: new triggers disabled, rollout 0%, every trigger off. The independently hashed 10% holdout applies to eligible users in the rollout; holdout users receive none of the new engagement, including inbox entries. Existing operational messages are unaffected. Freeze rollout and holdout allocation during measurement.

1. **Weekly recap:** once per local calendar week for users with verified recorded movement or relevant club activity last week. Email combines personal verified walks/runs, sensor-measured steps, and club totals. Club totals are aggregated once per club per batch over the last completed Monday–Sunday UTC week. No admin-created competition is needed. Club opt-outs remove club content. Empty generic summaries are skipped. Sessions are described as logged/verified activity, never total daily movement.
2. **Weekly goal achieved:** once per local week, using the user's existing explicit distance goal and verified eligible walks/runs only. A qualifying activity must have finished within 30 minutes. No full-day step goals are inferred from incomplete session history.
3. **Joined competition deadlines:** starting/ending within an hour, with explicit expiry at the relevant deadline and a direct competition link. Current status/window is rechecked before delivery.
4. **Weekly club leaderboard:** additive `/clubs/:id/weekly-leaderboard`, available to members, computed from verified walks/runs within the current UTC week. Mobile/web offer weekly and monthly views. This is activity aggregation, not a new competition or automatic enrollment.
5. **Results, prizes and events:** existing finalized podium/result, reward/payout and registered-event producers are reused. Optional results use the common gate; financial and registered-event operations retain essential delivery.

**Competitive proximity remains unavailable, even if an administrator tries to enable it.** Existing activity `createdAt`, `finishedAt` and registration `scoredAt` do not prove that either user's device has synchronized all eligible activity. Pending and flagged records can contribute to existing product scores, so those scores cannot be presented as verified rankings. A future proximity implementation must establish trustworthy synchronization watermarks and use verified eligible competition credits, original scoring/tie rules, attainable gaps and opponent cooldowns. No speculative ranking claim ships here.

No attempt is made to keep phones synchronizing in the background. This respects existing iOS/Android restrictions and leaves step recording unchanged. Browser push is outside this release.

## Controls and measurement

User settings: existing profile notification/email sheet on iOS, Android and web. Admin console: **Notifications** (admin role and admin JWT scope required). APIs:

- `GET/PATCH /notifications/preferences`
- `POST /notifications/context` (initial time zone + foreground return; never a sync claim)
- `POST /notifications/:id/click` (authenticated owner only)
- `GET/PATCH /admin/notifications/settings`
- `GET /admin/notifications/performance`

Settings changes are audited. Delivery ledger records triggered, reserved, suppressed with reasons, sent/provider accepted, delivered where supported, failed and uncertain outcomes. Clients record foreground returns and notification/deep-link clicks. Preference opt-outs are recorded on true-to-false transitions. D1/D7/D30 reports compare eligible assigned cohorts, including failed attempts, with only matured return windows in denominators. Verified activity and competition joins after returning are derived from domain tables. Email links retain a notification ID for click attribution after authenticated navigation.

These are measurement primitives, not a claim of incremental retention. Old clients undercount returns and clicks; email delivery/open and confirmed uninstall are unavailable. Compare randomized cohorts after enough users and matured windows accumulate. Keep account/payment/operational notifications out of experimental suppression.

## Validation and production enablement

1. Run API build, lint and tests; web/admin typechecks and builds; shared/mobile typechecks. Use the repository's Node 22 and pnpm 9 versions in CI. Local validation also exercised SQL in an isolated PostgreSQL-compatible engine. To repeat against actual staging PostgreSQL after building the API, run `TEST_DATABASE_URL=... node scripts/check-engagement.cjs`; it creates and drops only its own disposable schema.
2. Apply migration `1793448000000-EngagementPolicy` **before** deploying code. Confirm existing Redis/BullMQ workers and Expo/ZeptoMail credentials. Keep `newTriggersEnabled=false`, `rolloutPercent=0` and all new trigger flags false.
3. Validate on staging with real iOS and Android release/development builds: denied/granted notification permission, token registration/expiry, background/foreground/cold-start taps, correct destinations and opt-outs. Validate verified/pending/flagged activity, weekly boundaries/DST, quiet hours, retries, holdouts and quiet-hours suppression. Verify security, payout and registered-event mail with optional delivery disabled. Do not send staging tests to real production users.
4. Verify the migration/recovery behavior with real PostgreSQL concurrency and existing production-like data volumes. Review the operational type allowlist with product owners. Confirm time zones have been initialized for the intended cohort and older clients fail closed only for optional engagement.
5. For a canary, enable the master new-trigger flag, only the selected trigger(s), and a small rollout (for example 5%). Keep a stable 10% holdout within it. Never enable proximity under the current data model. Monitor failure/uncertain outcomes, suppression reasons, device invalidations and opt-out changes; compare matured retention and activity/participation outcomes before expanding.
6. Roll back new engagement by setting `newTriggersEnabled=false` or rollout to zero. Per-trigger switches stop already queued new notifications at delivery as well as generation. `deliveryEnabled=false` stops **all optional** notifications; essential operations continue. Do not revert the migration while this code is deployed.

This change does not deploy, migrate production, send test messages, or enable new engagement. Real-device/provider delivery and live retention impact require staging/production validation.
