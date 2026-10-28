import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CLUB_EVENTS_QUEUE } from '../jobs/jobs.module';
import { CloudinaryService } from '../profiles/cloudinary.service';
import { ClubEventsController } from './club-events.controller';
import { ClubEventsProcessor } from './club-events.processor';
import { ClubEventsRepository } from './club-events.repository';
import { ClubEventsService } from './club-events.service';

@Module({
  imports: [BullModule.registerQueue({ name: CLUB_EVENTS_QUEUE })],
  controllers: [ClubEventsController],
  providers: [ClubEventsService, ClubEventsRepository, ClubEventsProcessor, CloudinaryService],
})
export class ClubEventsModule {}
