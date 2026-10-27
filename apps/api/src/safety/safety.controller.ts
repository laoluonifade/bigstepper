import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminOnlyGuard } from '../admin/admin-only.guard';
import { PrivilegedGuard } from '../admin/privileged.guard';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateReportDto, LiftSuspensionDto, ResolveReportDto } from './safety.dto';
import { SafetyService } from './safety.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Post('blocks/:username')
  @HttpCode(200)
  block(@CurrentUser() user: AuthenticatedUser, @Param('username') username: string) {
    return this.safety.block(user.id, username);
  }

  @Delete('blocks/:username')
  unblock(@CurrentUser() user: AuthenticatedUser, @Param('username') username: string) {
    return this.safety.unblock(user.id, username);
  }

  @Get('me/blocks')
  blocks(@CurrentUser() user: AuthenticatedUser) {
    return this.safety.blocks(user.id);
  }

  @Post('reports')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  report(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateReportDto) {
    return this.safety.report(user.id, body);
  }
}

@Controller('admin')
@UseGuards(JwtAuthGuard, PrivilegedGuard)
export class SafetyAdminController {
  constructor(private readonly safety: SafetyService) {}

  @Get('reports')
  reports(@Query('status') status = 'open') {
    return this.safety.reports(status);
  }

  @Post('reports/:id/resolve')
  @UseGuards(AdminOnlyGuard)
  resolve(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: ResolveReportDto) {
    return this.safety.resolve(user.id, id, body);
  }

  @Post('suspensions/lift')
  @UseGuards(AdminOnlyGuard)
  lift(@CurrentUser() user: AuthenticatedUser, @Body() body: LiftSuspensionDto) {
    return this.safety.liftSuspension(user.id, body.userId, body.reason);
  }
}
