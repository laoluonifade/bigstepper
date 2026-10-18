import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PAYMENT_EVENTS_QUEUE } from './payments.constants';
import { PaymentsService } from './payments.service';

@Processor(PAYMENT_EVENTS_QUEUE)
export class PaymentEventsProcessor extends WorkerHost {
  constructor(private readonly paymentsService: PaymentsService) { super(); }
  async process(job: Job<{ inboxId: string }>) {
    if (job.name === 'process-paystack-webhook') await this.paymentsService.processWebhook(job.data.inboxId);
  }
}
