import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeagueDivision } from './league-division.entity';
import { LeagueMembership } from './league-membership.entity';
import { LeagueSeason } from './league-season.entity';
import { LeaguesController } from './leagues.controller';
import { LeaguesService } from './leagues.service';

@Module({
  imports: [TypeOrmModule.forFeature([LeagueDivision, LeagueSeason, LeagueMembership])],
  controllers: [LeaguesController],
  providers: [LeaguesService],
})
export class LeaguesModule {}
