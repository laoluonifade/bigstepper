import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { AML_MONITOR_QUEUE } from '../jobs/jobs.module';
import { AmlMonitorService } from './aml-monitor.service';

@Injectable()
@Processor(AML_MONITOR_QUEUE)
export class AmlMonitorProcessor extends WorkerHost implements OnModuleInit {
  constructor(private readonly monitor: AmlMonitorService, @InjectQueue(AML_MONITOR_QUEUE) private readonly queue: Queue) { super(); }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('aml-scan', { every: 60 * 60_000 }, { name: 'aml-scan' });
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'aml-scan') await this.monitor.scan();
  }
}
