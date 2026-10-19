import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { LEAGUE_SEASONS_QUEUE } from '../jobs/jobs.module';
import { Profile } from '../profiles/profile.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeagueDivision } from './league-division.entity';
import { LeagueMembership } from './league-membership.entity';
import { LeagueSeason } from './league-season.entity';
import { LeaguesController } from './leagues.controller';
import { LeaguesService } from './leagues.service';
import { LeagueSeasonsProcessor } from './league-seasons.processor';
import { LeagueSeasonsService } from './league-seasons.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeagueDivision, LeagueSeason, LeagueMembership, Profile]),
    BullModule.registerQueue({ name: LEAGUE_SEASONS_QUEUE }),
  ],
  controllers: [LeaguesController],
  providers: [LeaguesService, LeagueSeasonsService, LeagueSeasonsProcessor],
})
export class LeaguesModule {}
