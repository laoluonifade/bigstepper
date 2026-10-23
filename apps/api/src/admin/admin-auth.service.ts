import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { DataSource } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { adminCodeEmail } from '../mail/templates';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
/** Admin sessions are short: a working day. */
const SESSION_MS = 12 * 60 * 60 * 1000;

type Purpose = 'login' | 'confirm';

/**
 * Sign-in for admin.startajump.com: no passwords, only a 6-digit code emailed to a provisioned admin
 * (a user whose role is admin or compliance; see scripts/provision-admin.ts). The same codes confirm
 * money actions (payout approval, reconciliation) in place of re-entering a password.
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /** Always answers the same way, so it can't be used to find out who the admins are. */
  async requestLoginCode(email: string) {
    const [admin] = await this.dataSource.query(
      `SELECT "id", "email" FROM "users" WHERE lower("email") = lower($1) AND "role" IN ('admin','compliance')`,
      [email.trim()],
    ) as Array<{ id: string; email: string }>;
    if (admin) await this.sendCode(admin.id, admin.email, 'login');
    else this.logger.warn('Admin code requested for an address that is not an admin');
    return { sent: true };
  }

  async verifyLogin(email: string, code: string) {
    const [admin] = await this.dataSource.query(
      `SELECT "id", "email", "displayName", "role" FROM "users" WHERE lower("email") = lower($1) AND "role" IN ('admin','compliance')`,
      [email.trim()],
    ) as Array<{ id: string; email: string; displayName: string; role: 'admin' | 'compliance' }>;
    if (!admin || !(await this.useCode(admin.id, 'login', code))) throw new UnauthorizedException('That code is wrong or has expired. Request a new one.');
    const [session] = await this.dataSource.query(
      `INSERT INTO "auth_sessions" ("userId", "expiresAt", "scope") VALUES ($1, $2, 'admin') RETURNING "id"`,
      [admin.id, new Date(Date.now() + SESSION_MS)],
    ) as Array<{ id: string }>;
    await this.dataSource.query(
      `INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId") VALUES ($1,'ADMIN_SIGNED_IN','user',$2)`,
      [admin.id, admin.id],
    );
    const accessToken = await this.jwt.signAsync({ sub: admin.id, email: admin.email, jti: session.id }, { expiresIn: '12h' });
    return { access_token: accessToken, admin: { id: admin.id, email: admin.email, displayName: admin.displayName, role: admin.role } };
  }

  async me(userId: string) {
    const [admin] = await this.dataSource.query(
      `SELECT "id", "email", "displayName", "role" FROM "users" WHERE "id" = $1`, [userId],
    ) as Array<{ id: string; email: string; displayName: string; role: string }>;
    return admin;
  }

  async logout(sessionId: string, userId: string) {
    await this.dataSource.query(`UPDATE "auth_sessions" SET "revokedAt" = now() WHERE "id" = $1 AND "userId" = $2`, [sessionId, userId]);
    return { signedOut: true };
  }

  /** A fresh code for confirming a money action, sent to the signed-in admin. */
  async requestConfirmCode(userId: string) {
    const [admin] = await this.dataSource.query(`SELECT "email" FROM "users" WHERE "id" = $1`, [userId]) as Array<{ email: string }>;
    if (!admin) throw new ForbiddenException();
    await this.sendCode(userId, admin.email, 'confirm');
    return { sent: true };
  }

  async assertConfirmCode(userId: string, code: string) {
    if (!(await this.useCode(userId, 'confirm', code))) throw new ForbiddenException('That confirmation code is wrong or has expired');
  }

  private async sendCode(userId: string, email: string, purpose: Purpose) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.dataSource.transaction(async (manager) => {
      // One live code at a time: a new request cancels the old one.
      await manager.query(`UPDATE "admin_login_codes" SET "usedAt" = now() WHERE "userId" = $1 AND "purpose" = $2 AND "usedAt" IS NULL`, [userId, purpose]);
      await manager.query(
        `INSERT INTO "admin_login_codes" ("userId", "purpose", "codeHash", "expiresAt") VALUES ($1, $2, $3, $4)`,
        [userId, purpose, hash(userId, code), new Date(Date.now() + CODE_TTL_MS)],
      );
    });
    this.mail.sendInBackground(adminCodeEmail({ address: email }, code, purpose));
    // Local development only: the code in the terminal, so a failing or unconfigured mailer never locks
    // you out. Never in production.
    if (this.config.get<string>('NODE_ENV') !== 'production') this.logger.warn(`Dev admin ${purpose} code for ${email}: ${code}`);
  }

  /** Checks a code once; five wrong tries burn it. */
  private async useCode(userId: string, purpose: Purpose, code: string) {
    return this.dataSource.transaction(async (manager) => {
      const [row] = await manager.query(
        `SELECT "id", "codeHash", "attempts" FROM "admin_login_codes"
         WHERE "userId" = $1 AND "purpose" = $2 AND "usedAt" IS NULL AND "expiresAt" > now()
         ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE`,
        [userId, purpose],
      ) as Array<{ id: string; codeHash: string; attempts: number }>;
      if (!row) return false;
      const expected = Buffer.from(row.codeHash, 'hex');
      const given = Buffer.from(hash(userId, code.trim()), 'hex');
      const ok = expected.length === given.length && timingSafeEqual(expected, given);
      if (ok) {
        await manager.query(`UPDATE "admin_login_codes" SET "usedAt" = now() WHERE "id" = $1`, [row.id]);
      } else {
        await manager.query(
          `UPDATE "admin_login_codes" SET "attempts" = "attempts" + 1, "usedAt" = CASE WHEN "attempts" + 1 >= $2 THEN now() ELSE NULL END WHERE "id" = $1`,
          [row.id, MAX_ATTEMPTS],
        );
      }
      return ok;
    });
  }
}

/** Codes are stored hashed with the user's id, so a database read never reveals a usable code. */
function hash(userId: string, code: string) {
  return createHash('sha256').update(`${userId}:${code}`).digest('hex');
}
