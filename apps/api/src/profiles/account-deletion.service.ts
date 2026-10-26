import { ConflictException, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { appleKeyConfigured, revokeAppleToken } from '../auth/apple';

const LIVE = `t."status" NOT IN ('SETTLED','CANCELLED','DRAFT') AND (t."scoringClosesAt" IS NULL OR t."scoringClosesAt" > now() OR t."type" <> 'free')`;

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(private readonly dataSource: DataSource, @Optional() private readonly config?: ConfigService) {}

  async blocker(userId: string, manager: EntityManager = this.dataSource.manager): Promise<string | null> {
    const [row] = await manager.query(
      `SELECT
         COALESCE((SELECT "balanceKobo" FROM "wallets" WHERE "userId" = $1), 0)::bigint AS "balance",
         (SELECT count(*) FROM "prize_awards" WHERE "winnerUserId" = $1 AND "status" <> 'PAID')::integer AS "unpaidPrizes",
         (SELECT count(*) FROM "creator_earnings" e JOIN "creator_profiles" c ON c."id" = e."creatorProfileId"
            WHERE c."userId" = $1 AND e."status" <> 'PAID')::integer AS "unpaidEarnings",
         (SELECT count(*) FROM "clubs" c WHERE c."ownerUserId" = $1
            AND EXISTS (SELECT 1 FROM "club_memberships" m WHERE m."clubId" = c."id" AND m."userId" <> $1))::integer AS "clubs",
         (SELECT count(*) FROM "competition_tables" t WHERE t."creatorId" = $1 AND ${LIVE}
            AND EXISTS (SELECT 1 FROM "table_registrations" r WHERE r."tableId" = t."id" AND r."userId" <> $1))::integer AS "hosting",
         (SELECT count(*) FROM "table_registrations" r JOIN "competition_tables" t ON t."id" = r."tableId"
            WHERE r."userId" = $1 AND t."type" <> 'free' AND t."status" NOT IN ('SETTLED','CANCELLED'))::integer AS "cashEntries"`,
      [userId],
    ) as Array<{ balance: string; unpaidPrizes: number; unpaidEarnings: number; clubs: number; hosting: number; cashEntries: number }>;
    if (Number(row.balance) > 0) return 'You still have entry credit. Use it on a competition, or email start@startajump.com about it, then delete your account.';
    if (row.unpaidPrizes > 0 || row.unpaidEarnings > 0) return 'You have prize money or earnings still being paid out. Delete your account once it has arrived.';
    if (row.clubs > 0) return 'You own a club with other members. Hand it over to another manager or close it first.';
    if (row.hosting > 0) return 'You’re hosting a competition that’s still running with other people in it. Wait until it ends.';
    if (row.cashEntries > 0) return 'You’re in a competition with cash prizes that hasn’t been settled yet. Delete your account once it has.';
    return null;
  }

  async delete(userId: string) {
    let appleRefreshToken: string | null = null;
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT 1 FROM "users" WHERE "id" = $1 FOR UPDATE`, [userId]);
      const reason = await this.blocker(userId, manager);
      if (reason) throw new ConflictException(reason);
      [{ appleRefreshToken } = { appleRefreshToken: null }] = await manager.query(`SELECT "appleRefreshToken" FROM "users" WHERE "id" = $1`, [userId]) as Array<{ appleRefreshToken: string | null }>;

      await manager.query(`DELETE FROM "table_activity_credits" c USING "activities" a WHERE c."activityId" = a."id" AND a."userId" = $1`, [userId]);
      await manager.query(`DELETE FROM "running_sessions" WHERE "userId" = $1`, [userId]);
      await manager.query(`DELETE FROM "feed_posts" WHERE "userId" = $1`, [userId]);
      await manager.query(`DELETE FROM "feed_comments" WHERE "userId" = $1`, [userId]);
      await manager.query(`DELETE FROM "feed_post_reactions" WHERE "userId" = $1`, [userId]);
      await manager.query(`DELETE FROM "direct_messages" WHERE "senderId" = $1 OR "recipientId" = $1`, [userId]);
      await manager.query(`DELETE FROM "direct_message_reactions" WHERE "userId" = $1`, [userId]);
      await manager.query(`DELETE FROM "follows" WHERE "followerId" = $1 OR "followingId" = $1`, [userId]);
      await manager.query(`DELETE FROM "club_follows" WHERE "userId" = $1`, [userId]);
      await manager.query(`DELETE FROM "club_chat_reads" WHERE "userId" = $1`, [userId]);
      await manager.query(`DELETE FROM "club_memberships" WHERE "userId" = $1`, [userId]);
      await manager.query(`DELETE FROM "table_registrations" r USING "competition_tables" t WHERE r."tableId" = t."id" AND r."userId" = $1 AND ${LIVE}`, [userId]);
      await manager.query(`DELETE FROM "challenge_invitations" WHERE "invitedUserId" = $1`, [userId]);
      for (const table of ['push_tokens', 'notifications', 'auth_sessions', 'auth_action_tokens', 'user_devices', 'strava_accounts', 'challenge_reminder_deliveries']) {
        await manager.query(`DELETE FROM "${table}" WHERE "userId" = $1`, [userId]);
      }

      const tag = randomBytes(6).toString('hex');
      await manager.query(
        `UPDATE "profiles" SET "username" = $2, "displayName" = 'Deleted runner', "avatarUrl" = NULL, "bio" = NULL, "whatsappNumber" = NULL,
           "weightKg" = NULL, "gender" = NULL, "weeklyGoalMetres" = NULL, "emailActivityEnabled" = false, "emailDigestEnabled" = false, "verifiedAt" = NULL
         WHERE "userId" = $1`,
        [userId, `deleted_${tag}`],
      );
      await manager.query(
        `UPDATE "users" SET "email" = $2, "passwordHash" = $3, "displayName" = 'Deleted runner', "emailVerified" = false, "deletedAt" = now(),
           "googleSub" = NULL, "appleSub" = NULL, "appleRefreshToken" = NULL WHERE "id" = $1`,
        [userId, `deleted-${tag}@deleted.startajump.invalid`, `deleted:${randomBytes(24).toString('hex')}`],
      );
    });
    this.logger.log(`Account ${userId} deleted`);
    if (appleRefreshToken) await this.revokeApple(appleRefreshToken);
    return { deleted: true };
  }

  private async revokeApple(refreshToken: string) {
    const config = {
      bundleId: this.config?.get<string>('APPLE_BUNDLE_ID') || 'com.startajump.app',
      teamId: this.config?.get<string>('APPLE_TEAM_ID') ?? '',
      keyId: this.config?.get<string>('APPLE_KEY_ID') ?? '',
      privateKey: this.config?.get<string>('APPLE_PRIVATE_KEY') ?? '',
    };
    if (!appleKeyConfigured(config)) return;
    try {
      await revokeAppleToken(new JwtService(), config, refreshToken);
    } catch (error) {
      this.logger.warn(`Apple revoke failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}
