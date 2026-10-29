import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddSamplesDto } from './dto/add-samples.dto';
import { RunningService } from './running.service';
import { FinishRunDto, RunMomentDto } from './dto/run-moment.dto';
import { StartRunDto } from './dto/start-run.dto';

@Controller('runs')
@UseGuards(JwtAuthGuard)
@SkipThrottle()
export class RunningController {
  constructor(private readonly runningService: RunningService) {}

  @Get('active')
  getActive(@CurrentUser() user: AuthenticatedUser) {
    return this.runningService.getActive(user.id);
  }

  @Post('start')
  start(@CurrentUser() user: AuthenticatedUser, @Body() body?: StartRunDto) {
    return this.runningService.start(user.id, body?.activityType ?? 'run', { id: body?.id, startedAt: body?.startedAt });
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
    @Body() body?: FinishRunDto,
  ) {
    return this.runningService.finish(user.id, sessionId, body?.at, body?.sampleCount, { distanceMetres: body?.distanceMetres, deferred: body?.deferred });
  }

  @Post(':id/discard')
  discard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ) {
    return this.runningService.discard(user.id, sessionId);
  }

  @Post(':id/pause')
  pause(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() body?: RunMomentDto,
  ) {
    return this.runningService.pause(user.id, sessionId, body?.at);
  }

  @Post(':id/resume')
  resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() body?: RunMomentDto,
  ) {
    return this.runningService.resume(user.id, sessionId, body?.at);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ) {
    return this.runningService.get(user.id, sessionId);
  }
}
