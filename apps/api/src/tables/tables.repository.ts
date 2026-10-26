import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { Db, exists, flag, id, num, row, rows, run, text, when } from '../database/sql';
import { RANK_ORDER } from './scoring-engine';

export type DiscoverView = 'for-you' | 'trending' | 'starting' | 'newest' | 'friends' | 'created' | 'archived';

const ranked = z.object({ id, n: num });
const avatarStyle = z.enum(['masculine', 'feminine', 'neutral']);

const podiumRow = z.object({
  tableId: id, userId: id, rank: num, displayName: text, username: text.nullable(), avatarUrl: text.nullable(),
  avatarStyle, verified: flag, score: num.nullable(), scoringMethod: text,
});

const mineRow = z.object({
  id, code: text, title: text, type: text, challengeType: text, scoringMethod: text, targetDistanceMetres: num.nullable(),
  targetSteps: num.nullable(), targetSeconds: num.nullable(), targetSessions: num.nullable(), dailyTarget: num.nullable(),
  status: text, startsAt: when.nullable(), scoringClosesAt: when.nullable(), visibility: text, guaranteedPrizeKobo: num.nullable(), createdAt: when,
  hosting: flag, joined: flag, entrants: num, myRank: num.nullable(), myScore: num.nullable(), leaderScore: num.nullable(),
  aheadScore: num.nullable(), aheadName: text.nullable(), behindScore: num.nullable(), behindName: text.nullable(),
});

const standingRow = z.object({
  rank: num, userId: id, displayName: text, username: text.nullable(), avatarUrl: text.nullable(), avatarStyle, verified: flag,
  creditedDistanceMetres: num, creditedSteps: num, completionTimeSeconds: num.nullable(), score: num.nullable(),
  targetReachedAt: when.nullable(), qualified: flag.nullable(),
});

const runner = z.object({ userId: id, username: text, email: text, displayName: text });

@Injectable()
export class TablesRepository {
  constructor(private readonly dataSource: DataSource) {}

  private get db(): Db {
    return this.dataSource.manager;
  }

  openByPopularity(sort: 'popular' | 'newest', type: string, activity: string) {
    return rows(this.db, ranked,
      `SELECT t."id", COUNT(r."id")::integer AS n
       FROM "competition_tables" t LEFT JOIN "table_registrations" r ON r."tableId"=t."id"
       WHERE t."status"='OPEN_FOR_ENTRY' AND t."visibility"='public' AND ($1='all' OR t."type"=$1) AND ($2='all' OR t."challengeType"=$2)
       GROUP BY t."id" ORDER BY ${sort === 'newest' ? 't."createdAt" DESC' : 'n DESC, t."createdAt" DESC'} LIMIT 50`,
      [type, activity]);
  }

