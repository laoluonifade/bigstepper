import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminOnlyGuard } from '../admin/admin-only.guard';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AmlAdminService } from './aml-admin.service';
import { AmlMonitorService } from './aml-monitor.service';
import { EscalateDto, PayoutHoldDto, ReviewFlagDto, SubmitKycDto, UpdateAmlSettingsDto } from './aml.dto';
import { AmlService } from './aml.service';

@Controller('me/kyc')
@UseGuards(JwtAuthGuard)
export class KycController {
  constructor(private readonly aml: AmlService) {}

  @Get() status(@CurrentUser() user: AuthenticatedUser) {
    return this.aml.kycStatus(user.id);
  }

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  submit(@CurrentUser() user: AuthenticatedUser, @Body() body: SubmitKycDto) {
    return this.aml.submitKyc(user.id, body);
  }
}

/** The admin console's Risk area. */
@Controller('admin/risk')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class RiskAdminController {
  constructor(private readonly aml: AmlService, private readonly admin: AmlAdminService, private readonly monitor: AmlMonitorService) {}

  @Get('overview') overview() {
    return this.admin.overview();
  }

  @Get('flags') flags(@Query('status') status?: string) {
    return this.admin.listFlags(['OPEN', 'ESCALATED', 'CONFIRMED', 'DISMISSED'].includes(status ?? '') ? status! : status === 'all' ? 'all' : 'OPEN');
  }

  @Post('flags/:id/review') review(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: ReviewFlagDto) {
    return this.admin.reviewFlag(user.id, id, body.decision, body.note);
  }

  @Get('users/:id') profile(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.userProfile(id);
  }

  @Post('users/:id/hold') async hold(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: PayoutHoldDto) {
    await this.aml.assertUser(id);
    return this.aml.setHold(user.id, id, body.hold, body.note);
  }

  @Post('payouts/:id/escalate') escalate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: EscalateDto) {
    return this.aml.escalatePayout(user.id, id, body.note);
  }

  @Get('settings') settings() {
    return this.aml.settings();
  }

  @Patch('settings') updateSettings(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateAmlSettingsDto) {
    return this.aml.updateSettings(user.id, body.values);
  }

  @Get('audit') audit(@Query('target') targetId?: string, @Query('action') action?: string) {
    return this.admin.auditLog({ targetId: targetId || undefined, action: action || undefined });
  }

  /** Runs the monitoring rules now instead of waiting for the hourly scan. */
  @Post('scan')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  scan() {
    return this.monitor.scan();
  }
}
