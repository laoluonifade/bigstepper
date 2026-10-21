import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CHALLENGE_REMINDERS_QUEUE } from '../jobs/jobs.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompetitionTable } from './competition-table.entity';
import { TableRegistration } from './table-registration.entity';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';
import { ChallengeRemindersProcessor } from './challenge-reminders.processor';

@Module({
  imports: [TypeOrmModule.forFeature([CompetitionTable, TableRegistration]), BullModule.registerQueue({ name: CHALLENGE_REMINDERS_QUEUE })],
  controllers: [TablesController],
  providers: [TablesService, ChallengeRemindersProcessor],
})
export class TablesModule {}
