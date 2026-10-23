import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Profile } from '../profiles/profile.entity';
import { CloudinaryService } from '../profiles/cloudinary.service';
import { ClubMembership } from './club-membership.entity';
import { Club } from './club.entity';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';

@Module({
  imports: [TypeOrmModule.forFeature([Club, ClubMembership, Profile])],
  controllers: [ClubsController],
  providers: [ClubsService, CloudinaryService],
})
export class ClubsModule {}