  discover(view: DiscoverView, viewerId: string | null, type: string, activity: string, offset: number) {
    const personal = view === 'for-you' || view === 'friends' || view === 'created' || view === 'archived';
    const params: unknown[] = [type, activity, offset, ...(personal ? [viewerId] : [])];
    const me = '$4::uuid';
    const joinedCount = 'COUNT(r."id")';
    const friendsInvolved = `(EXISTS (
      SELECT 1 FROM "follows" f WHERE f."followerId" = ${me} AND (f."followingId" = t."creatorId"
        OR EXISTS (SELECT 1 FROM "table_registrations" fr WHERE fr."tableId" = t."id" AND fr."userId" = f."followingId")))
      OR (t."communityId" IS NOT NULL AND EXISTS (SELECT 1 FROM "club_memberships" cm WHERE cm."clubId" = t."communityId" AND cm."userId" = ${me})))`;
    const habits = `(SELECT a."activityType" FROM "activities" a WHERE a."userId" = ${me} AND a."verificationStatus" <> 'REJECTED'
                     GROUP BY a."activityType" ORDER BY count(*) DESC LIMIT 1)`;
    const fits = `COALESCE(t."eligibleActivities" ? ${habits}, false)`;
    const joinedByMe = `EXISTS (SELECT 1 FROM "table_registrations" mine WHERE mine."tableId" = t."id" AND mine."userId" = ${me})`;
    const mineLive = `((t."creatorId" = ${me} OR ${joinedByMe}) AND t."status" IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED')
                       AND (t."scoringClosesAt" IS NULL OR t."scoringClosesAt" > now()))`;
    const discoverable = `(t."status" = 'OPEN_FOR_ENTRY' AND t."visibility" = 'public' AND (t."entryClosesAt" IS NULL OR t."entryClosesAt" > now()))`;
    const hosted = `(t."creatorId" = ${me} AND t."status" NOT IN ('CANCELLED','PENDING_FUNDING','PENDING_APPROVAL','DRAFT','SCHEDULED'))`;
    const promoted = `(CASE WHEN t."promotedUntil" > now() THEN 0 ELSE 1 END), `;
    const where = [
      view === 'for-you' ? `((${discoverable} AND NOT ${joinedByMe}) OR ${mineLive})` : view === 'created' || view === 'archived' ? hosted : discoverable,
      view === 'archived' ? `t."archivedAt" IS NOT NULL` : `t."archivedAt" IS NULL`,
      `($1 = 'all' OR t."type" = $1)`, `($2 = 'all' OR t."challengeType" = $2)`,
      ...(view === 'starting' ? [`t."startsAt" > now()`] : []),
      ...(view === 'friends' ? [friendsInvolved] : []),
    ].join(' AND ');
    const order = view === 'archived' ? 't."archivedAt" DESC' : view === 'created' ? `(CASE WHEN ${mineLive} THEN 0 ELSE 1 END), t."createdAt" DESC`
      : view === 'starting' ? `${promoted}t."startsAt" ASC`
      : view === 'newest' ? `${promoted}t."createdAt" DESC`
      : view === 'for-you' ? `(CASE WHEN ${mineLive} THEN 1 ELSE 0 END) DESC, (CASE WHEN ${mineLive} THEN t."scoringClosesAt" END) ASC NULLS LAST,
                              ((CASE WHEN ${fits} THEN 3 ELSE 0 END) + (CASE WHEN ${friendsInvolved} THEN 2 ELSE 0 END)
                              + (CASE WHEN t."type" <> 'paid' THEN 1 ELSE 0 END) + ln(1 + ${joinedCount})) DESC, t."createdAt" DESC`
      : `${promoted}${joinedCount} DESC, t."createdAt" DESC`;
    const having = view === 'created' || view === 'archived' ? 'true' : `t."capacity" IS NULL OR ${joinedCount} < t."capacity"${view === 'for-you' ? ` OR ${mineLive}` : ''}`;
    return rows(this.db, ranked,
      `SELECT t."id", ${joinedCount}::integer AS n
       FROM "competition_tables" t LEFT JOIN "table_registrations" r ON r."tableId" = t."id"
       WHERE ${where}
       GROUP BY t."id" HAVING ${having}
       ORDER BY ${order} LIMIT 21 OFFSET $3`,
      params);
  }

  podiums(tableIds: string[], viewerId: string | null) {
    return rows(this.db, podiumRow,
      `SELECT * FROM (
         SELECT r."tableId", r."joinedAt", r."userId",
                COALESCE(p."displayName", u."displayName", 'Runner') AS "displayName", p."username", p."avatarUrl",
                CASE WHEN p."gender"='male' THEN 'masculine' WHEN p."gender"='female' THEN 'feminine' ELSE 'neutral' END "avatarStyle", p."verifiedAt" IS NOT NULL AS "verified",
                r."score", t."scoringMethod",
                row_number() OVER (PARTITION BY r."tableId" ORDER BY ${RANK_ORDER})::integer AS "rank"
         FROM "table_registrations" r
         JOIN "competition_tables" t ON t."id" = r."tableId"
         JOIN "users" u ON u."id" = r."userId" LEFT JOIN "profiles" p ON p."userId" = r."userId"
         WHERE r."tableId" = ANY($1::uuid[])
       ) ranked WHERE ranked."rank" <= 5 OR ranked."userId" = $2`,
      [tableIds, viewerId]);
  }

  entrantCounts(tableIds: string[]) {
    return rows(this.db, z.object({ tableId: id, n: num }),
      `SELECT "tableId", count(*)::int AS n FROM "table_registrations" WHERE "tableId" = ANY($1::uuid[]) GROUP BY "tableId"`,
      [tableIds]);
  }

  fundedTotals(tableIds: string[]) {
    return rows(this.db, z.object({ tableId: id, amount: num }),
      `SELECT "tableId", COALESCE(SUM("amountKobo"),0)::bigint AS amount
       FROM "payment_intents" WHERE "tableId" = ANY($1::uuid[]) AND "purpose"='SPONSOR_FUNDING' AND "status"='SUCCEEDED'
       GROUP BY "tableId"`,
      [tableIds]);
  }

