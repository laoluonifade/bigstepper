import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { PaymentIntent } from './payment-intent.entity';
import { ProviderWebhook } from './provider-webhook.entity';
import { PaymentsService } from './payments.service';
import { PaystackClient } from './paystack.client';
import { PAYMENT_EVENTS_QUEUE } from './payments.constants';
import { PaymentEventsProcessor } from './payment-events.processor';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentIntent, ProviderWebhook]), BullModule.registerQueue({ name: PAYMENT_EVENTS_QUEUE })],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaystackClient, PaymentEventsProcessor],
  exports: [PaymentsService, PaystackClient],
})
export class PaymentsModule {}
