import { EntityManager } from 'typeorm';

/**
 * Recompute a runner's distance in the active league season from their verified activities.
 * Recomputing (rather than adding) keeps it correct when a review later approves or rejects an
 * activity, and makes repeated calls harmless. Places the runner in the bottom division if they
 * have no membership yet.
 */
export async function refreshLeagueDistance(manager: EntityManager, userId: string) {
  await manager.query(
    `INSERT INTO "league_memberships" ("seasonId", "divisionId", "userId")
     SELECT s."id", d."id", $1 FROM "league_seasons" s
     CROSS JOIN (SELECT "id" FROM "league_divisions" ORDER BY "level" ASC LIMIT 1) d
     WHERE s."status" = 'ACTIVE'
     ON CONFLICT ("seasonId", "userId") DO NOTHING`,
    [userId],
  );
  await manager.query(
    `UPDATE "league_memberships" m
     SET "creditedDistanceMetres" = COALESCE((
       SELECT SUM(a."validatedDistanceMetres") FROM "activities" a
       WHERE a."userId" = m."userId" AND a."verificationStatus" = 'VERIFIED'
         AND a."startedAt" >= s."startsAt" AND a."startedAt" < s."endsAt"
     ), 0)::integer
     FROM "league_seasons" s
     WHERE m."seasonId" = s."id" AND s."status" = 'ACTIVE' AND m."userId" = $1`,
    [userId],
  );
}

/** Same recompute for every member of one season — used when a season closes. */
export async function refreshSeasonDistances(manager: EntityManager, seasonId: string) {
  await manager.query(
    `UPDATE "league_memberships" m
     SET "creditedDistanceMetres" = COALESCE((
       SELECT SUM(a."validatedDistanceMetres") FROM "activities" a
       WHERE a."userId" = m."userId" AND a."verificationStatus" = 'VERIFIED'
         AND a."startedAt" >= s."startsAt" AND a."startedAt" < s."endsAt"
     ), 0)::integer
     FROM "league_seasons" s
     WHERE m."seasonId" = s."id" AND s."id" = $1`,
    [seasonId],
  );
}
