import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
@UseGuards(OptionalJwtAuthGuard)
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  board(
    @CurrentUser() user: AuthenticatedUser | null,
    @Query('activity') activity?: string, @Query('period') period?: string, @Query('scope') scope?: string, @Query('limit') limit?: string,
  ) {
    return this.leaderboard.board(user?.id ?? null, activity, period, scope, limit);
  }
}
