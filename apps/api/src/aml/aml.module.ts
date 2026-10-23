import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { AML_MONITOR_QUEUE } from '../jobs/jobs.module';
import { PaystackClient } from '../payments/paystack.client';
import { AmlAdminService } from './aml-admin.service';
import { AmlMonitorProcessor } from './aml-monitor.processor';
import { AmlMonitorService } from './aml-monitor.service';
import { KycController, RiskAdminController } from './aml.controller';
import { AmlService } from './aml.service';

/** Global so payments, competitions, creators and sign-in can all apply the same controls. */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: AML_MONITOR_QUEUE })],
  controllers: [KycController, RiskAdminController],
  providers: [AmlService, AmlAdminService, AmlMonitorService, AmlMonitorProcessor, PaystackClient],
  exports: [AmlService],
})
export class AmlModule {}
