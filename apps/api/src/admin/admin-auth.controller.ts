import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, Matches } from 'class-validator';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { PrivilegedGuard } from './privileged.guard';

class RequestCodeDto {
  @IsEmail() email: string;
}

class VerifyCodeDto {
  @IsEmail() email: string;
  @IsString() @Matches(/^\s*\d{6}\s*$/) code: string;
}

@Controller('admin-auth')
export class AdminAuthController {
  constructor(private readonly adminAuth: AdminAuthService) {}

  @Post('code')
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  requestCode(@Body() body: RequestCodeDto) {
    return this.adminAuth.requestLoginCode(body.email);
  }

  @Post('verify')
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  verify(@Body() body: VerifyCodeDto) {
    return this.adminAuth.verifyLogin(body.email, body.code);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, PrivilegedGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.adminAuth.me(user.id);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard, PrivilegedGuard)
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.adminAuth.logout(user.sessionId, user.id);
  }

  /** A code to confirm a money action (payout approval, reconciliation). */
  @Post('confirm-code')
  @UseGuards(JwtAuthGuard, PrivilegedGuard)
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  confirmCode(@CurrentUser() user: AuthenticatedUser) {
    return this.adminAuth.requestConfirmCode(user.id);
  }
}
