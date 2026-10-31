import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { PUSH_NOTIFICATIONS_QUEUE } from '../jobs/jobs.module';
import { EngagementProcessor } from './engagement.processor';
import { EngagementService } from './engagement.service';
import { Channel, notificationCandidate } from './engagement-policy';
import { claimPodiumsToAnnounce } from '../tables/trophies';
import { announceNewCompetitions, joinCommunityClub, syncHostsGroup } from './community';

type Pending = { id: string; userId: string; type: string; title: string; body: string; link: string | null; createdAt: Date; readAt?: Date | null; engagementKey?: string; engagementExpiresAt?: Date; engagementChannel?: Channel };
type ExpoMessage = { to: string; title: string; body: string; sound: 'default'; badge: number; channelId: string; data: { id: string; link: string | null; type: string } };
type ExpoTicket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };

type Outgoing = { row: Pending; deliveryId?: string; messages: ExpoMessage[] };
type Outcome = { accepted: number; rateLimited: boolean };

class RetryablePushError extends Error {}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PROJECT = '@startajump/jump';
const STALE_MINUTES = 30;
const EXPO_BATCH = 100;
const CHANNEL_FOR: Record<string, string> = { DIRECT_MESSAGE: 'messages', MESSAGE_REACTION: 'messages', CLUB_MESSAGE: 'messages' };

