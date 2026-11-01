import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { APPLE_HEALTH_QUEUE } from '../jobs/jobs.module';
import { AppleHealthService } from './apple-health.service';

@Processor(APPLE_HEALTH_QUEUE)
export class AppleHealthProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AppleHealthProcessor.name);

  constructor(private readonly appleHealth: AppleHealthService, @InjectQueue(APPLE_HEALTH_QUEUE) private readonly queue: Queue) { super(); }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('daily-steps-posts', { every: 15 * 60_000 }, { name: 'post-steps' });
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'post-steps') return;
    const posted = await this.appleHealth.postDailySteps();
    if (posted) this.logger.log(`Posted ${posted} daily step Rants`);
  }
}
