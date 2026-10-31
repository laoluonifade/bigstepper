import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  Candidate,
  Channel,
  category,
  cohort,
  DEFAULT_PREFERENCES,
  DEFAULT_SETTINGS,
  isEssential,
  localWindow,
  Preferences,
  reasonFor,
  Settings,
  validZone,
} from './engagement-policy';

@Injectable()
export class EngagementService {
  constructor(private readonly db: DataSource) {}
  async settings(): Promise<Settings> {
    const [row] = await this.db.query(`SELECT value FROM notification_settings WHERE id=true`);
    return { ...DEFAULT_SETTINGS, ...row?.value, triggers: { ...DEFAULT_SETTINGS.triggers, ...row?.value?.triggers } };
  }
  async preferences(userId: string): Promise<Preferences> {
    const [row] = await this.db.query(`SELECT value FROM notification_preferences WHERE "userId"=$1`, [userId]);
    return { ...DEFAULT_PREFERENCES, ...row?.value, categories: row?.value?.categories ?? {} };
  }
  // Serialize all optional reservations for a user, including across workers/channels. Reservations count toward caps,
  // even if transport fails: ambiguous provider acceptance must never lead to an automatic duplicate send.
  async reserve(c: Candidate, channel: Channel): Promise<{ allowed: boolean; id?: string; reason?: string }> {
    if (isEssential(c.type, channel)) return { allowed: true };
    return this.db.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`notifications:${c.userId}`]);
      const [existing] = await m.query(
        `SELECT id,status,reason,attempts,"sourceId" FROM notification_deliveries WHERE "userId"=$1 AND "eventKey"=$2 AND channel=$3`,
        [c.userId, c.key, channel],
      );
      const retryable = existing?.status === 'failed' && existing.reason === 'retryable' && existing.attempts < 3;
      if (existing && !retryable)
        return channel === 'inapp' && existing.sourceId === c.sourceId
          ? {
              allowed: existing.status !== 'suppressed',
              id: existing.id,
              reason: existing.status === 'suppressed' ? 'suppressed' : undefined,
            }
          : { allowed: false, reason: 'duplicate' };
      const [row] = await m.query(
        `SELECT u."deletedAt",u."emailVerified",p."emailActivityEnabled",p."emailDigestEnabled",np.value,
        EXISTS(SELECT 1 FROM push_tokens t WHERE t."userId"=u.id) AS "hasPush"
        FROM users u LEFT JOIN profiles p ON p."userId"=u.id LEFT JOIN notification_preferences np ON np."userId"=u.id WHERE u.id=$1`,
        [c.userId],
      );
      const [setting] = await m.query(`SELECT value FROM notification_settings WHERE id=true`);
      const s: Settings = {
        ...DEFAULT_SETTINGS,
        ...setting?.value,
        triggers: { ...DEFAULT_SETTINGS.triggers, ...setting?.value?.triggers },
      };
      const p: Preferences = { ...DEFAULT_PREFERENCES, ...row?.value, categories: row?.value?.categories ?? {} };
      const now = new Date();
      const window = validZone(p.timeZone) ? localWindow(now, p.timeZone) : { day: null, week: null };
      let reason =
        !row || row.deletedAt
          ? 'user_unavailable'
          : reasonFor(
              c,
              channel,
              p,
              s,
              now,
              c.type === 'COMPETITION_DIGEST' ? row.emailDigestEnabled !== false : row.emailActivityEnabled !== false,
            );
      const competitionCode = c.link?.match(/^\/competitions\/([A-Za-z0-9_-]+)/)?.[1];
      if (!reason && competitionCode) {
        const [competition] = await m.query(
          `SELECT status,"startsAt","scoringClosesAt" FROM competition_tables WHERE code=$1 AND "deletedAt" IS NULL AND "archivedAt" IS NULL`,
          [competitionCode],
        );
        if (!competition) reason = 'competition_unavailable';
        else if (
          c.type === 'COMPETITION_STARTING' &&
          (!['OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED'].includes(competition.status) ||
            !competition.startsAt ||
            new Date(competition.startsAt) <= now)
        )
          reason = 'competition_status';
        else if (
          c.type === 'COMPETITION_ENDING' &&
          (!['OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED'].includes(competition.status) ||
            !competition.scoringClosesAt ||
            new Date(competition.scoringClosesAt) <= now)
        )
          reason = 'competition_status';
      }
      if (!reason && channel === 'email' && !row.emailVerified) reason = 'unverified_email';
      if (!reason && channel === 'push' && !row.hasPush) reason = 'no_device';
      if (
        !reason &&
        channel === 'email' &&
        c.onlyChannel !== 'email' &&
        row.hasPush &&
        p.categories[category(c.type)]?.push !== false &&
        s.pushDaily > 0
      )
        reason = 'push_preferred';
      if (!reason && channel !== 'inapp') {
        const [other] = await m.query(
          `SELECT id FROM notification_deliveries WHERE "userId"=$1 AND "eventKey"=$2 AND channel<>$3 AND channel<>'inapp' AND status<>'suppressed'`,
          [c.userId, c.key, channel],
        );
        if (other) reason = 'other_channel';
        const [counts] = await m.query(
          `SELECT count(*) FILTER (WHERE channel='push' AND "localDay"=$2::date)::int AS push,
          count(*) FILTER (WHERE channel='email' AND "localWeek"=$3::date)::int AS email
          FROM notification_deliveries WHERE "userId"=$1 AND status<>'suppressed' AND "createdAt">now()-interval '8 days'`,
          [c.userId, window.day, window.week],
        );
        if (
          !reason &&
          (!retryable || (channel === 'push' ? s.pushDaily : s.emailWeekly) === 0) &&
          (channel === 'push' ? counts.push >= s.pushDaily : counts.email >= s.emailWeekly)
        )
          reason = 'frequency_limit';
      }
      if (!reason && c.newTrigger && cohort(c.userId, s.holdoutPercent) === 'holdout') reason = 'holdout';
      if (retryable) {
        await m.query(
          `UPDATE notification_deliveries SET status=$2,reason=$3,attempts=attempts+1,"updatedAt"=now() WHERE id=$1`,
          [existing.id, reason ? 'suppressed' : 'reserved', reason],
        );
        return { allowed: !reason, id: existing.id, reason: reason ?? undefined };
      }
      const [delivery] = await m.query(
        `INSERT INTO notification_deliveries("userId","eventKey",type,channel,status,reason,cohort,"localDay","localWeek","sourceId")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          c.userId,
          c.key,
          c.type,
          channel,
          reason ? 'suppressed' : 'reserved',
          reason,
          cohort(c.userId, s.holdoutPercent),
          window.day,
          window.week,
          c.sourceId ?? null,
        ],
      );
      await m.query(
        `INSERT INTO notification_events("userId","deliveryId",kind) VALUES ($1,$2,'triggered'),($1,$2,$3)`,
        [c.userId, delivery.id, reason ? 'suppressed' : 'reserved'],
      );
      return { allowed: !reason, id: delivery.id, reason: reason ?? undefined };
    });
  }
  async finish(id: string | undefined, status: 'sent' | 'failed' | 'uncertain' | 'delivered', reason?: string) {
    if (!id) return;
    await this.db.query(
      `WITH changed AS (UPDATE notification_deliveries SET status=$2,reason=$3,"updatedAt"=now() WHERE id=$1 AND status<>$2 RETURNING "userId")
      INSERT INTO notification_events("userId","deliveryId",kind) SELECT "userId",$1,$2 FROM changed`,
      [id, status, reason ?? null],
    );
  }
  async event(userId: string, kind: string, dedupeKey: string, deliveryId?: string) {
    await this.db.query(
      `INSERT INTO notification_events("userId","deliveryId",kind,"dedupeKey") VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [userId, deliveryId ?? null, kind, dedupeKey],
    );
  }
}
