import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { PUSH_NOTIFICATIONS_QUEUE } from '../jobs/jobs.module';

type Pending = { id: string; userId: string; type: string; title: string; body: string; link: string | null; createdAt: Date };
type ExpoMessage = { to: string; title: string; body: string; sound: 'default'; badge: number; channelId: string; data: { id: string; link: string | null; type: string } };
type ExpoTicket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Older than this when we reach it (the worker was down, say): mark it handled rather than buzz late. */
const STALE_MINUTES = 30;
/** Messages arrive on their own channel so runners can mute chat without muting results. */
const CHANNEL_FOR: Record<string, string> = { DIRECT_MESSAGE: 'messages', MESSAGE_REACTION: 'messages' };

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
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'send-push') await this.sendPending();
  }

  private async sendPending() {
    const rows = await this.dataSource.query(
      `WITH pending AS (
         SELECT n."id" FROM "notifications" n
         WHERE n."pushProcessedAt" IS NULL
           AND (n."pushClaimedAt" IS NULL OR n."pushClaimedAt" < now() - interval '2 minutes')
         ORDER BY n."createdAt",n."id" LIMIT 200 FOR UPDATE SKIP LOCKED
       )
       UPDATE "notifications" n SET "pushClaimedAt"=now()
       FROM pending WHERE n."id"=pending."id"
       RETURNING n."id",n."userId",n."type",n."title",n."body",n."link",n."createdAt"`,
    ) as Pending[];
    if (!rows.length) return;

    const fresh = rows.filter((row) => Date.now() - new Date(row.createdAt).getTime() < STALE_MINUTES * 60_000);
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
