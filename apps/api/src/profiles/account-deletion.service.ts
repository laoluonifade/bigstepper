import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';

/** Unfinished: still open, running, or waiting to be settled. */
const LIVE = `t."status" NOT IN ('SETTLED','CANCELLED','DRAFT') AND (t."scoringClosesAt" IS NULL OR t."scoringClosesAt" > now() OR t."type" <> 'free')`;

/**
 * Deleting a runner's account, as App Store and Play rules (and the privacy policy) promise.
 *
 * Money comes first: while anything is owed to or held for them (a wallet balance, an unpaid prize or
 * earnings, a cash competition not yet settled), or others depend on them (a club they own, a competition
 * they're hosting), it refuses and says what to sort out.
 *
 * Then, in one transaction: everything personal is deleted (activities and their GPS routes, posts,
 * messages, follows, memberships, entries in unfinished competitions, devices, sessions); the profile is
 * wiped; and the account row is kept but made anonymous, because payment, payout and identity-verification
 * records must legally be retained and point at it. The email is replaced, so it can sign up afresh.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(private readonly dataSource: DataSource) {}

  /** Why the account can't be deleted yet, or null when it can. */
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
    if (Number(row.balance) > 0) return 'You still have money in your balance for entries. Use it on a competition, or email start@startajump.com about it, then delete your account.';
    if (row.unpaidPrizes > 0 || row.unpaidEarnings > 0) return 'You have prize money or earnings still being paid out. Delete your account once it has arrived.';
    if (row.clubs > 0) return 'You own a club with other members. Hand it over to another manager or close it first.';
    if (row.hosting > 0) return 'You’re hosting a competition that’s still running with other people in it. Wait until it ends.';
    if (row.cashEntries > 0) return 'You’re in a competition with cash prizes that hasn’t been settled yet. Delete your account once it has.';
    return null;
  }

  async delete(userId: string) {
    await this.dataSource.transaction(async (manager) => {
      // Lock the account so a payout or entry can't slip in between the check and the deletion.
      await manager.query(`SELECT 1 FROM "users" WHERE "id" = $1 FOR UPDATE`, [userId]);
      const reason = await this.blocker(userId, manager);
      if (reason) throw new ConflictException(reason);

      // Activity history: credits first (they guard finished boards), then sessions, which take their
      // activities and GPS points with them.
      await manager.query(`DELETE FROM "table_activity_credits" c USING "activities" a WHERE c."activityId" = a."id" AND a."userId" = $1`, [userId]);
      await manager.query(`DELETE FROM "running_sessions" WHERE "userId" = $1`, [userId]);
      // What they said and who they followed.
      await manager.query(`DELETE FROM "feed_posts" WHERE "userId" = $1`, [userId]);
      await manager.query(`DELETE FROM "feed_comments" WHERE "userId" = $1`, [userId]);
      await manager.query(`DELETE FROM "feed_post_reactions" WHERE "userId" = $1`, [userId]);
      await manager.query(`DELETE FROM "direct_messages" WHERE "senderId" = $1 OR "recipientId" = $1`, [userId]);
      await manager.query(`DELETE FROM "direct_message_reactions" WHERE "userId" = $1`, [userId]);
      await manager.query(`DELETE FROM "follows" WHERE "followerId" = $1 OR "followingId" = $1`, [userId]);
      await manager.query(`DELETE FROM "club_follows" WHERE "userId" = $1`, [userId]);
      await manager.query(`DELETE FROM "club_chat_reads" WHERE "userId" = $1`, [userId]);
      await manager.query(`DELETE FROM "club_memberships" WHERE "userId" = $1`, [userId]);
      // Entries in competitions that aren't over; finished boards keep an anonymous row.
      await manager.query(`DELETE FROM "table_registrations" r USING "competition_tables" t WHERE r."tableId" = t."id" AND r."userId" = $1 AND ${LIVE}`, [userId]);
      await manager.query(`DELETE FROM "challenge_invitations" WHERE "invitedUserId" = $1`, [userId]);
      // Devices, sign-ins and reminders.
      for (const table of ['push_tokens', 'notifications', 'auth_sessions', 'auth_action_tokens', 'user_devices', 'strava_accounts', 'challenge_reminder_deliveries']) {
        await manager.query(`DELETE FROM "${table}" WHERE "userId" = $1`, [userId]);
      }

      // The profile, wiped. The handle frees up; nothing left points back at the person.
      const tag = randomBytes(6).toString('hex');
      await manager.query(
        `UPDATE "profiles" SET "username" = $2, "displayName" = 'Deleted runner', "avatarUrl" = NULL, "bio" = NULL, "whatsappNumber" = NULL,
           "weightKg" = NULL, "gender" = NULL, "weeklyGoalMetres" = NULL, "emailActivityEnabled" = false, "emailDigestEnabled" = false, "verifiedAt" = NULL
         WHERE "userId" = $1`,
        [userId, `deleted_${tag}`],
      );
      // The account row stays for the records that must, but can't be signed into or found.
      await manager.query(
        `UPDATE "users" SET "email" = $2, "passwordHash" = $3, "displayName" = 'Deleted runner', "emailVerified" = false, "deletedAt" = now() WHERE "id" = $1`,
        [userId, `deleted-${tag}@deleted.startajump.invalid`, `deleted:${randomBytes(24).toString('hex')}`],
      );
    });
    this.logger.log(`Account ${userId} deleted`);
    return { deleted: true };
  }
}
