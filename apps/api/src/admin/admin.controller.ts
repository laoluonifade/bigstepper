import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from './admin.service';
import { PrivilegedGuard } from './privileged.guard';
import { ResolveReviewDto } from './resolve-review.dto';
import { SettleTableDto } from './settle-table.dto';
import { ApprovePaidTableDto, CreatePaidTableDto } from './paid-table.dto';
import { AdminOnlyGuard } from './admin-only.guard';
import { UpdateUserEligibilityDto } from './user-eligibility.dto';
import { ConfirmAdminActionDto } from './confirm-admin-action.dto';
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
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  approvePayout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ConfirmAdminActionDto,
  ) {
    return this.adminService.approvePayout(user.id, id, body.password);
  }

  @Post('payouts/:id/execute')
  @UseGuards(AdminOnlyGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  executePayout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ConfirmAdminActionDto,
  ) {
    return this.adminService.executePayout(user.id, id, body.password);
  }

  @Post('payments/reconciliation')
  @UseGuards(AdminOnlyGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  reconcilePayments(@CurrentUser() user: AuthenticatedUser, @Body() body: ConfirmAdminActionDto) {
    return this.adminService.reconcilePayments(user.id, body.password);
  }

  @Get('users')
  users(@Query('search') search?: string) {
    return this.adminService.users(search);
  }

  @Patch('users/:id/eligibility')
  updateEligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserEligibilityDto,
  ) {
    return this.adminService.updateEligibility(user.id, id, body);
  }
}
