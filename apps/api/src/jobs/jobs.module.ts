import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

export const ACTIVITY_VERIFICATION_QUEUE = 'activity-verification';

@Module({
  imports: [BullModule.registerQueue({ name: ACTIVITY_VERIFICATION_QUEUE })],
  exports: [BullModule],
})
export class JobsModule {}
