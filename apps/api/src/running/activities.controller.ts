import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
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

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.activitiesService.get(user.id, id);
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
