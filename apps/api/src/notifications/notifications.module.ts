import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Notification } from './notification.entity';
import { NotificationsController } from './notifications.controller';
import { EMAIL_UPDATES_QUEUE } from '../jobs/jobs.module';
import { EmailUpdatesProcessor } from './email-updates.processor';

@Module({
  imports: [TypeOrmModule.forFeature([Notification]), BullModule.registerQueue({ name: EMAIL_UPDATES_QUEUE })],
  controllers: [NotificationsController],
  providers: [EmailUpdatesProcessor],
})
export class NotificationsModule {}
