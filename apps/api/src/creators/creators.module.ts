import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreatorProfile } from './creator-profile.entity';
import { CreatorsController } from './creators.controller';
import { CreatorsService } from './creators.service';

@Module({
  imports: [TypeOrmModule.forFeature([CreatorProfile])],
  controllers: [CreatorsController],
  providers: [CreatorsService],
})
export class CreatorsModule {}
