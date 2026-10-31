import { EngagementController, EngagementAdminController } from './engagement.controller';
import { EngagementProcessor } from './engagement.processor';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Notification } from './notification.entity';
import { NotificationsController } from './notifications.controller';
import { EMAIL_UPDATES_QUEUE, PUSH_NOTIFICATIONS_QUEUE } from '../jobs/jobs.module';
import { EmailUpdatesProcessor } from './email-updates.processor';
import { PushNotificationsProcessor } from './push-notifications.processor';

@Module({
  imports: [TypeOrmModule.forFeature([Notification]), BullModule.registerQueue({ name: EMAIL_UPDATES_QUEUE }, { name: PUSH_NOTIFICATIONS_QUEUE })],
  controllers: [NotificationsController, EngagementController, EngagementAdminController],
  providers: [EmailUpdatesProcessor, PushNotificationsProcessor, EngagementProcessor],
})
export class NotificationsModule {}
