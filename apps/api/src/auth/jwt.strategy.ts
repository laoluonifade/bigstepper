import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from './current-user.decorator';
import { AuthSession } from './auth-session.entity';
import { IsNull, Repository } from 'typeorm';
import { AmlService } from '../aml/aml.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, @InjectRepository(AuthSession) private readonly sessions: Repository<AuthSession>, private readonly aml: AmlService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(request: { headers: Record<string, string | string[] | undefined>; ip?: string }, payload: { sub: string; email: string; jti: string }): Promise<AuthenticatedUser> {
    const session = await this.sessions.findOne({
      where: { id: payload.jti, userId: payload.sub, revokedAt: IsNull() },
      relations: { user: true },
    });
    if (!session || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    // When they last used Jump, for "active today". At most one write per person every five minutes,
    // and never in the way of the request.
    void this.sessions.manager.query(
      `UPDATE "users" SET "lastSeenAt" = now() WHERE "id" = $1 AND ("lastSeenAt" IS NULL OR "lastSeenAt" < now() - interval '5 minutes')`,
      [payload.sub],
    ).catch(() => undefined);
    // Which devices and IPs each runner app account uses, to spot several accounts run by one person.
    const deviceId = request.headers['x-device-id'];
    if (session.scope !== 'admin') this.aml.recordDevice(payload.sub, Array.isArray(deviceId) ? deviceId[0] : deviceId, request.ip);
    return { id: payload.sub, email: payload.email, sessionId: payload.jti, role: session.user.role, scope: session.scope ?? 'app' };
  }
}
