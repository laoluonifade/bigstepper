import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AppleHealthWorkoutDto } from './apple-health.dto';
import { AppleHealthService } from './apple-health.service';

@Controller('apple-health')
@UseGuards(JwtAuthGuard)
export class AppleHealthController {
  constructor(private readonly appleHealth: AppleHealthService) {}

  @Get()
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.appleHealth.status(user.id);
  }

  @Post('connect')
  connect(@CurrentUser() user: AuthenticatedUser) {
    return this.appleHealth.connect(user.id);
  }

  @Post('synced')
  synced(@CurrentUser() user: AuthenticatedUser) {
    return this.appleHealth.synced(user.id);
  }

  @Post('workouts')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  importWorkout(@CurrentUser() user: AuthenticatedUser, @Body() body: AppleHealthWorkoutDto) {
    return this.appleHealth.importWorkout(user.id, body);
  }

  @Delete()
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.appleHealth.disconnect(user.id);
  }
}
