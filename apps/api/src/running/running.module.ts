import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GpsSample } from './gps-sample.entity';
import { RunningController } from './running.controller';
import { RunningService } from './running.service';
import { RunningSession } from './running-session.entity';
import { Activity } from './activity.entity';
import { BullModule } from '@nestjs/bullmq';
import { ACTIVITY_VERIFICATION_QUEUE } from '../jobs/jobs.module';
import { ActivityVerificationProcessor } from './verification/activity-verification.processor';
import { TableActivityCredit } from '../tables/table-activity-credit.entity';
import { ActivityVerificationReview } from './activity-verification-review.entity';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RunningSession,
      GpsSample,
      Activity,
      ActivityVerificationReview,
      TableActivityCredit,
    ]),
    BullModule.registerQueue({ name: ACTIVITY_VERIFICATION_QUEUE }),
  ],
  controllers: [RunningController, ActivitiesController],
  providers: [RunningService, ActivitiesService, ActivityVerificationProcessor],
})
export class RunningModule {}
