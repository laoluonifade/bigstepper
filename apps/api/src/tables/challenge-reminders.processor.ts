import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { CHALLENGE_REMINDERS_QUEUE } from '../jobs/jobs.module';
import { MailService } from '../mail/mail.service';
import { challengeReminderEmail } from '../mail/templates';
import { rescore } from './competition-credits';
import { METRICS } from './competition-rules';

interface ReminderRecipient {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  title: string;
  code: string;
}

@Injectable()
@Processor(CHALLENGE_REMINDERS_QUEUE)
export class ChallengeRemindersProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ChallengeRemindersProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @InjectQueue(CHALLENGE_REMINDERS_QUEUE) private readonly queue: Queue,
  ) { super(); }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('daily-challenge-reminders', { every: 60_000 }, { name: 'send-due-reminders' });
    await this.queue.upsertJobScheduler('calendar-rescore', { every: 15 * 60_000 }, { name: 'rescore-calendar' });
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'rescore-calendar') return this.rescoreCalendar();
    if (job.name !== 'send-due-reminders' || !this.mail.configured) return;
    const recipients = (await this.dataSource.query(
      `WITH due AS (
         SELECT t."id" "tableId", r."userId", (now() AT TIME ZONE t."reminderTimeZone")::date "reminderDate"
         FROM "competition_tables" t
         JOIN "table_registrations" r ON r."tableId"=t."id"
         JOIN "users" u ON u."id"=r."userId" AND u."emailVerified"=true
         JOIN "profiles" p ON p."userId"=r."userId" AND p."emailActivityEnabled"=true
         LEFT JOIN "challenge_reminder_deliveries" d ON d."tableId"=t."id" AND d."userId"=r."userId"
           AND d."reminderDate"=(now() AT TIME ZONE t."reminderTimeZone")::date
         WHERE t."reminderTime" IS NOT NULL AND t."status" IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED')
           AND t."startsAt" <= now() AND (t."scoringClosesAt" IS NULL OR t."scoringClosesAt" > now())
           AND (now() AT TIME ZONE t."reminderTimeZone")::time >= t."reminderTime"
           AND d."suppressedAt" IS NULL AND (d."id" IS NULL OR (d."sentAt" IS NULL AND d."claimedAt" < now() - INTERVAL '5 minutes'))
           AND NOT EXISTS (
             SELECT 1 FROM "activities" a WHERE a."userId"=r."userId"
               AND a."verificationStatus" IN ('PENDING_VERIFICATION','VERIFIED')
               AND (a."startedAt" AT TIME ZONE t."reminderTimeZone")::date=(now() AT TIME ZONE t."reminderTimeZone")::date
           )
         ORDER BY t."id", r."userId" LIMIT 100
       ), claimed AS (
         INSERT INTO "challenge_reminder_deliveries" ("tableId","userId","reminderDate")
         SELECT "tableId","userId","reminderDate" FROM due
         ON CONFLICT ("tableId","userId","reminderDate") DO UPDATE SET "claimedAt"=now()
         WHERE "challenge_reminder_deliveries"."sentAt" IS NULL AND "challenge_reminder_deliveries"."suppressedAt" IS NULL
           AND "challenge_reminder_deliveries"."claimedAt" < now() - INTERVAL '5 minutes'
         RETURNING "id","tableId","userId"
       )
       SELECT c."id", c."userId", u."email", u."displayName", t."title", t."code"
       FROM claimed c JOIN "users" u ON u."id"=c."userId"
       JOIN "competition_tables" t ON t."id"=c."tableId"`,
    )) as ReminderRecipient[];
    if (!recipients.length) return;

    const sent: string[] = [];
    const suppressed: string[]=[];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(10, recipients.length) }, async () => {
      while (next < recipients.length) {
        const recipient = recipients[next++];
        try {
          const message = challengeReminderEmail(
            { address: recipient.email, name: recipient.displayName ?? undefined },
            recipient.title,
            `${this.config.getOrThrow<string>('WEB_ORIGIN')}/competitions/${recipient.code}`,
          );
          const delivered=await this.mail.send({ ...message, engagement: { userId: recipient.userId, type: 'CHALLENGE_REMINDER', key: `challenge-reminder:${recipient.id}`, link: `/competitions/${recipient.code}`, createdAt: new Date(), onlyChannel: 'email' } });
          if(delivered!==false) sent.push(recipient.id); else suppressed.push(recipient.id);
        } catch (error) {
          this.logger.error(`Competition reminder delivery failed for ${recipient.id}`, error instanceof Error ? error.stack : String(error));
        }
      }
    }));
    if(suppressed.length) await this.dataSource.query(`UPDATE challenge_reminder_deliveries SET "suppressedAt"=now() WHERE id=ANY($1::uuid[])`,[suppressed]);
    if (sent.length) await this.dataSource.query(
      `UPDATE "challenge_reminder_deliveries" SET "sentAt"=now() WHERE "id"=ANY($1::uuid[])`, [sent],
    );
  }

  private async rescoreCalendar() {
    const tables = (await this.dataSource.query(
      `SELECT "id" FROM "competition_tables"
       WHERE "rulesVersion" >= 2 AND "scoringMethod" = ANY($1::text[])
         AND "status" IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED')
         AND COALESCE("startsAt", "createdAt") <= now()
         AND ("scoringClosesAt" IS NULL OR "scoringClosesAt" > now() - INTERVAL '1 day')`,
      [CALENDAR_METHODS],
    )) as Array<{ id: string }>;
    if (tables.length) await rescore(this.dataSource.manager, tables.map((table) => table.id));
  }
}

const CALENDAR_METHODS = (Object.keys(METRICS) as Array<keyof typeof METRICS>)
  .filter((method) => ['dailyAverage', 'dailyVariation', 'weeklyVariation'].includes(METRICS[method].aggregate));
