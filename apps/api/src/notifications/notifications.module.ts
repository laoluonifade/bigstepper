import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Notification } from './notification.entity';
import { NotificationsController } from './notifications.controller';
import { EMAIL_UPDATES_QUEUE, PUSH_NOTIFICATIONS_QUEUE } from '../jobs/jobs.module';
import { EmailUpdatesProcessor } from './email-updates.processor';
import { PushNotificationsProcessor } from './push-notifications.processor';
import { TablesModule } from '../tables/tables.module';

@Module({
  imports: [TypeOrmModule.forFeature([Notification]), BullModule.registerQueue({ name: EMAIL_UPDATES_QUEUE }, { name: PUSH_NOTIFICATIONS_QUEUE }), TablesModule],
  controllers: [NotificationsController],
  providers: [EmailUpdatesProcessor, PushNotificationsProcessor],
})
export class NotificationsModule {}
