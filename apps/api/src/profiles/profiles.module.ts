import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Profile } from './profile.entity';
import { ProfilesController } from './profiles.controller';
import { AccountDeletionService } from './account-deletion.service';
import { ProfilesService } from './profiles.service';
import { CloudinaryService } from './cloudinary.service';

@Module({
  imports: [TypeOrmModule.forFeature([Profile])],
  controllers: [ProfilesController],
  providers: [ProfilesService, CloudinaryService, AccountDeletionService],
})
export class ProfilesModule {}
