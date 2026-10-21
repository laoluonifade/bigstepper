import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTableDto } from './dto/create-table.dto';
import { TablesService } from './tables.service';
import { CreateCreatorPaidChallengeDto } from '../admin/paid-table.dto';
import { InviteRunnerDto } from './dto/invite-runner.dto';
import { RespondInvitationDto } from './dto/respond-invitation.dto';
import { Throttle } from '@nestjs/throttler';

@Controller(['tables', 'challenges'])
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  list(@Query('sort') sort?: string, @Query('type') type?: string, @Query('activity') activity?: string) {
    return this.tablesService.list(sort, type, activity);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateTableDto) {
    return this.tablesService.create(user.id, body);
  }

  @Post('paid-drafts')
  @UseGuards(JwtAuthGuard)
  createPaidDraft(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateCreatorPaidChallengeDto) {
    return this.tablesService.createPaidDraft(user.id, body);
  }

  @Post(':id/register-free')
  @UseGuards(JwtAuthGuard)
  registerFree(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) tableId: string,
  ) {
    return this.tablesService.registerFree(tableId, user.id);
  }

  /** Challenges the runner created or joined, newest first. Declared before `:code` so "mine" isn't read as a code. */
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.tablesService.mine(user.id);
  }

  @Get('eligible')
  @UseGuards(JwtAuthGuard)
  eligible(@CurrentUser() user: AuthenticatedUser, @Query('activity') activity?: string) {
    return this.tablesService.eligible(user.id, activity);
  }

  @Get(':id/standings')
  standings(@Param('id', ParseUUIDPipe) tableId: string) {
    return this.tablesService.standings(tableId);
  }

  @Get(':id/registration')
  @UseGuards(JwtAuthGuard)
  registration(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) tableId: string) {
    return this.tablesService.registration(tableId, user.id);
  }

  @Get(':id/invitations')
  @UseGuards(JwtAuthGuard)
  invitations(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) tableId: string) {
    return this.tablesService.invitations(tableId, user.id);
  }

  @Post(':id/invitations')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  inviteRunner(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) tableId: string, @Body() body: InviteRunnerDto) {
    return this.tablesService.inviteRunner(tableId, user.id, body.username);
  }

  @Post('invitations/:id/respond')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  respondToInvitation(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: RespondInvitationDto) {
    return this.tablesService.respondToInvitation(id, user.id, body.decision);
  }

  @Get(':code')
  getByCode(@Param('code') code: string) {
    return this.tablesService.getByCode(code);
  }

  @Get(':id/result/final')
  result(@Param('id', ParseUUIDPipe) id: string) {
    return this.tablesService.result(id);
  }
}
