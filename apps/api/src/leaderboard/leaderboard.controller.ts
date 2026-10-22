import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  board(
    @CurrentUser() user: AuthenticatedUser,
    @Query('activity') activity?: string, @Query('period') period?: string, @Query('scope') scope?: string, @Query('limit') limit?: string,
  ) {
    return this.leaderboard.board(user.id, activity, period, scope, limit);
  }
}
