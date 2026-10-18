import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClubMembership } from './club-membership.entity';
import { Club } from './club.entity';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';

@Module({
  imports: [TypeOrmModule.forFeature([Club, ClubMembership])],
  controllers: [ClubsController],
  providers: [ClubsService],
})
export class ClubsModule {}