  mine(userId: string) {
    return rows(this.db, mineRow,
      `WITH mine AS (
         SELECT t."id", (t."creatorId" = $1) AS "hosting", r."id" IS NOT NULL AS "joined", COALESCE(r."joinedAt", t."createdAt") AS "since"
         FROM "competition_tables" t
         LEFT JOIN "table_registrations" r ON r."tableId" = t."id" AND r."userId" = $1
         WHERE (t."creatorId" = $1 OR r."id" IS NOT NULL) AND t."status" <> 'CANCELLED' AND t."archivedAt" IS NULL
       ),
       ranked AS (
         SELECT r."tableId", r."userId",
                r."score", t."scoringMethod",
                row_number() OVER (PARTITION BY r."tableId" ORDER BY ${RANK_ORDER})::integer AS "rank",
                count(*) OVER (PARTITION BY r."tableId")::integer AS "entrants"
         FROM "table_registrations" r JOIN "competition_tables" t ON t."id" = r."tableId"
         WHERE r."tableId" IN (SELECT "id" FROM mine)
       )
       SELECT t."id", t."code", t."title", t."type", t."challengeType", t."scoringMethod", t."targetDistanceMetres",
              t."status", t."startsAt", t."scoringClosesAt", t."visibility", t."guaranteedPrizeKobo"::float8 AS "guaranteedPrizeKobo", t."createdAt", m."hosting", m."joined",
              COALESCE((SELECT max(x."entrants") FROM ranked x WHERE x."tableId" = t."id"), 0) AS "entrants",
              t."targetSteps", t."targetSeconds", t."targetSessions", t."dailyTarget",
              me."rank" AS "myRank", me."score" AS "myScore",
              (SELECT x."score" FROM ranked x WHERE x."tableId" = t."id" AND x."rank" = 1) AS "leaderScore",
              ahead."score" AS "aheadScore", (SELECT p."displayName" FROM "profiles" p WHERE p."userId" = ahead."userId") AS "aheadName",
              behind."score" AS "behindScore", (SELECT p."displayName" FROM "profiles" p WHERE p."userId" = behind."userId") AS "behindName"
       FROM mine m JOIN "competition_tables" t ON t."id" = m."id"
       LEFT JOIN ranked me ON me."tableId" = t."id" AND me."userId" = $1
       LEFT JOIN ranked ahead ON ahead."tableId" = t."id" AND ahead."rank" = me."rank" - 1
       LEFT JOIN ranked behind ON behind."tableId" = t."id" AND behind."rank" = me."rank" + 1
       ORDER BY CASE WHEN m."hosting" AND t."status"='PENDING_FUNDING' THEN 0
                     WHEN t."status" IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED') THEN 1 ELSE 2 END,
                t."scoringClosesAt" ASC NULLS LAST, m."since" DESC
       LIMIT 100`,
      [userId]);
  }

  liveFor(userId: string, activity: 'run' | 'walk' | 'cycle') {
    return rows(this.db, z.object({ id, code: text, title: text, challengeType: text, type: text }),
      `SELECT t."id", t."code", t."title", t."challengeType", t."type"
       FROM "table_registrations" r JOIN "competition_tables" t ON t."id"=r."tableId"
       WHERE r."userId"=$1 AND t."status" IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED')
         AND COALESCE(t."startsAt", '-infinity'::timestamptz) <= now()
         AND COALESCE(t."scoringClosesAt", 'infinity'::timestamptz) > now()
         AND t."eligibleActivities" ? $2
       ORDER BY t."scoringClosesAt" ASC LIMIT 50`,
      [userId, activity]);
  }

  async createSeries(db: Db, input: { clubId: string; title: string; cadence: string; template: unknown; autoPublish: boolean; nextStartsAt: Date; createdByUserId: string }) {
    const created = await row(db, z.object({ id }),
      `INSERT INTO "challenge_series" ("clubId","title","cadence","template","autoPublish","nextStartsAt","lastEdition","createdByUserId")
       VALUES ($1,$2,$3,$4,$5,$6,1,$7) RETURNING "id"`,
      [input.clubId, input.title, input.cadence, JSON.stringify(input.template), input.autoPublish, input.nextStartsAt, input.createdByUserId]);
    return created!.id;
  }

  async activeCreatorId(userId: string) {
    return (await row(this.db, z.object({ id }), `SELECT "id" FROM "creator_profiles" WHERE "userId"=$1 AND "status"='ACTIVE'`, [userId]))?.id;
  }

