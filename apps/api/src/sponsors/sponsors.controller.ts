import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AVATAR_MAX_BYTES } from '../profiles/profiles.service';
import { AddSponsorMemberDto, ApplySponsorDto, UpdateAwardDto, UpdateSponsorDto, WinnerDetailsDto } from './dto/sponsor.dto';
import { PrizeAwardsService } from './prize-awards.service';
import { SponsorsService } from './sponsors.service';

@Controller('sponsors')
export class SponsorsController {
  constructor(private readonly sponsors: SponsorsService, private readonly awards: PrizeAwardsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  apply(@CurrentUser() user: AuthenticatedUser, @Body() body: ApplySponsorDto) {
    return this.sponsors.apply(user.id, body);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.sponsors.mine(user.id);
  }

  @Get('profile/:slug')
  profile(@Param('slug') slug: string) {
    return this.sponsors.publicProfile(slug);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateSponsorDto) {
    return this.sponsors.update(user.id, id, body);
  }

  /** ?kind=logo saves it as the sponsor's logo; ?kind=prize just returns the URL for a prize. */
  @Post(':id/images')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }))
  upload(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Query('kind') kind: string, @UploadedFile() file?: { buffer: Buffer; mimetype: string }) {
    return this.sponsors.uploadImage(user.id, id, kind === 'logo' ? 'logo' : 'prize', file);
  }

  @Post(':id/members')
  @UseGuards(JwtAuthGuard)
  addMember(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: AddSponsorMemberDto) {
    return this.sponsors.addMember(user.id, id, body);
  }

  @Get(':id/dashboard')
  @UseGuards(JwtAuthGuard)
  dashboard(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sponsors.dashboard(user.id, id);
  }

  @Patch('awards/:awardId')
  @UseGuards(JwtAuthGuard)
  updateAward(@CurrentUser() user: AuthenticatedUser, @Param('awardId', ParseUUIDPipe) awardId: string, @Body() body: UpdateAwardDto) {
    return this.awards.updateStatus(awardId, body.status, body, { sponsorUserId: user.id });
  }
}

/** Winners: their prizes, and sending delivery details. */
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
