import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PRODUCT_PRIZES_QUEUE } from '../jobs/jobs.module';
import { CloudinaryService } from '../profiles/cloudinary.service';
import { PrizeAwardsService } from './prize-awards.service';
import { ProductPrizesProcessor } from './product-prizes.processor';
import { PrizesController, SponsorsController } from './sponsors.controller';
import { SponsorsService } from './sponsors.service';

@Module({
  imports: [BullModule.registerQueue({ name: PRODUCT_PRIZES_QUEUE })],
  controllers: [SponsorsController, PrizesController],
  providers: [SponsorsService, PrizeAwardsService, ProductPrizesProcessor, CloudinaryService],
  exports: [SponsorsService, PrizeAwardsService],
})
export class SponsorsModule {}
