import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from './current-user.decorator';
import { AuthSession } from './auth-session.entity';
import { IsNull, Repository } from 'typeorm';
import { AmlService } from '../aml/aml.service';

export const APP_SESSION_DAYS = 60;
const SLIDE_AFTER_DAYS = 7;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, @InjectRepository(AuthSession) private readonly sessions: Repository<AuthSession>, private readonly aml: AmlService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: true,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(request: { headers: Record<string, string | string[] | undefined>; ip?: string }, payload: { sub: string; email: string; jti: string }): Promise<AuthenticatedUser> {
    if (!payload.jti || !payload.sub) throw new UnauthorizedException('Session is no longer valid');
    const session = await this.sessions.findOne({
      where: { id: payload.jti, userId: payload.sub, revokedAt: IsNull() },
      relations: { user: true },
    });
    if (!session || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    if (session.user.suspendedAt && session.scope !== 'admin') throw new UnauthorizedException('This account is suspended');
    void this.sessions.manager.query(
      `UPDATE "users" SET "lastSeenAt" = now() WHERE "id" = $1 AND ("lastSeenAt" IS NULL OR "lastSeenAt" < now() - interval '5 minutes')`,
      [payload.sub],
    ).catch(() => undefined);
    if (session.scope !== 'admin' && session.expiresAt.getTime() - Date.now() < (APP_SESSION_DAYS - SLIDE_AFTER_DAYS) * 86_400_000) {
      void this.sessions.manager.query(
        `UPDATE "auth_sessions" SET "expiresAt" = now() + make_interval(days => $2) WHERE "id" = $1 AND "revokedAt" IS NULL`,
        [session.id, APP_SESSION_DAYS],
      ).catch(() => undefined);
    }
    const deviceId = request.headers['x-device-id'];
    if (session.scope !== 'admin') this.aml.recordDevice(payload.sub, Array.isArray(deviceId) ? deviceId[0] : deviceId, request.ip);
    return { id: payload.sub, email: payload.email, sessionId: payload.jti, role: session.user.role, scope: session.scope ?? 'app' };
  }
}
