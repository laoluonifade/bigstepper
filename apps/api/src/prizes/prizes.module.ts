import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PRODUCT_PRIZES_QUEUE } from '../jobs/jobs.module';
import { PrizeAwardsService } from './prize-awards.service';
import { ProductPrizesProcessor } from './product-prizes.processor';
import { PrizesController } from './prizes.controller';

@Module({
  imports: [BullModule.registerQueue({ name: PRODUCT_PRIZES_QUEUE })],
  controllers: [PrizesController],
  providers: [PrizeAwardsService, ProductPrizesProcessor],
  exports: [PrizeAwardsService],
})
export class PrizesModule {}
