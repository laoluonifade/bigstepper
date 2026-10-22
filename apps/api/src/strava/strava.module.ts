import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ACTIVITY_VERIFICATION_QUEUE } from '../jobs/jobs.module';
import { StravaAccount } from './strava-account.entity';
import { StravaController } from './strava.controller';
import { StravaService } from './strava.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([StravaAccount]),
    BullModule.registerQueue({ name: ACTIVITY_VERIFICATION_QUEUE }),
    AuthModule,
  ],
  controllers: [StravaController],
  providers: [StravaService],
})
export class StravaModule {}
