import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { CurrentUser, AuthenticatedUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CompletePasswordResetDto, RequestPasswordResetDto, VerifyEmailDto } from './dto/auth-actions.dto';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() body: RegisterDto) {
    return this.authService.register(body.email, body.password, body.displayName);
  }

  @Post('login')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  login(@Body() body: LoginDto) {
    return this.authService.login(body.email, body.password);
  }

  @Get('session')
  @UseGuards(JwtAuthGuard)
  session(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getSession(user.id);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user.sessionId, user.id);
  }

  @Post('verify-email')
  verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authService.verifyEmail(body.token);
  }

  @Post('verify-email/resend')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resendVerification(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.resendVerification(user.id);
  }

  @Post('reset-password/request')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  requestPasswordReset(@Body() body: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(body.email);
  }

  @Post('reset-password/complete')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  completePasswordReset(@Body() body: CompletePasswordResetDto) {
    return this.authService.completePasswordReset(body.token, body.password);
  }
}
