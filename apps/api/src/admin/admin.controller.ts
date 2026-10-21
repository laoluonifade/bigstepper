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
    return this.adminService.approvePayout(user.id, id, body.password);
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
    return this.adminService.reconcilePayments(user.id, body.password);
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
