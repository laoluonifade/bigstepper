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
import { ConfirmAdminActionDto, RejectPayoutDto } from './confirm-admin-action.dto';
import { Throttle } from '@nestjs/throttler';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { UpdateAwardDto } from '../sponsors/dto/sponsor.dto';

class VerifyDto {
  @IsBoolean() verified: boolean;
}

class AdminCreateSponsorDto {
  @IsIn(['brand', 'club']) kind: 'brand' | 'club';
  @IsString() @Length(2, 120) name: string;
  @IsEmail() ownerEmail: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(60) @Matches(/^[A-Z]{2}$/, { each: true }) deliveryCountries: string[];
}

class SponsorStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED']) status: 'ACTIVE' | 'SUSPENDED';
}

class ReviewSponsorshipDto {
  @IsIn(['APPROVE', 'REJECT']) decision: 'APPROVE' | 'REJECT';
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class ForfeitAwardDto {
  @IsString() @Length(5, 200) reason: string;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, PrivilegedGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('verification/reviews')
  pendingReviews() {
    return this.adminService.pendingReviews();
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

  /** Headline numbers for the whole platform, shown to admins in settings. */
  @Get('stats')
  @UseGuards(AdminOnlyGuard)
  stats() {
    return this.adminService.stats();
  }

  /** :person is a user ID or an @username (profile pages only know the username). */
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

  @Get('sponsors')
  @UseGuards(AdminOnlyGuard)
  sponsors(@Query('status') status?: string) {
    return this.adminService.sponsors(status);
  }

  @Post('sponsors')
  @UseGuards(AdminOnlyGuard)
  createSponsor(@CurrentUser() user: AuthenticatedUser, @Body() body: AdminCreateSponsorDto) {
    return this.adminService.createSponsor(user.id, body);
  }

  @Patch('sponsors/:id')
  @UseGuards(AdminOnlyGuard)
  setSponsorStatus(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: SponsorStatusDto) {
    return this.adminService.setSponsorStatus(user.id, id, body.status);
  }

  @Get('sponsorships')
  @UseGuards(AdminOnlyGuard)
  sponsorships(@Query('view') view?: string) {
    return this.adminService.sponsorships(view === 'live' || view === 'decided' ? view : 'pending');
  }

  @Post('sponsorships/:id/review')
  @UseGuards(AdminOnlyGuard)
  reviewSponsorship(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: ReviewSponsorshipDto) {
    return this.adminService.reviewSponsorship(user.id, id, body.decision, body.reason);
  }

  @Post('sponsorships/:id/finalize')
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

  /** Approves and sends: the Paystack transfer starts as soon as this succeeds. */
  @Post('payouts/:id/approve')
  @UseGuards(AdminOnlyGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  approvePayout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ConfirmAdminActionDto,
  ) {
    return this.adminService.approvePayout(user.id, id, body.code);
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
