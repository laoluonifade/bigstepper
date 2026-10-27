import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { Db, exists, id, num, row, rows, run, text, when } from '../database/sql';
import { ReportReason, ReportTarget } from './safety.sql';

const avatarStyle = z.enum(['masculine', 'feminine', 'neutral']);
const person = `CASE WHEN p."gender"='male' THEN 'masculine' WHEN p."gender"='female' THEN 'feminine' ELSE 'neutral' END`;

const target = z.object({ userId: id, snapshot: z.record(z.unknown()) });

const reportRow = z.object({
  id, targetType: text, targetId: id, reason: text, note: text.nullable(), snapshot: z.unknown(), status: text,
  resolution: text.nullable(), resolutionNote: text.nullable(), createdAt: when, resolvedAt: when.nullable(),
  reporterUsername: text.nullable(), reporterName: text.nullable(),
  targetUserId: id.nullable(), targetUsername: text.nullable(), targetName: text.nullable(), targetSuspended: z.boolean(),
  sameTargetReports: num, resolvedBy: text.nullable(),
});

@Injectable()
export class SafetyRepository {
  constructor(private readonly dataSource: DataSource) {}

  private get db(): Db {
    return this.dataSource;
  }

  async userIdByUsername(username: string) {
    return (await row(this.db, z.object({ userId: id }), `SELECT "userId" FROM "profiles" WHERE lower("username")=lower($1)`, [username.replace(/^@/, '')]))?.userId;
  }

  block(db: Db, blockerId: string, blockedId: string) {
    return run(db, `INSERT INTO "user_blocks" ("blockerId","blockedId") VALUES ($1,$2) ON CONFLICT DO NOTHING`, [blockerId, blockedId]);
  }

  unfollowBothWays(db: Db, a: string, b: string) {
    return run(db, `DELETE FROM "follows" WHERE ("followerId"=$1 AND "followingId"=$2) OR ("followerId"=$2 AND "followingId"=$1)`, [a, b]);
  }

  unblock(blockerId: string, blockedId: string) {
    return run(this.db, `DELETE FROM "user_blocks" WHERE "blockerId"=$1 AND "blockedId"=$2`, [blockerId, blockedId]);
  }

  blockedBetween(a: string, b: string) {
    return exists(this.db, `SELECT 1 FROM "user_blocks" WHERE ("blockerId"=$1 AND "blockedId"=$2) OR ("blockerId"=$2 AND "blockedId"=$1)`, [a, b]);
  }

  blocked(userId: string) {
    return rows(this.db,
      z.object({ username: text, displayName: text, avatarUrl: text.nullable(), avatarStyle, blockedAt: when }),
      `SELECT p."username", p."displayName", p."avatarUrl", ${person} "avatarStyle", b."createdAt" "blockedAt"
       FROM "user_blocks" b JOIN "profiles" p ON p."userId"=b."blockedId"
       WHERE b."blockerId"=$1 ORDER BY b."createdAt" DESC`,
      [userId]);
  }

  rant(postId: string) {
    return row(this.db, target,
      `SELECT f."userId", jsonb_build_object('body', f."body", 'imageUrl', f."imageUrl", 'activityId', f."activityId", 'createdAt', f."createdAt") "snapshot"
       FROM "feed_posts" f WHERE f."id"=$1`,
      [postId]);
  }

  comment(commentId: string) {
    return row(this.db, target,
      `SELECT c."userId", jsonb_build_object('body', c."body", 'postId', c."postId", 'createdAt', c."createdAt") "snapshot"
       FROM "feed_comments" c WHERE c."id"=$1`,
      [commentId]);
  }

  messageSeenBy(messageId: string, viewerId: string) {
    return row(this.db, target,
      `SELECT m."senderId" "userId", jsonb_build_object('body', m."body", 'audioUrl', m."audioUrl", 'clubId', m."clubId", 'createdAt', m."createdAt") "snapshot"
       FROM "direct_messages" m
       WHERE m."id"=$1 AND (m."recipientId"=$2 OR m."senderId"=$2
         OR (m."clubId" IS NOT NULL AND EXISTS (SELECT 1 FROM "club_memberships" cm WHERE cm."clubId"=m."clubId" AND cm."userId"=$2)))`,
      [messageId, viewerId]);
  }

  profile(userId: string) {
    return row(this.db, target,
      `SELECT p."userId", jsonb_build_object('username', p."username", 'displayName', p."displayName", 'bio', p."bio", 'avatarUrl', p."avatarUrl") "snapshot"
       FROM "profiles" p WHERE p."userId"=$1`,
      [userId]);
  }

