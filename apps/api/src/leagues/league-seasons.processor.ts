import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { LEAGUE_SEASONS_QUEUE } from '../jobs/jobs.module';
import { LeagueSeasonsService } from './league-seasons.service';

const CHECK_EVERY_MS = 10 * 60 * 1000;

/** Checks every 10 minutes whether a league season has ended and closes it. */
@Injectable()
@Processor(LEAGUE_SEASONS_QUEUE)
export class LeagueSeasonsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(LeagueSeasonsProcessor.name);

  constructor(
    private readonly seasons: LeagueSeasonsService,
    @InjectQueue(LEAGUE_SEASONS_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('league-season-rollover', { every: CHECK_EVERY_MS }, { name: 'close-due-seasons' });
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'close-due-seasons') return;
    try {
      await this.seasons.closeDueSeasons();
    } catch (error) {
      this.logger.error('League season rollover failed', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }
}
