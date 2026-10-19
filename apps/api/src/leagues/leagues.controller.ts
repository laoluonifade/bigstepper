import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LeaguesService } from './leagues.service';

/** Leagues are a runner's personal ranking: signed-in only. */
@Controller('leagues')
@UseGuards(JwtAuthGuard)
export class LeaguesController {
  constructor(private readonly leaguesService: LeaguesService) {}

  @Get()
  list() {
    return this.leaguesService.list();
  }

  @Get('me')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.leaguesService.mine(user.id);
  }

  @Get(':id/standings')
  standings(@Param('id', ParseUUIDPipe) id: string) {
    return this.leaguesService.standings(id);
  }
}