  invitedOrMember(db: Db, tableId: string, userId: string, clubId: string | null) {
    return exists(db,
      `SELECT 1 FROM "challenge_invitations" i JOIN "users" u ON u."id"=$2
       WHERE i."tableId"=$1 AND i."status"<>'DECLINED' AND (i."invitedUserId"=u."id" OR (u."emailVerified" AND lower(i."email")=lower(u."email")))
       UNION ALL
       SELECT 1 FROM "club_memberships" m WHERE m."clubId"=$3 AND m."userId"=$2`,
      [tableId, userId, clubId]);
  }

  acceptPendingInvitation(db: Db, tableId: string, userId: string) {
    return run(db,
      `UPDATE "challenge_invitations" SET "status"='ACCEPTED',"respondedAt"=now()
       WHERE "tableId"=$1 AND "invitedUserId"=$2 AND "status"='PENDING'`,
      [tableId, userId]);
  }

  async moneyFlags(db: Db, tableId: string, creatorId: string) {
    return (await row(db, z.object({ paid: flag, entered: flag, awarded: flag }),
      `SELECT
         EXISTS (SELECT 1 FROM "payment_intents" WHERE "tableId"=$1 AND "status" NOT IN ('INITIATED','FAILED')) AS "paid",
         EXISTS (SELECT 1 FROM "table_registrations" WHERE "tableId"=$1 AND "userId"<>$2) AS "entered",
         EXISTS (SELECT 1 FROM "prize_awards" WHERE "tableId"=$1) AS "awarded"`,
      [tableId, creatorId]))!;
  }

  async otherEntrants(db: Db, tableId: string, userId: string) {
    return (await rows(db, z.object({ userId: id }), `SELECT "userId" FROM "table_registrations" WHERE "tableId"=$1 AND "userId"<>$2`, [tableId, userId]))
      .map((entrant) => entrant.userId);
  }

  declinePendingInvitations(db: Db, tableId: string) {
    return run(db, `UPDATE "challenge_invitations" SET "status"='DECLINED',"respondedAt"=now() WHERE "tableId"=$1 AND "status"='PENDING'`, [tableId]);
  }

  notifyDeleted(userIds: string[], title: string) {
    return run(this.db,
      `INSERT INTO "notifications" ("userId","type","title","body","link")
       SELECT unnest($1::uuid[]),'COMPETITION_DELETED',$2,'The host deleted it. Your activities still count everywhere else.','/competitions'`,
      [userIds, `${title} was deleted`]);
  }

  hasSucceededPayment(db: Db, tableId: string) {
    return exists(db, `SELECT 1 FROM "payment_intents" WHERE "tableId"=$1 AND "status"='SUCCEEDED' LIMIT 1`, [tableId]);
  }

  standings(tableId: string) {
    return rows(this.db, standingRow,
      `SELECT row_number() OVER (ORDER BY ${RANK_ORDER})::integer rank,
              r."userId",COALESCE(p."displayName",u."displayName",'Runner') "displayName",p."username",p."avatarUrl",
              CASE WHEN p."gender"='male' THEN 'masculine' WHEN p."gender"='female' THEN 'feminine' ELSE 'neutral' END "avatarStyle", p."verifiedAt" IS NOT NULL AS "verified",
              r."creditedDistanceMetres",r."creditedSteps",r."completionTimeSeconds",r."score",r."targetReachedAt",r."qualified"
       FROM "table_registrations" r JOIN "users" u ON u."id"=r."userId" LEFT JOIN "profiles" p ON p."userId"=r."userId" WHERE r."tableId"=$1
       ORDER BY ${RANK_ORDER} LIMIT 500`,
      [tableId]);
  }

  club(clubId: string, seriesId: string | null) {
    return row(this.db,
      z.object({ name: text, slug: text, logoUrl: text.nullable(), accentColor: text.nullable(), website: text.nullable(), verified: flag, followerCount: num, seriesTitle: text.nullable(), seriesCadence: text.nullable() }),
      `SELECT c."name", c."slug", c."logoUrl", c."accentColor", c."website", c."verifiedAt" IS NOT NULL AS "verified",
              (SELECT count(*) FROM "club_follows" f WHERE f."clubId" = c."id")::integer AS "followerCount",
              s."title" AS "seriesTitle", s."cadence" AS "seriesCadence"
       FROM "clubs" c LEFT JOIN "challenge_series" s ON s."id" = $2 WHERE c."id" = $1`,
      [clubId, seriesId]);
  }

