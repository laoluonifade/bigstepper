import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DUELS_QUEUE } from '../jobs/jobs.module';
import { DuelsController } from './duels.controller';
import { DuelsProcessor } from './duels.processor';
import { DuelsRepository } from './duels.repository';
import { DuelsService } from './duels.service';

@Module({
  imports: [BullModule.registerQueue({ name: DUELS_QUEUE })],
  controllers: [DuelsController],
  providers: [DuelsService, DuelsRepository, DuelsProcessor],
})
export class DuelsModule {}
