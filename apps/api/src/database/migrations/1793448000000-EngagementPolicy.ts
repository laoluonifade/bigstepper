import { MigrationInterface, QueryRunner } from 'typeorm';

export class EngagementPolicy1793448000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE challenge_reminder_deliveries ADD "suppressedAt" timestamptz`);
    await q.query(
      `CREATE TABLE notification_settings (id boolean PRIMARY KEY DEFAULT true CHECK(id), value jsonb NOT NULL, "updatedBy" uuid REFERENCES users(id) ON DELETE SET NULL, "updatedAt" timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(
      `INSERT INTO notification_settings(value) VALUES ('{"deliveryEnabled":true,"newTriggersEnabled":false,"pushDaily":2,"emailWeekly":3,"rolloutPercent":0,"holdoutPercent":10,"triggers":{"weeklyRecap":false,"weeklyGoal":false,"deadlines":false,"proximity":false,"streak":false,"digest":false}}')`,
    );
    await q.query(
      `CREATE TABLE notification_preferences ("userId" uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, value jsonb NOT NULL DEFAULT '{}', "updatedAt" timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(
      `ALTER TABLE notifications ADD "engagementKey" text, ADD "engagementChannel" text, ADD "engagementExpiresAt" timestamptz, ADD "inappAllowed" boolean`,
    );
    await q.query(`UPDATE notifications SET "inappAllowed"=true`);
    await q.query(
      `CREATE UNIQUE INDEX notification_engagement_key ON notifications("userId","engagementKey") WHERE "engagementKey" IS NOT NULL`,
    );
    await q.query(`CREATE INDEX notification_inapp_pending ON notifications("createdAt") WHERE "inappAllowed" IS NULL`);
    await q.query(`CREATE TABLE notification_deliveries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "sourceId" uuid, "eventKey" text NOT NULL, type text NOT NULL, channel text NOT NULL CHECK(channel IN ('push','email','inapp')),
      attempts integer NOT NULL DEFAULT 1, status text NOT NULL, reason text, cohort text NOT NULL, "localDay" date, "localWeek" date,
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
      UNIQUE("userId","eventKey",channel))`);
    await q.query(
      `CREATE INDEX notification_budget ON notification_deliveries("userId",channel,"localDay","localWeek") WHERE status <> 'suppressed'`,
    );
    await q.query(`CREATE TABLE notification_events (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "deliveryId" uuid REFERENCES notification_deliveries(id) ON DELETE CASCADE, kind text NOT NULL,
      "dedupeKey" text, "createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE("userId","dedupeKey"))`);
    await q.query(`CREATE INDEX notification_events_user_time ON notification_events("userId","createdAt")`);
    await q.query(`CREATE TABLE notification_push_receipts (
      id text PRIMARY KEY, "notificationId" uuid REFERENCES notifications(id) ON DELETE CASCADE,
      "deliveryId" uuid REFERENCES notification_deliveries(id) ON DELETE CASCADE, token text NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(), "checkedAt" timestamptz, status text NOT NULL DEFAULT 'accepted')`);
    await q.query(
      `CREATE TABLE notification_settings_audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, "actorId" uuid REFERENCES users(id) ON DELETE SET NULL, value jsonb NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now())`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE challenge_reminder_deliveries DROP "suppressedAt"`);
    await q.query(
      `DROP TABLE notification_settings_audit, notification_push_receipts, notification_events, notification_deliveries, notification_preferences, notification_settings`,
    );
    await q.query(`DROP INDEX notification_engagement_key; DROP INDEX notification_inapp_pending`);
    await q.query(
      `ALTER TABLE notifications DROP "engagementKey", DROP "engagementChannel", DROP "engagementExpiresAt", DROP "inappAllowed"`,
    );
  }
}
