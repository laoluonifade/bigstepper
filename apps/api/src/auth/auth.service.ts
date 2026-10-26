import { BadRequestException, Injectable, ConflictException, Logger, UnauthorizedException } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { passwordResetEmail, verificationEmail, welcomeEmail } from '../mail/templates';
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
import { MoreThan } from 'typeorm';
import { OAuth2Client } from 'google-auth-library';
import { appleKeyConfigured, exchangeAppleCode, verifyAppleIdentityToken, type AppleConfig } from './apple';
import type { AppleSignInDto } from './dto/auth.dto';

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

  async register(email: string, password: string, countryCode: string, displayName?: string, whatsappNumber?: string, gender?: Profile['gender'], username?: string) {
    return this.createAccount({ email, passwordHash: await bcrypt.hash(password, 10), countryCode, displayName, whatsappNumber, gender, username });
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
    gender?: Profile['gender'];
    /** Chosen at sign-up; otherwise generated from the email, and the app asks them to pick one. */
    username?: string;
    /** Already proved by the sign-in provider (Google): no verification email. */
    emailVerified?: boolean;
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
      emailVerified: input.emailVerified ?? false,
    });
    try {
      await this.usersRepo.manager.transaction(async (manager) => {
        await manager.save(user);
        const baseUsername = normalizedEmail.split('@')[0].replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'runner';
        await manager.save(
          Profile,
          manager.create(Profile, {
            userId: user.id,
            username: input.username?.toLowerCase() ?? `${baseUsername}_${randomBytes(3).toString('hex')}`,
            usernameChosen: Boolean(input.username),
            displayName: user.displayName || baseUsername,
            countryCode: input.countryCode,
            gender: input.gender ?? null,
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
        const detail = (error as QueryFailedError & { driverError?: { detail?: string } }).driverError?.detail ?? '';
        throw new ConflictException(detail.includes('(username)') ? 'That username is taken. Try another.' : 'Email already registered');
      }
      throw error;
    }

    const response = await this.generateToken(user);
    if (user.emailVerified) {
      if (!user.email.endsWith('.invalid')) this.mail.sendInBackground(welcomeEmail({ address: user.email, name: user.displayName }));
      return response;
    }
    const verificationToken = await this.createActionToken(user.id, 'VERIFY_EMAIL', 24 * 60 * 60 * 1000);
    this.mail.sendInBackground(
      verificationEmail({ address: user.email, name: user.displayName }, this.webUrl('/verify-email', verificationToken)),
    );
    // And a hello from the founder, as a personal note (not for placeholder addresses).
    if (!user.email.endsWith('.invalid')) this.mail.sendInBackground(welcomeEmail({ address: user.email, name: user.displayName }));
    return {
      ...response,
      ...(this.config.get('NODE_ENV') === 'development' ? { developmentVerificationToken: verificationToken } : {}),
    };
  }

  private readonly google = new OAuth2Client();

  private googleClientIds() {
    return ['GOOGLE_WEB_CLIENT_ID', 'GOOGLE_IOS_CLIENT_ID', 'GOOGLE_ANDROID_CLIENT_ID'].map((name) => this.config.get<string>(name)).filter((id): id is string => Boolean(id));
  }

  /** The web page draws Google's button with this (public) id; null hides it. */
  googleConfig() {
    return { webClientId: this.config.get<string>('GOOGLE_WEB_CLIENT_ID') || null };
  }

  /**
   * "Continue with Google". The ID token must be signed by Google for one of Jump's client ids and carry a
   * verified email. A known Google account signs in; otherwise the account with that email gets Google
   * linked (Google has proved the address); otherwise a new account starts, already verified.
   */
  async googleSignIn(idToken: string, countryCode?: string) {
    const audience = this.googleClientIds();
    if (!audience.length) throw new BadRequestException('Google sign-in is not available yet');
    let payload: { sub: string; email?: string; email_verified?: boolean; name?: string } | undefined;
    try {
      payload = (await this.google.verifyIdToken({ idToken, audience })).getPayload();
    } catch {
      throw new UnauthorizedException('Google sign-in failed. Try again.');
    }
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new UnauthorizedException('Your Google account needs a verified email');
    }
    const email = payload.email.trim().toLowerCase();
    const sub = payload.sub;

    const linked = await this.usersRepo.createQueryBuilder('user').where('user.googleSub = :sub', { sub }).getOne();
    if (linked) return this.generateToken(linked);

    const existing = await this.usersRepo.findOne({ where: { email } });
    if (existing) {
      await this.usersRepo.update({ id: existing.id }, { googleSub: sub, emailVerified: true });
      return this.generateToken({ ...existing, emailVerified: true });
    }

    return this.createAccount({
      email,
      countryCode: countryCode ?? 'NG',
      displayName: payload.name,
      emailVerified: true,
      afterCreate: async (manager, user) => {
        await manager.update(User, { id: user.id }, { googleSub: sub });
      },
    });
  }

  private readonly logger = new Logger(AuthService.name);

  appleConfig(): AppleConfig {
    return {
      bundleId: this.config.get<string>('APPLE_BUNDLE_ID') || 'com.startajump.app',
      teamId: this.config.get<string>('APPLE_TEAM_ID') ?? '',
      keyId: this.config.get<string>('APPLE_KEY_ID') ?? '',
      privateKey: this.config.get<string>('APPLE_PRIVATE_KEY') ?? '',
    };
  }

  /**
   * "Sign in with Apple". Same rules as Google: a known Apple id signs in; a verified email already on Jump
   * gets Apple linked; otherwise a new, verified account (a "Hide My Email" relay address is fine). Apple
   * sends the email and name only the first time, so an Apple id we've never seen without an email can't
   * make an account.
   */
  async appleSignIn(input: AppleSignInDto) {
    const config = this.appleConfig();
    let identity: Awaited<ReturnType<typeof verifyAppleIdentityToken>>;
    try {
      identity = await verifyAppleIdentityToken(this.jwtService, input.identityToken, config.bundleId);
    } catch (error) {
      this.logger.warn(`Sign in with Apple rejected: ${error instanceof Error ? error.message : error}`);
      throw new UnauthorizedException('Sign in with Apple failed. Try again.');
    }
    const { sub, email } = identity;

    let response: Awaited<ReturnType<AuthService['generateToken']>>;
    const linked = await this.usersRepo.createQueryBuilder('user').where('user.appleSub = :sub', { sub }).getOne();
    if (linked) {
      response = await this.generateToken(linked);
    } else {
      if (!email || !identity.emailVerified) {
        throw new UnauthorizedException('Apple didn’t share your email. In Settings › Apple Account › Sign in with Apple, stop using Jump, then try again.');
      }
      const existing = await this.usersRepo.findOne({ where: { email } });
      if (existing) {
        await this.usersRepo.update({ id: existing.id }, { appleSub: sub, emailVerified: true });
        response = await this.generateToken({ ...existing, emailVerified: true });
      } else {
        response = await this.createAccount({
          email,
          countryCode: input.countryCode ?? 'NG',
          displayName: input.displayName,
          emailVerified: true,
          afterCreate: async (manager, user) => {
            await manager.update(User, { id: user.id }, { appleSub: sub });
          },
        });
      }
    }

    // Keep a refresh token so deleting the account can revoke Jump at Apple. Never holds up the sign-in.
    if (input.authorizationCode && appleKeyConfigured(config)) {
      const userId = response.user.id;
      void exchangeAppleCode(this.jwtService, config, input.authorizationCode)
        .then(async (token) => { if (token) await this.usersRepo.update({ id: userId }, { appleRefreshToken: token }); })
        .catch((error: unknown) => this.logger.warn(`Apple token exchange failed: ${error instanceof Error ? error.message : error}`));
    }
    return response;
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
    const rawToken = await this.createActionToken(userId, 'VERIFY_EMAIL', 24 * 60 * 60 * 1000);
    await this.mail.send(verificationEmail({ address: user.email, name: user.displayName }, this.webUrl('/verify-email', rawToken)));
    // A provider failure must not invalidate a previously delivered link.
    await this.actionTokensRepo.createQueryBuilder().update()
      .set({ usedAt: new Date() })
      .where('"userId" = :userId AND "type" = :type AND "usedAt" IS NULL AND "tokenHash" <> :tokenHash',
        { userId, type: 'VERIFY_EMAIL', tokenHash: this.hashToken(rawToken) })
      .execute();
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
