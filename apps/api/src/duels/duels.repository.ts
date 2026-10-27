import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { Db, id, num, row, rows, run, text, when } from '../database/sql';
import { blockedBetween } from '../safety/safety.sql';
import { DuelActivity, SessionTrack } from './duel-progress';
import { duelJson } from './duels.sql';

export const duelRow = z.object({
  id, challengerId: id, opponentId: id, activity: z.enum(['run', 'walk', 'cycle', 'any']), targetMetres: num, minutes: num, status: text,
  challengerReadyAt: when.nullable(), opponentReadyAt: when.nullable(), startsAt: when.nullable(), endsAt: when.nullable(), expiresAt: when,
});
export type DuelRow = z.output<typeof duelRow>;

const COLUMNS = `"id","challengerId","opponentId","activity","targetMetres","minutes","status","challengerReadyAt","opponentReadyAt","startsAt","endsAt","expiresAt"`;

const sample = z.object({
  sessionId: id, activityType: z.enum(['walk', 'run', 'cycle']), latitude: z.number(), longitude: z.number(),
  accuracy: z.number().nullable(), stepCount: z.number().nullable(), recordedAt: when,
});

export interface Notice {
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string;
  email: boolean;
}

@Injectable()
export class DuelsRepository {
  constructor(readonly dataSource: DataSource) {}

  async runner(username: string) {
    return row(this.dataSource, z.object({ userId: id, username: text, displayName: text }),
      `SELECT "userId","username","displayName" FROM "profiles" WHERE lower("username")=lower($1)`, [username.replace(/^@/, '')]);
  }

  async displayName(userId: string) {
    return (await row(this.dataSource, z.object({ displayName: text }), `SELECT "displayName" FROM "profiles" WHERE "userId"=$1`, [userId]))?.displayName ?? 'A runner';
  }

  async canDuel(senderId: string, recipientId: string) {
    return row(this.dataSource, z.object({ blocked: z.boolean(), closed: z.boolean() }),
      `SELECT ${blockedBetween('$1', '$2')} AS "blocked",
              EXISTS (SELECT 1 FROM "profiles" rp WHERE rp."userId"=$2 AND rp."messagesFrom"='following'
                AND NOT EXISTS (SELECT 1 FROM "follows" rf WHERE rf."followerId"=$2 AND rf."followingId"=$1)) AS "closed"`,
      [senderId, recipientId]);
  }

  async insert(db: Db, input: { challengerId: string; opponentId: string; activity: DuelActivity; targetMetres: number; minutes: number }) {
    return row(db, duelRow,
      `INSERT INTO "duels" ("challengerId","opponentId","activity","targetMetres","minutes","expiresAt")
       VALUES ($1,$2,$3,$4,$5,now() + interval '24 hours') RETURNING ${COLUMNS}`,
      [input.challengerId, input.opponentId, input.activity, input.targetMetres, input.minutes]);
  }

  postToChat(db: Db, duel: DuelRow) {
    return run(db, `INSERT INTO "direct_messages" ("senderId","recipientId","body","duelId") VALUES ($1,$2,'',$3)`, [duel.challengerId, duel.opponentId, duel.id]);
  }

  lock(db: Db, duelId: string) {
    return row(db, duelRow, `SELECT ${COLUMNS} FROM "duels" WHERE "id"=$1 FOR UPDATE`, [duelId]);
  }

  setStatus(db: Db, duelId: string, status: string, extra = '') {
    return run(db, `UPDATE "duels" SET "status"=$2${extra} WHERE "id"=$1`, [duelId, status]);
  }

  markReady(db: Db, duelId: string, userId: string) {
    return run(db,
      `UPDATE "duels" SET
         "challengerReadyAt"=CASE WHEN "challengerId"=$2 THEN now() ELSE "challengerReadyAt" END,
         "opponentReadyAt"=CASE WHEN "opponentId"=$2 THEN now() ELSE "opponentReadyAt" END
       WHERE "id"=$1`, [duelId, userId]);
  }

