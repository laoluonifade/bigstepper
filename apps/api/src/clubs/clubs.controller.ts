import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { anonKey, type ViewRequest } from './engagement';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { AVATAR_MAX_BYTES } from '../profiles/profiles.service';
import { ClubsService } from './clubs.service';
import { ClubRoleDto, CreateClubDto, InviteToClubDto, JoinClubDto, UpdateClubDto } from './dto/create-club.dto';

class AddMemberDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  username?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

@Controller(['clubs', 'communities'])
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateClubDto) {
    return this.clubsService.create(user.id, body);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthenticatedUser, @Query('view') view?: string) {
    return this.clubsService.list(user.id, view === 'discover' ? 'discover' : 'mine');
  }

  /** Public: the club page, so an invite link works before signing up. */
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  get(@Param('id') id: string, @CurrentUser() viewer: AuthenticatedUser | null, @Req() req: ViewRequest, @Query('invite') invite?: string) {
    return this.clubsService.get(id, viewer?.id, invite, viewer ? null : anonKey(req.ip, String(req.headers['user-agent'] ?? '')));
  }

  /** Counts a share of the club page, for its dashboard. */
  @Post(':id/shared')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  shared(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: { channel?: string }) {
    return this.clubsService.shared(id, user.id, String(body?.channel ?? 'other'));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: UpdateClubDto) {
    return this.clubsService.update(user.id, id, body);
  }

  @Post(':id/logo')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }))
  setLogo(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @UploadedFile() file?: { buffer: Buffer; mimetype: string }) {
    return this.clubsService.setLogo(user.id, id, file);
  }

  @Delete(':id/logo')
  @UseGuards(JwtAuthGuard)
  removeLogo(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.clubsService.removeLogo(user.id, id);
  }

  @Get(':id/members')
  @UseGuards(OptionalJwtAuthGuard)
  members(@Param('id') id: string, @CurrentUser() viewer: AuthenticatedUser | null) {
    return this.clubsService.members(id, viewer?.id);
  }

  @Get(':id/competitions')
  @UseGuards(OptionalJwtAuthGuard)
  competitions(@Param('id') id: string, @CurrentUser() viewer: AuthenticatedUser | null) {
    return this.clubsService.competitions(id, viewer?.id);
  }

  @Get(':id/leaderboard')
  @UseGuards(JwtAuthGuard)
  leaderboard(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.clubsService.monthLeaderboard(user.id, id);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  join(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: JoinClubDto) {
    return this.clubsService.join(user.id, id, body.invite);
  }

  @Post(':id/follow')
  @UseGuards(JwtAuthGuard)
  follow(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.clubsService.follow(user.id, id, true);
  }

  @Delete(':id/follow')
  @UseGuards(JwtAuthGuard)
  unfollow(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.clubsService.follow(user.id, id, false);
  }

  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  leave(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.clubsService.leave(user.id, id);
  }

  @Post(':id/members')
  @UseGuards(JwtAuthGuard)
  addMember(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: AddMemberDto) {
    return this.clubsService.addMember(user.id, id, body);
  }

  @Patch(':id/members/:userId')
  @UseGuards(JwtAuthGuard)
  setRole(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('userId', ParseUUIDPipe) userId: string, @Body() body: ClubRoleDto) {
    return this.clubsService.setRole(user.id, id, userId, body.role);
  }

  @Delete(':id/members/:userId')
  @UseGuards(JwtAuthGuard)
  removeMember(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.clubsService.removeMember(user.id, id, userId);
  }

  @Post(':id/invites')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  invite(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: InviteToClubDto) {
    return this.clubsService.invite(user.id, id, body.emails);
  }

  @Post(':id/invite-code')
  @UseGuards(JwtAuthGuard)
  resetInvite(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.clubsService.resetInvite(user.id, id);
  }
}
