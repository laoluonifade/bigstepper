import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CHALLENGE_REMINDERS_QUEUE, CLUB_CHALLENGES_QUEUE } from '../jobs/jobs.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrizesModule } from '../prizes/prizes.module';
import { CloudinaryService } from '../profiles/cloudinary.service';
import { CompetitionTable } from './competition-table.entity';
import { TableRegistration } from './table-registration.entity';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';
import { ChallengeRemindersProcessor } from './challenge-reminders.processor';
import { ChallengeStudioController } from './challenge-studio.controller';
import { ChallengeStudioService } from './challenge-studio.service';
import { ClubChallengesProcessor } from './club-challenges.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([CompetitionTable, TableRegistration]),
    BullModule.registerQueue({ name: CHALLENGE_REMINDERS_QUEUE }, { name: CLUB_CHALLENGES_QUEUE }),
    PrizesModule,
  ],
  controllers: [TablesController, ChallengeStudioController],
  providers: [TablesService, ChallengeRemindersProcessor, ChallengeStudioService, ClubChallengesProcessor, CloudinaryService],
})
export class TablesModule {}
