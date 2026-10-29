import { EntityManager } from 'typeorm';
import { COUNTED_STATUSES, countedMetres } from '../running/counted';

export async function refreshLeagueDistance(manager: EntityManager, userId: string) {
  await manager.query(
    `INSERT INTO "league_memberships" ("seasonId", "divisionId", "userId")
     SELECT s."id", d."id", u."id" FROM "league_seasons" s
     CROSS JOIN (SELECT "id" FROM "league_divisions" ORDER BY "level" ASC LIMIT 1) d
     JOIN "users" u ON u."id" = $1 AND u."role" = 'runner'
     WHERE s."status" = 'ACTIVE'
     ON CONFLICT ("seasonId", "userId") DO NOTHING`,
    [userId],
  );
  await manager.query(
    `UPDATE "league_memberships" m
     SET "creditedDistanceMetres" = COALESCE((
       SELECT SUM(${countedMetres()}) FROM "activities" a
       WHERE a."userId" = m."userId" AND a."verificationStatus" IN ${COUNTED_STATUSES} AND a."activityType" IN ('walk','run')
         AND a."startedAt" >= s."startsAt" AND a."startedAt" < s."endsAt"
     ), 0)::integer
     FROM "league_seasons" s
     WHERE m."seasonId" = s."id" AND s."status" = 'ACTIVE' AND m."userId" = $1`,
    [userId],
  );
}

export async function refreshSeasonDistances(manager: EntityManager, seasonId: string) {
  await manager.query(
    `UPDATE "league_memberships" m
     SET "creditedDistanceMetres" = COALESCE((
       SELECT SUM(${countedMetres()}) FROM "activities" a
       WHERE a."userId" = m."userId" AND a."verificationStatus" IN ${COUNTED_STATUSES} AND a."activityType" IN ('walk','run')
         AND a."startedAt" >= s."startsAt" AND a."startedAt" < s."endsAt"
     ), 0)::integer
     FROM "league_seasons" s
     WHERE m."seasonId" = s."id" AND s."id" = $1`,
    [seasonId],
  );
}