  host(userId: string) {
    return row(this.db, z.object({ username: text, avatarUrl: text.nullable(), avatarStyle, verified: flag }),
      `SELECT "username", "avatarUrl", "verifiedAt" IS NOT NULL AS "verified",
         CASE WHEN "gender"='male' THEN 'masculine' WHEN "gender"='female' THEN 'feminine' ELSE 'neutral' END "avatarStyle"
       FROM "profiles" WHERE "userId" = $1`,
      [userId]);
  }

  prizes(tableId: string, withRedeemInstructions: boolean) {
    return rows(this.db,
      z.object({
        position: num, kind: text, productName: text, description: text.nullable(), imageUrl: text.nullable(), quantity: num,
        estimatedValue: num.nullable(), currency: text.nullable(), redeemInstructions: text.nullable().optional(),
      }),
      `SELECT "position","kind","productName","description","imageUrl","quantity","estimatedValue","currency"${withRedeemInstructions ? ',"redeemInstructions"' : ''}
       FROM "competition_prizes" WHERE "tableId" = $1 ORDER BY "position"`,
      [tableId]);
  }

  prizeWinners(tableId: string) {
    return rows(this.db, z.object({ position: num, displayName: text, username: text.nullable(), productName: text }),
      `SELECT a."position", COALESCE(p."displayName", u."displayName", 'Runner') AS "displayName", p."username", pr."productName"
       FROM "product_awards" a JOIN "users" u ON u."id" = a."userId" LEFT JOIN "profiles" p ON p."userId" = a."userId" JOIN "competition_prizes" pr ON pr."id" = a."prizeId"
       WHERE a."tableId" = $1 AND a."status" <> 'FORFEITED' ORDER BY a."position", a."standingRank"`,
      [tableId]);
  }

  latestResult(tableId: string) {
    return row(this.db, z.object({ tableId: id, version: num, standings: z.unknown(), algorithmVersion: text.nullable() }).passthrough(),
      `SELECT s.*, snap."standings", snap."algorithmVersion" FROM "table_settlements" s
       JOIN "table_leaderboard_snapshots" snap ON snap."id" = s."snapshotId"
       WHERE s."tableId" = $1 ORDER BY s."version" DESC LIMIT 1`,
      [tableId]);
  }

  async verifiedEmails(emails: string[]) {
    if (!emails.length) return new Set<string>();
    const found = await rows(this.db, z.object({ email: text }),
      `SELECT lower("email") "email" FROM "users" WHERE "emailVerified"=true AND lower("email")=ANY($1::text[])`, [emails]);
    return new Set(found.map((user) => user.email));
  }

  inviteClubMembers(db: Db, tableId: string, clubId: string, creatorId: string) {
    return run(db,
      `INSERT INTO "challenge_invitations" ("tableId","invitedUserId")
       SELECT $1,m."userId" FROM "club_memberships" m WHERE m."clubId"=$2 AND m."userId"<>$3
       ON CONFLICT DO NOTHING`,
      [tableId, clubId, creatorId]);
  }

  inviteEmails(db: Db, tableId: string, emails: string[]) {
    return run(db, `INSERT INTO "challenge_invitations" ("tableId","email") SELECT $1,unnest($2::varchar[]) ON CONFLICT DO NOTHING`, [tableId, emails]);
  }

  invitePhones(db: Db, tableId: string, phones: string[]) {
    return run(db, `INSERT INTO "challenge_invitations" ("tableId","phone") SELECT $1,unnest($2::varchar[]) ON CONFLICT DO NOTHING`, [tableId, phones]);
  }

  notifyInvitees(db: Db, table: { id: string; title: string; code: string; creatorId: string }) {
    return run(db,
      `INSERT INTO "notifications" ("userId","type","title","body","link")
       SELECT DISTINCT targets."userId",'CHALLENGE_INVITE','You’re invited to a competition',$2,$4
       FROM (
         SELECT i."invitedUserId" "userId" FROM "challenge_invitations" i WHERE i."tableId"=$1 AND i."invitedUserId" IS NOT NULL
         UNION
         SELECT u."id" FROM "challenge_invitations" i JOIN "users" u ON lower(u."email")=i."email" WHERE i."tableId"=$1
       ) targets WHERE targets."userId"<>$3`,
      [table.id, `Join ${table.title} with code ${table.code}.`, table.creatorId, `/competitions/${table.code}`]);
  }

