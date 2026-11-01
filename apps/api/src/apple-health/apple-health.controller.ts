import { Body, Controller, DefaultValuePipe, Delete, Get, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AppleHealthSettingsDto, AppleHealthWorkoutDto, DailyStepsSyncDto } from './apple-health.dto';
import { AppleHealthService } from './apple-health.service';

@Controller('apple-health')
@UseGuards(JwtAuthGuard)
export class AppleHealthController {
  constructor(private readonly appleHealth: AppleHealthService) {}

  @Get()
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.appleHealth.status(user.id);
  }

  @Get('days')
  days(@CurrentUser() user: AuthenticatedUser, @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number) {
    return this.appleHealth.days(user.id, Math.min(Math.max(limit, 1), 60));
  }

  @Patch()
  settings(@CurrentUser() user: AuthenticatedUser, @Body() body: AppleHealthSettingsDto) {
    return this.appleHealth.settings(user.id, body.shareSteps);
  }

  @Post('connect')
  connect(@CurrentUser() user: AuthenticatedUser) {
    return this.appleHealth.connect(user.id);
  }

  @Post('synced')
  synced(@CurrentUser() user: AuthenticatedUser) {
    return this.appleHealth.synced(user.id);
  }

  @Post('steps')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  dailySteps(@CurrentUser() user: AuthenticatedUser, @Body() body: DailyStepsSyncDto) {
    return this.appleHealth.saveDailySteps(user.id, body.days, body.timeZone);
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
