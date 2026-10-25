import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { PUSH_NOTIFICATIONS_QUEUE } from '../jobs/jobs.module';
import { RANK_ORDER } from '../tables/scoring-engine';
import { boostMessage, pickBoosts, StandingRow } from './standing-boost';

type Pending = { id: string; userId: string; type: string; title: string; body: string; link: string | null; createdAt: Date; readAt?: Date | null };
type ExpoMessage = { to: string; title: string; body: string; sound: 'default'; badge: number; channelId: string; data: { id: string; link: string | null; type: string } };
type ExpoTicket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Older than this when we reach it (the worker was down, say): mark it handled rather than buzz late. */
const STALE_MINUTES = 30;
/** Messages arrive on their own channel so runners can mute chat without muting results. */
const CHANNEL_FOR: Record<string, string> = { DIRECT_MESSAGE: 'messages', MESSAGE_REACTION: 'messages' };
/** The daily "where you stand" push goes out from this hour, Lagos time, and not after BOOST_UNTIL. */
const BOOST_FROM = 17;
const BOOST_UNTIL = 21;

/**
 * Sends every new in-app notification to the runner's phones as a push, through Expo's push service
 * (APNs on iPhone, FCM on Android). It sweeps the notifications table the way the email job does, so
 * every part of the API that writes a notification gets a push without knowing about it.
 */
