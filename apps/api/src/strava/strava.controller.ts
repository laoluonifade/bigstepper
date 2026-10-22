import { Body, Controller, Delete, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StravaCodeDto, StravaSignupDto } from './strava.dto';
import { StravaService } from './strava.service';

@Controller('strava')
export class StravaController {
  constructor(private readonly strava: StravaService) {}

  @Get('config')
  config() {
    return this.strava.publicConfig();
  }

  @Post('login')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  login(@Body() body: StravaCodeDto) {
    return this.strava.login(body.code, body.scope);
  }

  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  signup(@Body() body: StravaSignupDto) {
    return this.strava.completeSignup(body.signupToken, body.email, body.countryCode, body.whatsappNumber);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.strava.status(user.id);
  }

  @Post('connect')
  @UseGuards(JwtAuthGuard)
  connect(@CurrentUser() user: AuthenticatedUser, @Body() body: StravaCodeDto) {
    return this.strava.connect(user.id, body.code, body.scope);
  }

  @Post('sync')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  sync(@CurrentUser() user: AuthenticatedUser) {
    return this.strava.sync(user.id);
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.strava.disconnect(user.id);
  }

  /** Strava calls this once when the webhook subscription is created. */
  @Get('webhook')
  @SkipThrottle()
  verifyWebhook(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string) {
    return this.strava.verifyWebhook(mode, token, challenge);
  }

  /** Strava needs a 200 within two seconds, so the work happens after replying. */
  @Post('webhook')
  @SkipThrottle()
  @HttpCode(200)
  webhook(@Body() event: Parameters<StravaService['handleEvent']>[0]) {
    void this.strava.handleEvent(event).catch(() => undefined);
    return { ok: true };
  }
}