  async createReport(report: { reporterId: string; targetType: ReportTarget; targetId: string; targetUserId: string; reason: ReportReason; note: string | null; snapshot: unknown }) {
    return Boolean(await row(this.db, z.object({ id }),
      `INSERT INTO "content_reports" ("reporterId","targetType","targetId","targetUserId","reason","note","snapshot")
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT ("reporterId","targetType","targetId") DO NOTHING RETURNING "id"`,
      [report.reporterId, report.targetType, report.targetId, report.targetUserId, report.reason, report.note, JSON.stringify(report.snapshot)]));
  }

  reports(open: boolean) {
    return rows(this.db, reportRow,
      `SELECT r."id", r."targetType", r."targetId", r."reason", r."note", r."snapshot", r."status", r."resolution", r."resolutionNote",
              r."createdAt", r."resolvedAt", rp."username" "reporterUsername", rp."displayName" "reporterName",
              r."targetUserId", tp."username" "targetUsername", tp."displayName" "targetName", (tu."suspendedAt" IS NOT NULL) "targetSuspended",
              (SELECT count(*)::integer FROM "content_reports" s WHERE s."targetType"=r."targetType" AND s."targetId"=r."targetId") "sameTargetReports",
              ap."displayName" "resolvedBy"
       FROM "content_reports" r
       LEFT JOIN "profiles" rp ON rp."userId"=r."reporterId"
       LEFT JOIN "profiles" tp ON tp."userId"=r."targetUserId"
       LEFT JOIN "users" tu ON tu."id"=r."targetUserId"
       LEFT JOIN "profiles" ap ON ap."userId"=r."resolvedByUserId"
       WHERE (r."status"='OPEN') = $1
       ORDER BY ${open ? 'r."createdAt" ASC' : 'r."resolvedAt" DESC'} LIMIT 200`,
      [open]);
  }

  lockReport(db: Db, reportId: string) {
    return row(db, z.object({ id, targetType: z.enum(['rant', 'comment', 'message', 'profile']), targetId: id, targetUserId: id.nullable(), status: text }),
      `SELECT "id","targetType","targetId","targetUserId","status" FROM "content_reports" WHERE "id"=$1 FOR UPDATE`, [reportId]);
  }

  async resolveOpen(db: Db, input: { targetType: ReportTarget; targetId: string; status: 'DISMISSED' | 'ACTIONED'; resolution: string; note: string | null; actorUserId: string }) {
    return (await rows(db, z.object({ reporterId: id }),
      `WITH resolved AS (
         UPDATE "content_reports" SET "status"=$3,"resolution"=$4,"resolutionNote"=$5,"resolvedByUserId"=$6,"resolvedAt"=now()
         WHERE "targetType"=$1 AND "targetId"=$2 AND "status"='OPEN' RETURNING "reporterId"
       ) SELECT DISTINCT "reporterId" FROM resolved`,
      [input.targetType, input.targetId, input.status, input.resolution, input.note, input.actorUserId])).map((report) => report.reporterId);
  }

  removeContent(db: Db, targetType: Exclude<ReportTarget, 'profile'>, targetId: string) {
    const table = { rant: 'feed_posts', comment: 'feed_comments', message: 'direct_messages' }[targetType];
    return run(db, `DELETE FROM "${table}" WHERE "id"=$1`, [targetId]);
  }

  async suspend(db: Db, userId: string, reason: string) {
    await run(db, `UPDATE "users" SET "suspendedAt"=COALESCE("suspendedAt",now()),"suspendedReason"=$2 WHERE "id"=$1`, [userId, reason]);
    await run(db, `UPDATE "auth_sessions" SET "revokedAt"=now() WHERE "userId"=$1 AND "revokedAt" IS NULL AND COALESCE("scope",'app')<>'admin'`, [userId]);
  }

  async unsuspend(db: Db, userId: string) {
    return Boolean(await row(db, z.object({ id }),
      `WITH lifted AS (UPDATE "users" SET "suspendedAt"=NULL,"suspendedReason"=NULL WHERE "id"=$1 AND "suspendedAt" IS NOT NULL RETURNING "id") SELECT * FROM lifted`,
      [userId]));
  }

  audit(db: Db, event: { actorUserId: string; action: string; targetType: string; targetId: string; metadata: unknown }) {
    return run(db,
      `INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId","metadata") VALUES ($1,$2,$3,$4,$5)`,
      [event.actorUserId, event.action, event.targetType, event.targetId, JSON.stringify(event.metadata)]);
  }

  thankReporters(db: Db, reporterIds: string[], actioned: boolean) {
    if (!reporterIds.length) return Promise.resolve();
    return run(db,
      `INSERT INTO "notifications" ("userId","type","title","body") SELECT unnest($1::uuid[]),'REPORT_RESOLVED',$2,$3`,
      [reporterIds, 'Thanks for your report',
        actioned ? 'We reviewed what you reported and took action. Thanks for helping keep Jump safe.' : 'We reviewed what you reported. It didn’t break our rules this time, but thanks for flagging it.']);
  }
}
