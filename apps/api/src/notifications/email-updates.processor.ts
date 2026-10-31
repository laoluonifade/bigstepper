import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { EMAIL_UPDATES_QUEUE } from '../jobs/jobs.module';
import { MailService } from '../mail/mail.service';
import { activityUpdatesEmail, competitionDigestEmail, CompetitionDigestItem, streakReminderEmail } from '../mail/templates';
import { STREAK_DAY_SQL, STREAK_TIME_ZONE } from '../running/streaks';

type PendingUpdate = { id: string; userId: string; type: string; title: string; email: string; displayName: string | null; emailVerified: boolean; emailActivityEnabled: boolean };
type DigestRecipient = { userId: string; email: string; displayName: string | null };
const ESSENTIAL_EMAIL_TYPES = new Set(['PAYOUT_RECIPIENT_CHANGED', 'PAYOUT_SENT', 'PAYOUT_REJECTED']);

@Injectable()
@Processor(EMAIL_UPDATES_QUEUE)
export class EmailUpdatesProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(EmailUpdatesProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @InjectQueue(EMAIL_UPDATES_QUEUE) private readonly queue: Queue,
  ) { super(); }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('notification-emails', { every: 60_000 }, { name: 'send-notifications' });
    await this.queue.upsertJobScheduler('three-day-competition-digest', { every: 5 * 60_000 }, { name: 'send-digests' });
    await this.queue.upsertJobScheduler('streak-reminders', { every: 15 * 60_000 }, { name: 'send-streak-reminders' });
  }

  async process(job: Job): Promise<void> {
    if (!this.mail.canSendBulk) return;
    if (job.name === 'send-notifications') await this.sendNotifications();
    if (job.name === 'send-digests') await this.sendDigests();
    if (job.name === 'send-streak-reminders') await this.sendStreakReminders();
  }

  private origin() { return this.config.getOrThrow<string>('WEB_ORIGIN').replace(/\/$/, ''); }

  private async sendNotifications() {
    const rows = await this.dataSource.query(
      `WITH pending AS (
         SELECT n."id" FROM "notifications" n
         WHERE n."emailProcessedAt" IS NULL
           AND (n."emailClaimedAt" IS NULL OR n."emailClaimedAt" < now() - interval '5 minutes')
         ORDER BY n."createdAt",n."id" LIMIT 100 FOR UPDATE SKIP LOCKED
       ), claimed AS (
         UPDATE "notifications" n SET "emailClaimedAt"=now()
         FROM pending WHERE n."id"=pending."id"
         RETURNING n."id",n."userId",n."type",n."title"
       )
       SELECT c.*,u."email",u."displayName",u."emailVerified",COALESCE(p."emailActivityEnabled",true) "emailActivityEnabled"
       FROM claimed c JOIN "users" u ON u."id"=c."userId"
       LEFT JOIN "profiles" p ON p."userId"=c."userId"`,
    ) as PendingUpdate[];
    if (!rows.length) return;

    const grouped = new Map<string, PendingUpdate[]>();
    for (const row of rows) grouped.set(row.userId, [...(grouped.get(row.userId) ?? []), row]);
    let next = 0;
    const batches = [...grouped.values()];
    await Promise.all(Array.from({ length: Math.min(10, batches.length) }, async () => {
      while (next < batches.length) {
        const batch = batches[next++];
        const user = batch[0];
        const ids = batch.map((row) => row.id);
        const emailRows = batch.filter((row) => row.emailActivityEnabled || ESSENTIAL_EMAIL_TYPES.has(row.type));
        const emailIds = emailRows.map((row) => row.id);
        const skippedIds = batch.filter((row) => !emailRows.includes(row)).map((row) => row.id);
        if (!user.emailVerified || !emailRows.length) {
          await this.dataSource.query(`UPDATE "notifications" SET "emailProcessedAt"=now() WHERE "id"=ANY($1::uuid[])`, [ids]);
          continue;
        }
        try {
          const origin = this.origin();
          await this.mail.send(activityUpdatesEmail(
            { address: user.email, name: user.displayName ?? undefined },
            emailRows.map((row) => row.title), `${origin}/notifications`, `${origin}/settings/profile#email-preferences`,
          ));
          await this.dataSource.query(`UPDATE "notifications" SET "emailProcessedAt"=now(),"emailSentAt"=now() WHERE "id"=ANY($1::uuid[])`, [emailIds]);
          if (skippedIds.length) await this.dataSource.query(`UPDATE "notifications" SET "emailProcessedAt"=now() WHERE "id"=ANY($1::uuid[])`, [skippedIds]);
        } catch (error) {
          this.logger.error(`Notification email failed for ${user.userId}`, error instanceof Error ? error.stack : String(error));
        }
      }
    }));
  }

  private async sendDigests() {
    const picks = await this.dataSource.query(
      `SELECT t."title",t."code",t."challengeType",t."format",t."scoringMethod",t."bannerUrl",COUNT(r."id")::integer "entrants"
       FROM "competition_tables" t LEFT JOIN "table_registrations" r ON r."tableId"=t."id"
       WHERE t."status"='OPEN_FOR_ENTRY' AND t."visibility"='public' AND t."archivedAt" IS NULL AND t."deletedAt" IS NULL
         AND (t."entryClosesAt" IS NULL OR t."entryClosesAt">now())
       GROUP BY t."id" HAVING t."capacity" IS NULL OR COUNT(r."id") < t."capacity"
       ORDER BY t."bannerUrl" IS NULL,"entrants" DESC,t."createdAt" DESC LIMIT 4`,
    ) as CompetitionDigestItem[];
    if (!picks.length) return;
    const recipients = await this.dataSource.query(
      `WITH due AS (
         SELECT p."userId" FROM "profiles" p JOIN "users" u ON u."id"=p."userId"
         WHERE u."emailVerified"=true AND p."emailDigestEnabled"=true AND p."digestNextAt"<=now()
           AND (p."digestClaimedAt" IS NULL OR p."digestClaimedAt"<now() - interval '15 minutes')
         ORDER BY p."digestNextAt",p."userId" LIMIT 100 FOR UPDATE OF p SKIP LOCKED
       ), claimed AS (
         UPDATE "profiles" p SET "digestClaimedAt"=now()
         FROM due WHERE p."userId"=due."userId" RETURNING p."userId"
       )
       SELECT c."userId",u."email",u."displayName" FROM claimed c JOIN "users" u ON u."id"=c."userId"`,
    ) as DigestRecipient[];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(10, recipients.length) }, async () => {
      while (next < recipients.length) {
        const recipient = recipients[next++];
        try {
          const origin = this.origin();
          await this.mail.send(competitionDigestEmail(
            { address: recipient.email, name: recipient.displayName ?? undefined }, picks, origin,
            `${origin}/competitions`, `${origin}/settings/profile#email-preferences`,
          ));
          await this.dataSource.query(
            `UPDATE "profiles" SET "digestNextAt"=now()+interval '3 days',"digestClaimedAt"=NULL WHERE "userId"=$1`,
            [recipient.userId],
          );
        } catch (error) {
          this.logger.error(`Competition digest failed for ${recipient.userId}`, error instanceof Error ? error.stack : String(error));
        }
      }
    }));
  }

  private async sendStreakReminders() {
    const rows = await this.dataSource.query(
      `WITH local AS (SELECT (now() AT TIME ZONE $1) AS at),
       today AS (SELECT at::date AS d FROM local WHERE extract(hour FROM at) BETWEEN 18 AND 22),
       days AS (
         SELECT DISTINCT a."userId", ${STREAK_DAY_SQL} AS d
         FROM "activities" a
         WHERE a."startedAt" > now() - interval '400 days' AND a."verificationStatus"<>'REJECTED'
           AND GREATEST(a."recordedDistanceMetres", a."validatedDistanceMetres", a."stepDistanceMetres") >= 100
       ),
       due AS (
         SELECT p."userId" FROM "profiles" p JOIN "users" u ON u."id"=p."userId", today
         WHERE u."emailVerified"=true AND p."emailActivityEnabled"=true
           AND (p."streakReminderSentOn" IS NULL OR p."streakReminderSentOn" < today.d)
           AND EXISTS (SELECT 1 FROM days WHERE days."userId"=p."userId" AND days.d = today.d - 1)
           AND NOT EXISTS (SELECT 1 FROM days WHERE days."userId"=p."userId" AND days.d = today.d)
         LIMIT 200
       ),
       islands AS (
         SELECT days."userId", days.d, days.d - (ROW_NUMBER() OVER (PARTITION BY days."userId" ORDER BY days.d))::integer AS island
         FROM days JOIN due ON due."userId"=days."userId"
       ),
       claimed AS (
         UPDATE "profiles" p SET "streakReminderSentOn"=today.d FROM due, today
         WHERE p."userId"=due."userId" RETURNING p."userId"
       )
       SELECT c."userId", u."email", u."displayName",
              (SELECT COUNT(*)::integer FROM islands i WHERE i."userId"=c."userId" AND i.island =
                 (SELECT i2.island FROM islands i2 WHERE i2."userId"=c."userId" ORDER BY i2.d DESC LIMIT 1)) AS "streak"
       FROM claimed c JOIN "users" u ON u."id"=c."userId"`,
      [STREAK_TIME_ZONE],
    ) as Array<{ userId: string; email: string; displayName: string | null; streak: number }>;
    for (const row of rows) {
      try {
        const origin = this.origin();
        await this.mail.send(streakReminderEmail(
          { address: row.email, name: row.displayName ?? undefined }, Math.max(1, row.streak),
          `${origin}/run`, `${origin}/settings/profile#email-preferences`,
        ));
      } catch (error) {
        this.logger.error(`Streak reminder failed for ${row.userId}`, error instanceof Error ? error.stack : String(error));
      }
    }
  }
}
