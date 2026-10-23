import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WinnerDetailsDto } from './dto/prizes.dto';
import { PrizeAwardsService } from './prize-awards.service';

/** Winners: their prizes, and the claim form. */
@Controller('prizes')
@UseGuards(JwtAuthGuard)
export class PrizesController {
  constructor(private readonly awards: PrizeAwardsService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.awards.mine(user.id);
  }

  @Post(':id/details')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: WinnerDetailsDto) {
    return this.awards.submitDetails(user.id, id, body);
  }
}
