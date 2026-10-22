import { BadRequestException, Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { passwordResetEmail, verificationEmail } from '../mail/templates';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { AuthSession } from './auth-session.entity';
import { Profile } from '../profiles/profile.entity';
import { createHash, randomBytes } from 'node:crypto';
import { AuthActionToken } from './auth-action-token.entity';
import { ConfigService } from '@nestjs/config';
import { IsNull, MoreThan } from 'typeorm';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(AuthSession)
    private readonly sessionsRepo: Repository<AuthSession>,
    @InjectRepository(AuthActionToken)
    private readonly actionTokensRepo: Repository<AuthActionToken>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async register(email: string, password: string, countryCode: string, displayName?: string, whatsappNumber?: string) {
    return this.createAccount({ email, passwordHash: await bcrypt.hash(password, 10), countryCode, displayName, whatsappNumber });
  }

  /**
   * Creates the user, profile and league place, then emails a verification link. `afterCreate` runs in the
   * same transaction (Strava sign-up links the athlete there). Accounts without a password get an unguessable
   * one; the runner can set a real one through "forgot password".
   */
  async createAccount(input: {
    email: string;
    passwordHash?: string;
    countryCode: string;
    displayName?: string;
    whatsappNumber?: string;
    afterCreate?: (manager: EntityManager, user: User) => Promise<void>;
  }) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await this.usersRepo.findOne({ where: { email: normalizedEmail } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = input.passwordHash ?? (await bcrypt.hash(randomBytes(32).toString('base64url'), 10));
    const user = this.usersRepo.create({
      email: normalizedEmail,
      passwordHash,
      displayName: input.displayName?.trim() || normalizedEmail.split('@')[0],
    });
    try {
      await this.usersRepo.manager.transaction(async (manager) => {
        await manager.save(user);
        const baseUsername = normalizedEmail.split('@')[0].replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'runner';
        await manager.save(
          Profile,
          manager.create(Profile, {
            userId: user.id,
            username: `${baseUsername}_${randomBytes(3).toString('hex')}`,
            displayName: user.displayName || baseUsername,
            countryCode: input.countryCode,
            whatsappNumber: input.whatsappNumber ?? null,
          }),
        );
        await manager.query(
          `INSERT INTO "league_memberships" ("seasonId", "divisionId", "userId")
           SELECT s."id", d."id", $1 FROM "league_seasons" s CROSS JOIN "league_divisions" d
           WHERE s."status" = 'ACTIVE' AND d."level" = 1
           ON CONFLICT ("seasonId", "userId") DO NOTHING`,
          [user.id],
        );
        await input.afterCreate?.(manager, user);
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505'
      ) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }

    const response = await this.generateToken(user);
    const verificationToken = await this.createActionToken(user.id, 'VERIFY_EMAIL', 24 * 60 * 60 * 1000);
    this.mail.sendInBackground(
      verificationEmail({ address: user.email, name: user.displayName }, this.webUrl('/verify-email', verificationToken)),
    );
    return {
      ...response,
      ...(this.config.get('NODE_ENV') === 'development' ? { developmentVerificationToken: verificationToken } : {}),
    };
  }

  /** Session for a user who proved who they are some other way (Strava sign-in). */
  async signInAs(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('This account no longer exists');
    return this.generateToken(user);
  }

  async login(email: string, password: string) {
    const user = await this.usersRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: email.trim().toLowerCase() })
      .getOne();
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.generateToken(user);
  }

  async getSession(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Session user no longer exists');
    return { id: user.id, email: user.email, displayName: user.displayName, emailVerified: user.emailVerified };
  }

  async logout(sessionId: string, userId: string) {
    await this.sessionsRepo.update({ id: sessionId, userId }, { revokedAt: new Date() });
    return { success: true };
  }

  async verifyEmail(rawToken: string) {
    const token = await this.findUsableActionToken(rawToken, 'VERIFY_EMAIL');
    await this.usersRepo.manager.transaction(async (manager) => {
      await manager.update(User, { id: token.userId }, { emailVerified: true });
      await manager.update(AuthActionToken, { id: token.id }, { usedAt: new Date() });
    });
    return { success: true };
  }

  async resendVerification(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Session user no longer exists');
    if (user.emailVerified) return { success: true, alreadyVerified: true };
    // Only the newest link should work.
    await this.actionTokensRepo.update({ userId, type: 'VERIFY_EMAIL', usedAt: IsNull() }, { usedAt: new Date() });
    const rawToken = await this.createActionToken(userId, 'VERIFY_EMAIL', 24 * 60 * 60 * 1000);
    await this.mail.send(verificationEmail({ address: user.email, name: user.displayName }, this.webUrl('/verify-email', rawToken)));
    return {
      success: true,
      alreadyVerified: false,
      ...(this.config.get('NODE_ENV') === 'development' ? { developmentVerificationToken: rawToken } : {}),
    };
  }

  async requestPasswordReset(email: string) {
    const user = await this.usersRepo.findOne({ where: { email: email.trim().toLowerCase() } });
    if (!user) return { success: true };
    const rawToken = await this.createActionToken(user.id, 'RESET_PASSWORD', 60 * 60 * 1000);
    // In the background so response time doesn't reveal whether the account exists.
    this.mail.sendInBackground(passwordResetEmail({ address: user.email, name: user.displayName }, this.webUrl('/reset-password', rawToken)));
    return {
      success: true,
      ...(this.config.get('NODE_ENV') === 'development' ? { developmentResetToken: rawToken } : {}),
    };
  }

  async completePasswordReset(rawToken: string, password: string) {
    const token = await this.findUsableActionToken(rawToken, 'RESET_PASSWORD');
    const passwordHash = await bcrypt.hash(password, 10);
    await this.usersRepo.manager.transaction(async (manager) => {
      await manager.update(User, { id: token.userId }, { passwordHash });
      await manager.update(AuthActionToken, { id: token.id }, { usedAt: new Date() });
      await manager.update(AuthSession, { userId: token.userId }, { revokedAt: new Date() });
    });
    return { success: true };
  }

  private async createActionToken(userId: string, type: AuthActionToken['type'], ttlMilliseconds: number) {
    const rawToken = randomBytes(32).toString('base64url');
    await this.actionTokensRepo.save(
      this.actionTokensRepo.create({
        userId,
        type,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + ttlMilliseconds),
        usedAt: null,
      }),
    );
    return rawToken;
  }

  private async findUsableActionToken(rawToken: string, type: AuthActionToken['type']) {
    const token = await this.actionTokensRepo.findOne({
      where: { tokenHash: this.hashToken(rawToken), type, expiresAt: MoreThan(new Date()) },
    });
    if (!token || token.usedAt) throw new BadRequestException('This link is invalid or has expired');
    return token;
  }

  private webUrl(path: string, token: string) {
    const origin = this.config.getOrThrow<string>('WEB_ORIGIN').split(',')[0].trim().replace(/\/+$/, '');
    return `${origin}${path}?token=${encodeURIComponent(token)}`;
  }

  private hashToken(rawToken: string) {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private async generateToken(user: User) {
    const session = await this.sessionsRepo.save(
      this.sessionsRepo.create({
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
      }),
    );
    const payload = { sub: user.id, email: user.email, jti: session.id };
    return {
      access_token: await this.jwtService.signAsync(payload),
      user: { id: user.id, email: user.email, displayName: user.displayName, emailVerified: user.emailVerified ?? false },
    };
  }
}
