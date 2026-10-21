import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PAYMENT_EVENTS_QUEUE } from './payments.constants';
import { PaymentsService } from './payments.service';

@Processor(PAYMENT_EVENTS_QUEUE)
export class PaymentEventsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PaymentEventsProcessor.name);
  constructor(private readonly paymentsService: PaymentsService, @InjectQueue(PAYMENT_EVENTS_QUEUE) private readonly queue: Queue) { super(); }
  async onModuleInit() {
    await this.queue.upsertJobScheduler('abandoned-payment-checkouts', { every: 60_000 }, { name: 'sweep-abandoned-checkouts' });
  }
  async process(job: Job<{ inboxId: string }>) {
    if (job.name === 'process-paystack-webhook') await this.paymentsService.processWebhook(job.data.inboxId);
    if (job.name === 'sweep-abandoned-checkouts') {
      try {
        const result = await this.paymentsService.sweepAbandonedCheckouts();
        if (result.failures) this.logger.warn(`Could not verify ${result.failures} of ${result.checked} expired checkouts; they will be retried`);
      }
      catch (error) {
        this.logger.error('Abandoned checkout sweep failed', error instanceof Error ? error.stack : String(error));
        throw error;
      }
    }
  }
}