  invitations(tableId: string) {
    return rows(this.db, z.object({ id, email: text.nullable(), phone: text.nullable(), username: text.nullable(), status: text, createdAt: when }),
      `SELECT i."id",i."email",i."phone",p."username",i."status",i."createdAt"
       FROM "challenge_invitations" i LEFT JOIN "profiles" p ON p."userId"=i."invitedUserId"
       WHERE i."tableId"=$1 ORDER BY i."createdAt" DESC LIMIT 200`,
      [tableId]);
  }

  runnerByUsername(db: Db, username: string) {
    return row(db, runner,
      `SELECT p."userId",p."username",u."email",p."displayName" FROM "profiles" p JOIN "users" u ON u."id"=p."userId" WHERE lower(p."username")=lower($1)`,
      [username]);
  }

  opponentAlreadyInvited(db: Db, tableId: string, runnerId: string) {
    return exists(db,
      `SELECT 1 FROM "challenge_invitations" WHERE "tableId"=$1 AND "status"<>'DECLINED' AND ("invitedUserId" IS NULL OR "invitedUserId"<>$2) LIMIT 1`,
      [tableId, runnerId]);
  }

  async createInvitation(db: Db, tableId: string, userId: string) {
    return (await row(db, z.object({ id }),
      `INSERT INTO "challenge_invitations" ("tableId","invitedUserId") VALUES ($1,$2)
       ON CONFLICT DO NOTHING RETURNING "id"`,
      [tableId, userId]))?.id;
  }

  invitationFor(db: Db, tableId: string, userId: string) {
    return row(db, z.object({ id, status: text }), `SELECT "id","status" FROM "challenge_invitations" WHERE "tableId"=$1 AND "invitedUserId"=$2`, [tableId, userId]);
  }

  async sendInvitationMessage(db: Db, input: { senderId: string; recipientId: string; body: string; invitationId: string }) {
    return Boolean(await row(db, z.object({ id }),
      `INSERT INTO "direct_messages" ("senderId","recipientId","body","invitationId") VALUES ($1,$2,$3,$4)
       ON CONFLICT ("invitationId") WHERE "invitationId" IS NOT NULL DO NOTHING RETURNING "id"`,
      [input.senderId, input.recipientId, input.body, input.invitationId]));
  }

  notifyInvited(db: Db, userId: string, body: string, link: string) {
    return run(db,
      `INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,'CHALLENGE_INVITE','You’re invited to a competition',$2,$3)`,
      [userId, body, link]);
  }

  lockInvitation(db: Db, invitationId: string, userId: string) {
    return row(db, z.object({ id, tableId: id, status: text }),
      `SELECT i."id",i."tableId",i."status" FROM "challenge_invitations" i
       WHERE i."id"=$1 AND i."invitedUserId"=$2 FOR UPDATE OF i`,
      [invitationId, userId]);
  }

  entryPaymentInProgress(db: Db, tableId: string, userId: string) {
    return exists(db,
      `SELECT 1 FROM "payment_intents" WHERE "tableId"=$1 AND "userId"=$2 AND "purpose"='CHALLENGE_ENTRY'
       AND "status" IN ('INITIATED','PENDING','RECONCILIATION_REQUIRED') LIMIT 1`,
      [tableId, userId]);
  }

  answerInvitation(db: Db, invitationId: string, status: 'ACCEPTED' | 'DECLINED') {
    return run(db, `UPDATE "challenge_invitations" SET "status"=$2,"respondedAt"=now() WHERE "id"=$1`, [invitationId, status]);
  }

  async entrantsOtherThan(db: Db, tableId: string, userId: string) {
    return (await row(db, z.object({ count: num }),
      `SELECT COUNT(*)::integer count FROM "table_registrations" WHERE "tableId"=$1 AND "userId"<>$2`, [tableId, userId]))!.count;
  }

  async clubMemberCount(clubId: string) {
    return (await row(this.db, z.object({ members: num }), `SELECT count(*)::integer AS "members" FROM "club_memberships" WHERE "clubId" = $1`, [clubId]))!.members;
  }

  isClubManager(clubId: string, userId: string) {
    return exists(this.db, `SELECT 1 FROM "club_memberships" WHERE "clubId"=$1 AND "userId"=$2 AND "role" IN ('owner','admin')`, [clubId, userId]);
  }
}