  async start(db: Db, duelId: string) {
    return row(db, duelRow,
      `WITH started AS (
         UPDATE "duels" SET "status"='LIVE',"startsAt"=now() + interval '10 seconds',
           "endsAt"=now() + interval '10 seconds' + "minutes" * interval '1 minute'
         WHERE "id"=$1 AND "status"='ACCEPTED' RETURNING ${COLUMNS}
       ) SELECT * FROM started`, [duelId]);
  }

  postToFeed(db: Db, duel: DuelRow) {
    return run(db, `INSERT INTO "feed_posts" ("userId","body","duelId") VALUES ($1,'',$2) ON CONFLICT DO NOTHING`, [duel.challengerId, duel.id]);
  }

  async summary(viewerId: string, duelId: string) {
    return (await row(this.dataSource, z.object({ duel: z.record(z.unknown()) }),
      `SELECT ${duelJson('d')} AS "duel" FROM "duels" d
       WHERE d."id"=$1 AND NOT ${blockedBetween('$2', 'd."challengerId"')} AND NOT ${blockedBetween('$2', 'd."opponentId"')}`,
      [duelId, viewerId]))?.duel;
  }

  async tracks(userId: string, activity: DuelActivity, from: Date, until: Date): Promise<SessionTrack[]> {
    const points = await rows(this.dataSource, sample,
      `SELECT s."id" AS "sessionId", s."activityType", g."latitude", g."longitude", g."accuracy", g."stepCount", g."recordedAt"
       FROM "running_sessions" s
       JOIN "gps_samples" g ON g."sessionId"=s."id"
       LEFT JOIN "activities" a ON a."runningSessionId"=s."id"
       WHERE s."userId"=$1 AND ($2='any' OR s."activityType"=$2)
         AND s."startedAt" <= $4 AND (s."finishedAt" IS NULL OR s."finishedAt" >= $3)
         AND (a."id" IS NULL OR a."verificationStatus"<>'REJECTED')
         AND g."recordedAt" BETWEEN $3 AND $4
       ORDER BY s."id", g."sequence"`,
      [userId, activity, from, until]);
    const bySession = new Map<string, SessionTrack>();
    for (const point of points) {
      const track = bySession.get(point.sessionId) ?? { activityType: point.activityType, points: [] };
      track.points.push({ latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy, stepCount: point.stepCount, recordedAt: new Date(point.recordedAt) });
      bySession.set(point.sessionId, track);
    }
    return [...bySession.values()];
  }

  live() {
    return rows(this.dataSource, duelRow, `SELECT ${COLUMNS} FROM "duels" WHERE "status"='LIVE' AND "startsAt" <= now()`);
  }

  async finish(duelId: string, result: { challengerMetres: number; opponentMetres: number; challengerReachedAt: Date | null; opponentReachedAt: Date | null; winnerId: string | null }) {
    return row(this.dataSource, duelRow,
      `WITH finished AS (
         UPDATE "duels" SET "status"='FINISHED',"settledAt"=now(),"challengerMetres"=$2,"opponentMetres"=$3,
           "challengerReachedAt"=$4,"opponentReachedAt"=$5,"winnerId"=$6
         WHERE "id"=$1 AND "status"='LIVE' RETURNING ${COLUMNS}
       ) SELECT * FROM finished`,
      [duelId, result.challengerMetres, result.opponentMetres, result.challengerReachedAt, result.opponentReachedAt, result.winnerId]);
  }

  expire() {
    return rows(this.dataSource, duelRow,
      `WITH expired AS (
         UPDATE "duels" SET "status"='EXPIRED' WHERE "status" IN ('PENDING','ACCEPTED') AND "expiresAt" <= now() RETURNING ${COLUMNS}
       ) SELECT * FROM expired`);
  }

  async notify(db: Db, notices: Notice[]) {
    for (const notice of notices) {
      await run(db,
        `INSERT INTO "notifications" ("userId","type","title","body","link","emailProcessedAt") VALUES ($1,$2,$3,$4,$5,CASE WHEN $6 THEN NULL ELSE now() END)`,
        [notice.userId, notice.type, notice.title, notice.body, notice.link, notice.email]);
    }
  }
}
