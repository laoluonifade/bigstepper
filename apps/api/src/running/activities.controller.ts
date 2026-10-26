import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActivitiesService } from './activities.service';
import { RequestReviewDto } from './dto/request-review.dto';

@Controller('activities')
@UseGuards(JwtAuthGuard)
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.activitiesService.list(user.id);
  }

  @Get('calendar')
  calendar(@CurrentUser() user: AuthenticatedUser, @Query('month') month?: string, @Query('tz') timeZone?: string) {
    return this.activitiesService.calendar(user.id, month, timeZone);
  }

  @Get(':id/credits')
  credits(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.activitiesService.credits(user.id, id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.activitiesService.view(user.id, id);
  }

  @Get(':id/track')
  track(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.activitiesService.track(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.activitiesService.remove(user.id, id);
  }

  @Post(':id/review-request')
  requestReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RequestReviewDto,
  ) {
    return this.activitiesService.requestReview(user.id, id, body.reason);
  }
}
