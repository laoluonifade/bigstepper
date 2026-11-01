import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ACTIVITY_VERIFICATION_QUEUE, APPLE_HEALTH_QUEUE } from '../jobs/jobs.module';
import { AppleHealthProcessor } from './apple-health.processor';
import { AppleHealthLink } from './apple-health-link.entity';
import { AppleHealthController } from './apple-health.controller';
import { AppleHealthService } from './apple-health.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppleHealthLink]), BullModule.registerQueue({ name: ACTIVITY_VERIFICATION_QUEUE }, { name: APPLE_HEALTH_QUEUE })],
  controllers: [AppleHealthController],
  providers: [AppleHealthService, AppleHealthProcessor],
})
export class AppleHealthModule {}