@Injectable()
@Processor(PUSH_NOTIFICATIONS_QUEUE)
export class PushNotificationsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationsProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @InjectQueue(PUSH_NOTIFICATIONS_QUEUE) private readonly queue: Queue,
    private readonly engagement: EngagementService,
    private readonly evaluator: EngagementProcessor,
  ) { super(); }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('push-receipts', { every: 60_000 }, { name: 'push-receipts' });
    await this.queue.upsertJobScheduler('push-notifications', { every: 5_000 }, { name: 'send-push' });
    await this.queue.upsertJobScheduler('standing-boost', { every: 15 * 60_000 }, { name: 'standing-boost' });
    await this.queue.upsertJobScheduler('podium-announce', { every: 10 * 60_000 }, { name: 'podium-announce' });
    await this.queue.upsertJobScheduler('competition-announce', { every: 60_000 }, { name: 'competition-announce' });
    await this.queue.upsertJobScheduler('community-club', { every: 2 * 60_000 }, { name: 'community-club' });
    await this.queue.upsertJobScheduler('hosts-group', { every: 10 * 60_000 }, { name: 'hosts-group' });
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'send-push') { await this.processInbox(); await this.sendPending(); }
    if (job.name === 'engagement-evaluation') await this.evaluator.process(job);
    if (job.name === 'push-receipts') await this.checkReceipts();
    if (job.name === 'standing-boost') await this.queueStandingBoosts();
    if (job.name === 'podium-announce') await this.announcePodiums();
    if (job.name === 'competition-announce') await this.announceCompetitions();
    if (job.name === 'community-club') await this.joinCommunityClub();
    if (job.name === 'hosts-group') await this.syncHostsGroup();
  }

  async announcePodiums() {
    const podium = await claimPodiumsToAnnounce(this.dataSource.manager);
    if (!podium.length) return 0;
    const medal = ['🥇', '🥈', '🥉'];
    const rows = podium.map((row) => ({
      userId: row.userId,
      title: row.rank === 1 ? `${medal[0]} You won ${row.title}` : `${medal[row.rank - 1]} ${row.rank === 2 ? '2nd' : '3rd'} in ${row.title}`,
      body: row.rank === 1 ? 'First place. It’s in your trophy cabinet now. Tap to see the final board.' : 'You made the podium. It’s in your trophy cabinet now. Tap to see the final board.',
      link: `/competitions/${row.code}`,
    }));
    await this.dataSource.query(
      `INSERT INTO "notifications" ("userId","type","title","body","link")
       SELECT x."userId", 'PODIUM', x."title", x."body", x."link" FROM jsonb_to_recordset($1::jsonb) AS x("userId" uuid, "title" text, "body" text, "link" text)`,
      [JSON.stringify(rows)],
    );
    this.logger.log(`Announced ${rows.length} podium finishes`);
    return rows.length;
  }

  async announceCompetitions() {
    const { competitions, notified } = await this.dataSource.transaction((manager) => announceNewCompetitions(manager));
    if (competitions) this.logger.log(`Announced ${competitions} new competitions to ${notified} runners`);
  }

  async joinCommunityClub() {
    const slug = this.config.get<string>('COMMUNITY_CLUB_SLUG') ?? 'jump-community-club';
    const joined = await this.dataSource.transaction((manager) => joinCommunityClub(manager, slug));
    if (joined) this.logger.log(`Added ${joined} runners to the community club`);
  }

  async syncHostsGroup() {
    const slug = this.config.get<string>('HOSTS_GROUP_SLUG') ?? 'jump-hosts';
    const { added, removed } = await this.dataSource.transaction((manager) => syncHostsGroup(manager, slug));
    if (added || removed) this.logger.log(`Hosts group: ${added} added, ${removed} removed`);
  }

  async queueStandingBoosts() {
    return 0;
  }

  private async sendPending() {
    const rows = await this.dataSource.query(
      `WITH pending AS (
         SELECT n."id" FROM "notifications" n
         WHERE n."pushProcessedAt" IS NULL
           AND (n."pushClaimedAt" IS NULL OR n."pushClaimedAt" < now() - interval '2 minutes')
         ORDER BY CASE WHEN n.type IN ('COMPETITION_ENDING','COMPETITION_STARTING','WEEKLY_GOAL') THEN 0 ELSE 1 END,n."createdAt",n."id" LIMIT 200 FOR UPDATE SKIP LOCKED
       ), claimed AS (
         UPDATE "notifications" n SET "pushClaimedAt"=now()
         FROM pending WHERE n."id"=pending."id"
         RETURNING n.*
       )
       SELECT * FROM claimed`,
    ) as Pending[];
    if (!rows.length) return;

    const fresh = rows.filter((row) => !row.readAt && Date.now() - new Date(row.createdAt).getTime() < STALE_MINUTES * 60_000);
    const userIds = [...new Set(fresh.map((row) => row.userId))];
    const [tokens, unread] = userIds.length ? await Promise.all([
      this.dataSource.query(`SELECT "token","userId" FROM "push_tokens" WHERE "userId"=ANY($1::uuid[])`, [userIds]) as Promise<Array<{ token: string; userId: string }>>,
      this.dataSource.query(`SELECT "userId",COUNT(*)::integer "count" FROM "notifications" WHERE "userId"=ANY($1::uuid[]) AND "readAt" IS NULL AND "inappAllowed"=true GROUP BY "userId"`, [userIds]) as Promise<Array<{ userId: string; count: number }>>,
    ]) : [[], []];
    const badge = new Map(unread.map((row) => [row.userId, row.count]));
    const byUser = new Map<string, string[]>();
    for (const { token, userId } of tokens) byUser.set(userId, [...(byUser.get(userId) ?? []), token]);

    let batch: Outgoing[] = [];
    let size = 0;
    for (const row of fresh) {
      const messages: ExpoMessage[] = (byUser.get(row.userId) ?? []).map(to => ({
        to, title: row.title, body: row.body, sound: 'default', badge: badge.get(row.userId) ?? 0,
        channelId: CHANNEL_FOR[row.type] ?? 'default', data: { id: row.id, link: row.link, type: row.type },
      }));
      if (batch.length && size + messages.length > EXPO_BATCH) {
        if (!await this.flush(batch)) { batch = []; break; }
        batch = [];
        size = 0;
      }
      const decision = await this.engagement.reserve(notificationCandidate(row), 'push');
      if (!decision.allowed) {
        await this.dataSource.query(`UPDATE notifications SET "pushProcessedAt"=now() WHERE id=$1`, [row.id]);
        continue;
      }
      if (!messages.length) { await this.engagement.finish(decision.id, 'failed', 'no_device'); continue; }
      batch.push({ row, deliveryId: decision.id, messages });
      size += messages.length;
    }
    if (batch.length) await this.flush(batch);
    const skipped = rows.filter(row => !fresh.includes(row));
    for (const row of skipped) await this.engagement.reserve(notificationCandidate(row), 'push');
    if (skipped.length) await this.dataSource.query(`UPDATE "notifications" SET "pushProcessedAt"=now() WHERE "id"=ANY($1::uuid[])`,[skipped.map(r=>r.id)]);
    const suppressed = fresh.filter(row => !(byUser.get(row.userId)?.length));
    if (suppressed.length) await this.dataSource.query(`UPDATE "notifications" SET "pushProcessedAt"=now() WHERE "id"=ANY($1::uuid[])`,[suppressed.map(r=>r.id)]);
  }

  private async processInbox() {
    const rows = await this.dataSource.query(`SELECT * FROM notifications WHERE "inappAllowed" IS NULL ORDER BY "createdAt",id LIMIT 200`) as Pending[];
    for (const row of rows) {
      const decision = await this.engagement.reserve(notificationCandidate(row), 'inapp');
      await this.dataSource.query(`UPDATE notifications SET "inappAllowed"=$2 WHERE id=$1 AND "inappAllowed" IS NULL`,[row.id,decision.allowed]);
      if (decision.allowed) await this.engagement.finish(decision.id,'sent');
    }
  }

  private async flush(batch: Outgoing[]) {
    const messages = batch.flatMap(item => item.messages);
    const deliveries = new Map(batch.map(item => [item.row.id, item.deliveryId]));
    const outcome = new Map<string, Outcome>();
    try {
      for (let start = 0; start < messages.length; start += EXPO_BATCH) {
        for (const [id, result] of await this.send(messages.slice(start, start + EXPO_BATCH), deliveries)) {
          const seen = outcome.get(id);
          outcome.set(id, { accepted: (seen?.accepted ?? 0) + result.accepted, rateLimited: !!seen?.rateLimited || result.rateLimited });
        }
      }
    } catch (error) {
      const retryable = error instanceof RetryablePushError;
      for (const item of batch) await this.engagement.finish(item.deliveryId, retryable ? 'failed' : 'uncertain', retryable ? 'retryable' : 'transport_error');
      if (!retryable) {
        this.logger.error('Could not send push notifications', error instanceof Error ? error.message : String(error));
        const optional = batch.filter(item => item.deliveryId).map(item => item.row.id);
        if (optional.length) await this.dataSource.query(`UPDATE "notifications" SET "pushProcessedAt"=now() WHERE "id"=ANY($1::uuid[])`, [optional]);
      }
      return false;
    }
    const done: string[] = [];
    for (const item of batch) {
      const result = outcome.get(item.row.id);
      if (!result?.accepted && result?.rateLimited) { await this.engagement.finish(item.deliveryId, 'failed', 'retryable'); continue; }
      await this.engagement.finish(item.deliveryId, result?.accepted ? 'sent' : 'failed', result?.accepted ? undefined : 'provider_rejected');
      done.push(item.row.id);
    }
    if (done.length) await this.dataSource.query(`UPDATE "notifications" SET "pushProcessedAt"=now() WHERE "id"=ANY($1::uuid[])`, [done]);
    return true;
  }

  private async send(messages: ExpoMessage[], deliveries: Map<string, string | undefined>, retried = false): Promise<Map<string, Outcome>> {
    const outcome = new Map<string, Outcome>();
    if (!messages.length) return outcome;
    const accessToken = this.config.get<string>('EXPO_ACCESS_TOKEN');
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(messages),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const stale = retried ? null : this.otherProjectTokens(text);
      if (!stale) {
        if (response.status === 429) throw new RetryablePushError('Expo rate limited the request');
        throw new Error(`Expo push failed: ${response.status}`);
      }
      await this.dataSource.query(`DELETE FROM "push_tokens" WHERE "token"=ANY($1::varchar[])`, [stale]);
      return this.send(messages.filter(message => !stale.includes(message.to)), deliveries, true);
    }
    const { data } = await response.json() as { data: ExpoTicket[] };
    if (!Array.isArray(data) || data.length !== messages.length) throw new Error('Invalid Expo ticket response');
    for (let i = 0; i < data.length; i++) {
      const ticket = data[i];
      const message = messages[i];
      const deliveryId = deliveries.get(message.data.id);
      if (ticket.status === 'ok' && ticket.id) await this.dataSource.query(`INSERT INTO notification_push_receipts(id,"notificationId","deliveryId",token) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [ticket.id, message.data.id, deliveryId ?? null, message.to]);
      if (ticket.details?.error === 'DeviceNotRegistered') {
        await this.dataSource.query(`DELETE FROM push_tokens WHERE token=ANY($1::varchar[])`, [[message.to]]);
        if (deliveryId) {
          const [user] = await this.dataSource.query(`SELECT "userId" FROM notification_deliveries WHERE id=$1`, [deliveryId]);
          if (user) await this.engagement.event(user.userId, 'device_token_invalidated', `device:${message.data.id}`, deliveryId);
        }
      }
      const seen = outcome.get(message.data.id) ?? { accepted: 0, rateLimited: false };
      outcome.set(message.data.id, { accepted: seen.accepted + (ticket.status === 'ok' ? 1 : 0), rateLimited: seen.rateLimited || ticket.details?.error === 'MessageRateExceeded' });
    }
    return outcome;
  }

  private async checkReceipts() {
    const rows = await this.dataSource.query(`SELECT * FROM notification_push_receipts WHERE "checkedAt" IS NULL AND "createdAt"<now()-interval '15 minutes' ORDER BY "createdAt" LIMIT 300`);
    if (!rows.length) return;
    const token=this.config.get<string>('EXPO_ACCESS_TOKEN');
    const response=await fetch('https://exp.host/--/api/v2/push/getReceipts',{method:'POST',signal:AbortSignal.timeout(10_000),headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({ids:rows.map((r: {id:string})=>r.id)})});
    if (!response.ok) throw new Error('Expo receipt lookup failed');
    const {data}=await response.json() as {data:Record<string,ExpoTicket>};
    for (const row of rows) {
      const receipt=data[row.id];
      if (!receipt && Date.now()-new Date(row.createdAt).getTime()<24*3600_000) continue;
      await this.dataSource.query(`UPDATE notification_push_receipts SET "checkedAt"=now(),status=$2 WHERE id=$1`,[row.id,receipt?.status==='ok'?'delivered':receipt?'failed':'unknown']);
      if (receipt?.details?.error==='DeviceNotRegistered') await this.dataSource.query(`DELETE FROM push_tokens WHERE token=$1`,[row.token]);
      if (row.deliveryId) {
        if (receipt?.status==='ok') await this.engagement.finish(row.deliveryId,'delivered');
        else if (receipt) await this.engagement.event((await this.dataSource.query(`SELECT "userId" FROM notification_deliveries WHERE id=$1`,[row.deliveryId]))[0].userId,'delivery_failed',`receipt:${row.id}`,row.deliveryId);
      }
    }
  }

  private otherProjectTokens(body: string): string[] | null {
    try {
      const { errors } = JSON.parse(body) as { errors?: Array<{ code?: string; details?: Record<string, string[]> }> };
      const error = errors?.find((item) => item.code === 'PUSH_TOO_MANY_EXPERIENCE_IDS');
      if (!error?.details) return null;
      const projects = Object.entries(error.details);
      const ours = this.config.get<string>('EXPO_PROJECT') || EXPO_PROJECT;
      const keep = projects.find(([project]) => project === ours) ?? projects.sort((a, b) => b[1].length - a[1].length)[0];
      const stale = projects.filter((entry) => entry !== keep).flatMap(([, tokens]) => tokens);
      return stale.length ? stale : null;
    } catch {
      return null;
    }
  }

}
