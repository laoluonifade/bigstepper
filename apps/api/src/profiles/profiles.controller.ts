import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AccountDeletionService } from './account-deletion.service';
import { AVATAR_MAX_BYTES, ProfilesService } from './profiles.service';

@Controller()
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService, private readonly accountDeletion: AccountDeletionService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.profilesService.getMine(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMine(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateProfileDto) {
    return this.profilesService.updateMine(user.id, body);
  }

  /** Whether the account can be deleted right now, and if not, what to sort out first. */
  @Get('me/trophies')
  @UseGuards(JwtAuthGuard)
  myTrophies(@CurrentUser() user: AuthenticatedUser) {
    return this.profilesService.myTrophies(user.id);
  }

  @Get('me/deletion')
  @UseGuards(JwtAuthGuard)
  async deletionCheck(@CurrentUser() user: AuthenticatedUser) {
    const blocker = await this.accountDeletion.blocker(user.id);
    return { canDelete: !blocker, blocker };
  }

  /** Deletes the account for good. The runner confirms by typing DELETE. */
  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  deleteMine(@CurrentUser() user: AuthenticatedUser, @Body() body: { confirm?: unknown }) {
    if (body?.confirm !== 'DELETE') throw new BadRequestException('Type DELETE to confirm');
    return this.accountDeletion.delete(user.id);
  }

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }))
  setAvatar(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number }) {
    return this.profilesService.setAvatar(user.id, file);
  }

  @Delete('me/avatar')
  @UseGuards(JwtAuthGuard)
  removeAvatar(@CurrentUser() user: AuthenticatedUser) {
    return this.profilesService.removeAvatar(user.id);
  }

  @Get('users/search')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  search(@CurrentUser() user: AuthenticatedUser, @Query('q') query?: string) {
    return this.profilesService.search(query ?? '', user.id);
  }

  @Get('users/:username')
  @UseGuards(OptionalJwtAuthGuard)
  getPublic(@Param('username') username: string, @CurrentUser() viewer: AuthenticatedUser | null) {
    return this.profilesService.getPublic(username, viewer?.id);
  }

  /** Someone's trophy cabinet: podium finishes in finished competitions. Public, like their profile. */
  @Get('users/:username/trophies')
  trophies(@Param('username') username: string) {
    return this.profilesService.trophies(username);
  }

  @Get('users/:username/followers')
  @UseGuards(OptionalJwtAuthGuard)
  followers(@Param('username') username: string, @CurrentUser() viewer: AuthenticatedUser | null) {
    return this.profilesService.connections(username, 'followers', viewer?.id);
  }

  @Get('users/:username/following')
  @UseGuards(OptionalJwtAuthGuard)
  following(@Param('username') username: string, @CurrentUser() viewer: AuthenticatedUser | null) {
    return this.profilesService.connections(username, 'following', viewer?.id);
  }

  @Post('users/:username/follow')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  follow(@CurrentUser() user: AuthenticatedUser, @Param('username') username: string) {
    return this.profilesService.follow(user.id, username);
  }

  @Delete('users/:username/follow')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  unfollow(@CurrentUser() user: AuthenticatedUser, @Param('username') username: string) {
    return this.profilesService.unfollow(user.id, username);
  }
}
