import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PRODUCT_PRIZES_QUEUE } from '../jobs/jobs.module';
import { PrizeAwardsService } from './prize-awards.service';

@Injectable()
@Processor(PRODUCT_PRIZES_QUEUE)
export class ProductPrizesProcessor extends WorkerHost implements OnModuleInit {
  constructor(private readonly awards: PrizeAwardsService, @InjectQueue(PRODUCT_PRIZES_QUEUE) private readonly queue: Queue) { super(); }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('product-prizes', { every: 15 * 60_000 }, { name: 'product-prizes' });
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'product-prizes') return;
    await this.awards.finalizeDue();
    await this.awards.remindAndForfeit();
  }
}
