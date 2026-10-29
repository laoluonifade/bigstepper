import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from './admin.service';
import { PrivilegedGuard } from './privileged.guard';
import { ResolveReviewDto } from './resolve-review.dto';
import { SettleTableDto } from './settle-table.dto';
import { ApprovePaidTableDto, CreatePaidTableDto } from './paid-table.dto';
import { AdminOnlyGuard } from './admin-only.guard';
import { ReviewCreatorDto } from './review-creator.dto';
import { ApprovePayoutDto, ConfirmAdminActionDto, RejectPayoutDto } from './confirm-admin-action.dto';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';
import { UpdateAwardDto } from '../prizes/dto/prizes.dto';

class VerifyDto {
  @IsBoolean() verified: boolean;
}

class ModerateClubDto {
  @IsOptional() @IsBoolean() suspended?: boolean;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
  @IsOptional() @IsIn(['free', 'pro']) plan?: 'free' | 'pro';
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsDateString() planRenewsAt?: string | null;
}

class TakeDownDto {
  @IsString() @Length(5, 300) reason: string;
}

class PromoteDto {
  @ValidateIf((_, value) => value !== null) @IsDateString() until: string | null;
}

class ForfeitAwardDto {
  @IsString() @Length(5, 200) reason: string;
}

@Controller('admin')
class SettleFlagDto {
  @IsIn(['CLEAR', 'REJECT']) decision: 'CLEAR' | 'REJECT';
}

@UseGuards(JwtAuthGuard, PrivilegedGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('verification/reviews')
  pendingReviews() {
    return this.adminService.pendingReviews();
  }

  @Get('verification/flags')
  flaggedRuns() {
    return this.adminService.flaggedRuns();
  }

  @Post('verification/flags/:activity')
  settleFlag(@CurrentUser() user: AuthenticatedUser, @Param('activity', ParseUUIDPipe) activityId: string, @Body() body: SettleFlagDto) {
    return this.adminService.settleFlag(user.id, activityId, body.decision);
  }

  @Post('verification/recheck')
  recheck(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.recheckFlagged(user.id);
  }

  @Patch('verification/reviews/:id')
  resolveReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResolveReviewDto,
  ) {
    return this.adminService.resolveReview(user.id, id, body);
  }

  @Patch('settlements')
  settle(@CurrentUser() user: AuthenticatedUser, @Body() body: SettleTableDto) {
    return this.adminService.settleTable(user.id, body.tableId);
  }

  @Post('tables/paid-drafts')
  createPaidDraft(@CurrentUser() user: AuthenticatedUser, @Body() body: CreatePaidTableDto) {
    return this.adminService.createPaidDraft(user.id, body);
  }

  @Get('stats')
  @UseGuards(AdminOnlyGuard)
  stats() {
    return this.adminService.stats();
  }

  @Get('analytics')
  @UseGuards(AdminOnlyGuard)
  analytics(@Query('days') days?: string) {
    return this.adminService.analytics(days);
  }

  @Patch('people/:person/verified')
  @UseGuards(AdminOnlyGuard)
  verifyPerson(@CurrentUser() user: AuthenticatedUser, @Param('person') person: string, @Body() body: VerifyDto) {
    return this.adminService.verifyPerson(user.id, person, body.verified);
  }

  @Patch('clubs/:clubId/verified')
  @UseGuards(AdminOnlyGuard)
  verifyClub(@CurrentUser() user: AuthenticatedUser, @Param('clubId', ParseUUIDPipe) clubId: string, @Body() body: VerifyDto) {
    return this.adminService.verifyClub(user.id, clubId, body.verified);
  }

  @Patch('clubs/:clubId')
  @UseGuards(AdminOnlyGuard)
  moderateClub(@CurrentUser() user: AuthenticatedUser, @Param('clubId', ParseUUIDPipe) clubId: string, @Body() body: ModerateClubDto) {
    return this.adminService.moderateClub(user.id, clubId, body);
  }

  @Post('tables/:id/take-down')
  @UseGuards(AdminOnlyGuard)
  takeDown(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: TakeDownDto) {
    return this.adminService.takeDownChallenge(user.id, id, body.reason);
  }

  @Post('tables/:id/promote')
  @UseGuards(AdminOnlyGuard)
  promote(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: PromoteDto) {
    return this.adminService.promoteChallenge(user.id, id, body.until);
  }

  @Post('tables/:id/finalize-prizes')
  @UseGuards(AdminOnlyGuard)
  finalizePrizes(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.finalizePrizes(user.id, id);
  }

  @Get('prize-awards')
  @UseGuards(AdminOnlyGuard)
  prizeAwards(@Query('status') status?: string) {
    return this.adminService.prizeAwards(status);
  }

  @Patch('prize-awards/:id')
  @UseGuards(AdminOnlyGuard)
  updatePrizeAward(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateAwardDto) {
    return this.adminService.updatePrizeAward(user.id, id, body.status, body);
  }

  @Post('prize-awards/:id/forfeit')
  @UseGuards(AdminOnlyGuard)
  forfeitPrizeAward(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: ForfeitAwardDto) {
    return this.adminService.forfeitPrizeAward(user.id, id, body.reason);
  }

  @Get('clubs')
  @UseGuards(AdminOnlyGuard)
  clubs(@Query('q') q?: string, @Query('verified') verified?: string, @Query('offset') offset?: string) {
    return this.adminService.clubs({ q, verified: verified === 'true', offset: Number(offset) || 0 });
  }

  @Get('people')
  @UseGuards(AdminOnlyGuard)
  people(@Query('view') view?: string, @Query('q') q?: string, @Query('offset') offset?: string) {
    return this.adminService.people({ view, q, offset: Number(offset) || 0 });
  }

  @Get('tables/paid-drafts')
  @UseGuards(AdminOnlyGuard)
  paidDrafts(@Query('view') view?: string) {
    return this.adminService.paidChallenges(view === 'approved' ? 'approved' : 'pending');
  }

  @Post('tables/:id/approve-paid')
  @UseGuards(AdminOnlyGuard)
  approvePaid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApprovePaidTableDto,
  ) {
    return this.adminService.approvePaidTable(user.id, id, body);
  }

  @Post('payouts/:id/approve')
  @UseGuards(AdminOnlyGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  approvePayout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApprovePayoutDto,
  ) {
    return this.adminService.approvePayout(user.id, id, body.code, body.note);
  }

  @Get('payouts')
  @UseGuards(AdminOnlyGuard)
  payouts(@Query('view') view?: string) {
    return this.adminService.payouts(view === 'history' ? 'history' : 'pending');
  }

  @Get('charity-allocations')
  @UseGuards(AdminOnlyGuard)
  charityAllocations() {
    return this.adminService.charityAllocations();
  }

  @Post('payouts/:id/reject')
  @UseGuards(AdminOnlyGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  rejectPayout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectPayoutDto,
  ) {
    return this.adminService.rejectPayout(user.id, id, body.reason);
  }

  @Post('payments/reconciliation')
  @UseGuards(AdminOnlyGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  reconcilePayments(@CurrentUser() user: AuthenticatedUser, @Body() body: ConfirmAdminActionDto) {
    return this.adminService.reconcilePayments(user.id, body.code);
  }

  @Get('creators')
  @UseGuards(AdminOnlyGuard)
  creators(@Query('view') view?: string) {
    return this.adminService.creators(view === 'active' || view === 'suspended' ? view : 'pending');
  }

  @Patch('creators/:id')
  @UseGuards(AdminOnlyGuard)
  reviewCreator(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReviewCreatorDto,
  ) {
    return this.adminService.reviewCreator(user.id, id, body.status);
  }
}