@Injectable()
@Processor(PUSH_NOTIFICATIONS_QUEUE)
export class PushNotificationsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationsProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @InjectQueue(PUSH_NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) { super(); }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('push-notifications', { every: 5_000 }, { name: 'send-push' });
    await this.queue.upsertJobScheduler('standing-boost', { every: 15 * 60_000 }, { name: 'standing-boost' });
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'send-push') await this.sendPending();
    if (job.name === 'standing-boost') await this.queueStandingBoosts();
  }

  /**
   * Once a day, early evening in Lagos: each runner in a live competition with someone else hears
   * where they stand in their tightest race ("0.40 km behind Ada for 2nd"). One a day, however many
   * competitions they're in. It's written as a notification, so the sweep above sends the push.
   */
  async queueStandingBoosts(now = new Date()) {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', hour12: false }).format(now));
    if (hour < BOOST_FROM || hour >= BOOST_UNTIL) return 0;
    const rows = await this.dataSource.query(
      `WITH live AS (
         SELECT t."id", t."code", t."title", t."scoringMethod", t."challengeType" FROM "competition_tables" t
         WHERE t."status" IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED') AND t."deletedAt" IS NULL AND t."archivedAt" IS NULL
           AND COALESCE(t."startsAt", t."createdAt") <= now() AND (t."scoringClosesAt" IS NULL OR t."scoringClosesAt" > now())
       ), ranked AS (
         SELECT r."tableId", r."userId", r."score",
                row_number() OVER (PARTITION BY r."tableId" ORDER BY ${RANK_ORDER})::integer AS "rank",
                count(*) OVER (PARTITION BY r."tableId")::integer AS "entrants"
         FROM "table_registrations" r WHERE r."tableId" IN (SELECT "id" FROM live)
       )
       SELECT me."userId", l."id" AS "tableId", l."code", l."title", l."scoringMethod", l."challengeType", me."rank", me."entrants",
              me."score"::float8 AS "score", a."score"::float8 AS "aheadScore", pa."displayName" AS "aheadName",
              b."score"::float8 AS "behindScore", pb."displayName" AS "behindName"
       FROM ranked me JOIN live l ON l."id" = me."tableId"
       JOIN "users" u ON u."id" = me."userId" AND u."deletedAt" IS NULL
       LEFT JOIN ranked a ON a."tableId" = me."tableId" AND a."rank" = me."rank" - 1
       LEFT JOIN "profiles" pa ON pa."userId" = a."userId"
       LEFT JOIN ranked b ON b."tableId" = me."tableId" AND b."rank" = me."rank" + 1
       LEFT JOIN "profiles" pb ON pb."userId" = b."userId"
       WHERE me."entrants" > 1
         AND NOT EXISTS (SELECT 1 FROM "notifications" n WHERE n."userId" = me."userId" AND n."type" = 'STANDING_BOOST'
           AND (n."createdAt" AT TIME ZONE 'Africa/Lagos')::date = (now() AT TIME ZONE 'Africa/Lagos')::date)`,
    ) as StandingRow[];
    const boosts = pickBoosts(rows).map(boostMessage);
    if (!boosts.length) return 0;
    // Push only: marked emailed already, so the email digest leaves them out.
    await this.dataSource.query(
      `INSERT INTO "notifications" ("userId","type","title","body","link","emailProcessedAt")
       SELECT x."userId", 'STANDING_BOOST', x."title", x."body", x."link", now()
       FROM jsonb_to_recordset($1::jsonb) AS x("userId" uuid, "title" text, "body" text, "link" text)`,
      [JSON.stringify(boosts)],
    );
    this.logger.log(`Queued ${boosts.length} standing boosts`);
    return boosts.length;
  }

  private async sendPending() {
    const rows = await this.dataSource.query(
      // Claim inside a CTE and SELECT from it: a bare UPDATE … RETURNING comes back from TypeORM as
      // [rows, count], not rows (the email job claims the same way).
      `WITH pending AS (
         SELECT n."id" FROM "notifications" n
         WHERE n."pushProcessedAt" IS NULL
           AND (n."pushClaimedAt" IS NULL OR n."pushClaimedAt" < now() - interval '2 minutes')
         ORDER BY n."createdAt",n."id" LIMIT 200 FOR UPDATE SKIP LOCKED
       ), claimed AS (
         UPDATE "notifications" n SET "pushClaimedAt"=now()
         FROM pending WHERE n."id"=pending."id"
         RETURNING n."id",n."userId",n."type",n."title",n."body",n."link",n."createdAt",n."readAt"
       )
       SELECT * FROM claimed`,
    ) as Pending[];
    if (!rows.length) return;

    // Already read (you opened the chat before the push went out): no buzz. Stale ones neither.
    const fresh = rows.filter((row) => !row.readAt && Date.now() - new Date(row.createdAt).getTime() < STALE_MINUTES * 60_000);
    const userIds = [...new Set(fresh.map((row) => row.userId))];
    const [tokens, unread] = userIds.length ? await Promise.all([
      this.dataSource.query(`SELECT "token","userId" FROM "push_tokens" WHERE "userId"=ANY($1::uuid[])`, [userIds]) as Promise<Array<{ token: string; userId: string }>>,
      this.dataSource.query(`SELECT "userId",COUNT(*)::integer "count" FROM "notifications" WHERE "userId"=ANY($1::uuid[]) AND "readAt" IS NULL GROUP BY "userId"`, [userIds]) as Promise<Array<{ userId: string; count: number }>>,
    ]) : [[], []];
    const badge = new Map(unread.map((row) => [row.userId, row.count]));
    const byUser = new Map<string, string[]>();
    for (const { token, userId } of tokens) byUser.set(userId, [...(byUser.get(userId) ?? []), token]);

    const messages: ExpoMessage[] = fresh.flatMap((row) => (byUser.get(row.userId) ?? []).map((to) => ({
      to, title: row.title, body: row.body, sound: 'default' as const, badge: badge.get(row.userId) ?? 0,
      channelId: CHANNEL_FOR[row.type] ?? 'default', data: { id: row.id, link: row.link, type: row.type },
    })));

    try {
      // Expo takes up to 100 messages a request.
      for (let start = 0; start < messages.length; start += 100) await this.send(messages.slice(start, start + 100));
    } catch (error) {
      // Leave them claimed: the claim expires and the next sweep tries again.
      this.logger.error('Could not send push notifications', error instanceof Error ? error.stack : String(error));
      return;
    }
    await this.dataSource.query(`UPDATE "notifications" SET "pushProcessedAt"=now() WHERE "id"=ANY($1::uuid[])`, [rows.map((row) => row.id)]);
  }

  private async send(messages: ExpoMessage[]) {
    if (!messages.length) return;
    const accessToken = this.config.get<string>('EXPO_ACCESS_TOKEN');
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(messages),
    });
    if (!response.ok) throw new Error(`Expo push failed: ${response.status} ${await response.text().catch(() => '')}`);
    const { data } = await response.json() as { data: ExpoTicket[] };
    // A phone that uninstalled Jump (or turned notifications off for good) stops getting pushes.
    const gone = data.flatMap((ticket, index) => (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' ? [messages[index].to] : []));
    if (gone.length) await this.dataSource.query(`DELETE FROM "push_tokens" WHERE "token"=ANY($1::varchar[])`, [gone]);
  }
}
