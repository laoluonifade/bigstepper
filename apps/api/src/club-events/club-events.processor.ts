import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { CLUB_EVENTS_QUEUE } from '../jobs/jobs.module';
import { ClubEventsRepository, ReminderRow } from './club-events.repository';
import { localClock, localDay } from './club-events.service';

export function dayReminder(event: ReminderRow, now = new Date()) {
  const at = new Date(event.nextAt);
  const today = localDay(now, event.timeZone) === localDay(at, event.timeZone);
  return {
    title: `${today ? 'Today' : 'Tomorrow'} at ${localClock(at, event.timeZone)}: ${event.title}`,
    body: `${event.clubName} meets at ${event.venue}. See you there.`,
  };
}

export function hourReminder(event: ReminderRow) {
  return {
    title: `${event.title} starts at ${localClock(new Date(event.nextAt), event.timeZone)}`,
    body: `Head to ${event.venue} to run with ${event.clubName}. Record it on Jump so it counts.`,
  };
}

@Injectable()
@Processor(CLUB_EVENTS_QUEUE)
export class ClubEventsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ClubEventsProcessor.name);

  constructor(private readonly repo: ClubEventsRepository, @InjectQueue(CLUB_EVENTS_QUEUE) private readonly queue: Queue) { super(); }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('club-event-reminders', { every: 5 * 60_000 }, { name: 'remind' });
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'remind') return;
    for (const event of await this.repo.due('dayReminderFor', '24 hours', '3 hours')) await this.send(event, dayReminder(event));
    for (const event of await this.repo.due('hourReminderFor', '60 minutes', '0 minutes')) await this.send(event, hourReminder(event));
  }

  private async send(event: ReminderRow, message: { title: string; body: string }) {
    try { await this.repo.remind(event.id, message.title, message.body); }
    catch (error) { this.logger.error(`Reminder for event ${event.id} failed`, error instanceof Error ? error.stack : String(error)); }
  }
}
