import { EntityManager } from 'typeorm';
import { RANK_ORDER } from './scoring-engine';

export interface Trophy {
  tableId: string;
  code: string;
  title: string;
  challengeType: string;
  scoringMethod: string;
  bannerUrl: string | null;
  endedAt: string;
  /** 1, 2 or 3. */
  rank: number;
  entrants: number;
  score: number | null;
}

/** Live competitions that have finished: scoring closed (or settled), not cancelled, drafts or deleted. */
const ENDED = `t."deletedAt" IS NULL AND t."status" NOT IN ('CANCELLED','DRAFT','SCHEDULED','PENDING_FUNDING','PENDING_APPROVAL')
  AND (t."status" = 'SETTLED' OR (t."scoringClosesAt" IS NOT NULL AND t."scoringClosesAt" <= now()))`;

/** Placed, and earned it: at least two people took part and this one actually scored. */
const PODIUM = `x."rank" <= 3 AND x."entrants" >= 2 AND (x."score" > 0 OR x."targetReachedAt" IS NOT NULL)`;

/**
 * Someone's trophy cabinet: every finished competition they ended in the top three of, newest first,
 * with how many they won outright. Worked out from the final board, so free competitions count too.
 */
export async function trophiesFor(manager: EntityManager, userId: string) {
  const trophies = await manager.query(
    `WITH ended AS (
       SELECT t.* FROM "competition_tables" t
       WHERE ${ENDED} AND EXISTS (SELECT 1 FROM "table_registrations" m WHERE m."tableId" = t."id" AND m."userId" = $1)
     ), ranked AS (
       SELECT r."tableId", r."userId", r."score", r."targetReachedAt",
              row_number() OVER (PARTITION BY r."tableId" ORDER BY ${RANK_ORDER})::integer AS "rank",
              count(*) OVER (PARTITION BY r."tableId")::integer AS "entrants"
       FROM "table_registrations" r WHERE r."tableId" IN (SELECT "id" FROM ended)
     )
     SELECT e."id" AS "tableId", e."code", e."title", e."challengeType", e."scoringMethod", e."bannerUrl",
            COALESCE(e."scoringClosesAt", e."prizesFinalizedAt", e."createdAt") AS "endedAt",
            x."rank", x."entrants", x."score"::float8 AS "score"
     FROM ranked x JOIN ended e ON e."id" = x."tableId"
     WHERE x."userId" = $1 AND ${PODIUM}
     ORDER BY "endedAt" DESC LIMIT 100`,
    [userId],
  ) as Trophy[];
  return { wins: trophies.filter((trophy) => trophy.rank === 1).length, podiums: trophies.length, trophies };
}

/**
 * Competitions that finished since `since` and haven't had their podium announced: the top three of each
 * (same rules as the cabinet), for the "you won" push. Marks them announced in the same statement.
 */
export async function claimPodiumsToAnnounce(manager: EntityManager) {
  return manager.query(
    `WITH due AS (
       UPDATE "competition_tables" t SET "podiumAnnouncedAt" = now()
       WHERE ${ENDED} AND t."podiumAnnouncedAt" IS NULL AND COALESCE(t."scoringClosesAt", t."prizesFinalizedAt") > now() - interval '3 days'
       RETURNING t."id", t."code", t."title"
     ), ranked AS (
       SELECT r."tableId", r."userId", r."score", r."targetReachedAt",
              row_number() OVER (PARTITION BY r."tableId" ORDER BY ${RANK_ORDER})::integer AS "rank",
              count(*) OVER (PARTITION BY r."tableId")::integer AS "entrants"
       FROM "table_registrations" r WHERE r."tableId" IN (SELECT "id" FROM due)
     )
     SELECT x."userId", x."rank", d."code", d."title" FROM ranked x JOIN due d ON d."id" = x."tableId"
     JOIN "users" u ON u."id" = x."userId" AND u."deletedAt" IS NULL
     WHERE ${PODIUM}`,
  ) as Promise<Array<{ userId: string; rank: number; code: string; title: string }>>;
}
