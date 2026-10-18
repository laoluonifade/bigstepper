import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddSamplesDto } from './dto/add-samples.dto';
import { RunningService } from './running.service';
import { StartRunDto } from './dto/start-run.dto';

@Controller('runs')
@UseGuards(JwtAuthGuard)
export class RunningController {
  constructor(private readonly runningService: RunningService) {}

  @Post('start')
  start(@CurrentUser() user: AuthenticatedUser, @Body() body?: StartRunDto) {
    return this.runningService.start(user.id, body?.activityType ?? 'run');
  }

  @Post(':id/samples')
  addSamples(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() body: AddSamplesDto,
  ) {
    return this.runningService.addSamples(user.id, sessionId, body.samples);
  }

  @Post(':id/finish')
  finish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ) {
    return this.runningService.finish(user.id, sessionId);
  }

  @Post(':id/pause')
  pause(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ) {
    return this.runningService.pause(user.id, sessionId);
  }

  @Post(':id/resume')
  resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ) {
    return this.runningService.resume(user.id, sessionId);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ) {
    return this.runningService.get(user.id, sessionId);
  }
}
