import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateAwardDto } from '../prizes/dto/prizes.dto';
import { AVATAR_MAX_BYTES } from '../profiles/profiles.service';
import { ChallengeStudioService } from './challenge-studio.service';
import { CreateSeriesDto, DuplicateDto, EditDraftDto, PublishDto, UpdateSeriesDto } from './dto/club-challenge.dto';

/** What club managers use to run their own challenges, series and prizes. */
@Controller()
@UseGuards(JwtAuthGuard)
export class ChallengeStudioController {
  constructor(private readonly studio: ChallengeStudioService) {}

  @Patch('tables/:id/draft')
  editDraft(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: EditDraftDto) {
    return this.studio.editDraft(id, user.id, body);
  }

  @Post('tables/:id/publish')
  publish(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: PublishDto) {
    return this.studio.publish(id, user.id, body.at);
  }

  @Post('tables/:id/duplicate')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: DuplicateDto) {
    return this.studio.duplicate(id, user.id, body.startsAt);
  }

  @Get('clubs/:id/dashboard')
  dashboard(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.studio.dashboard(id, user.id);
  }

  @Post('clubs/:id/series')
  createSeries(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: CreateSeriesDto) {
    return this.studio.createSeries(id, user.id, body);
  }

  @Patch('series/:id')
  updateSeries(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateSeriesDto) {
    return this.studio.updateSeries(id, user.id, body);
  }

  @Get('series/:id/editions')
  editions(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.studio.seriesEditions(id, user.id);
  }

  @Post('series/:id/next')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  nextEdition(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.studio.nextEditionNow(id, user.id);
  }

  @Post('clubs/:id/prize-images')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }))
  prizeImage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @UploadedFile() file?: { buffer: Buffer; mimetype: string }) {
    return this.studio.uploadPrizeImage(id, user.id, file);
  }

  @Patch('club-awards/:id')
  updateAward(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateAwardDto) {
    return this.studio.updateAward(user.id, id, body.status, body);
  }
}
