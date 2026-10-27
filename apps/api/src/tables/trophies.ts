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
  rank: number;
  entrants: number;
  score: number | null;
  kind: 'competition' | 'duel';
}

const ENDED = `t."deletedAt" IS NULL AND t."status" NOT IN ('CANCELLED','DRAFT','SCHEDULED','PENDING_FUNDING','PENDING_APPROVAL')
  AND (t."status" = 'SETTLED' OR (t."scoringClosesAt" IS NOT NULL AND t."scoringClosesAt" <= now()))`;

const PODIUM = `x."rank" <= 3 AND x."entrants" >= 2 AND (x."score" > 0 OR x."targetReachedAt" IS NOT NULL)`;

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
     SELECT * FROM (
       SELECT e."id" AS "tableId", e."code", e."title", e."challengeType", e."scoringMethod", e."bannerUrl",
              COALESCE(e."scoringClosesAt", e."prizesFinalizedAt", e."createdAt") AS "endedAt",
              x."rank", x."entrants", x."score"::float8 AS "score", 'competition' AS "kind"
       FROM ranked x JOIN ended e ON e."id" = x."tableId"
       WHERE x."userId" = $1 AND ${PODIUM}
       UNION ALL
       SELECT d."id", '', 'Duel vs ' || COALESCE(p."displayName", 'a runner'),
              CASE d."activity" WHEN 'run' THEN 'RUN' WHEN 'walk' THEN 'WALK' WHEN 'cycle' THEN 'CYCLING' ELSE 'DISTANCE' END, 'DUEL', NULL,
              d."settledAt", 1, 2, (CASE WHEN d."challengerId" = $1 THEN d."challengerMetres" ELSE d."opponentMetres" END)::float8, 'duel'
       FROM "duels" d LEFT JOIN "profiles" p ON p."userId" = CASE WHEN d."challengerId" = $1 THEN d."opponentId" ELSE d."challengerId" END
       WHERE d."status" = 'FINISHED' AND d."winnerId" = $1
     ) won ORDER BY "endedAt" DESC LIMIT 100`,
    [userId],
  ) as Trophy[];
  return { wins: trophies.filter((trophy) => trophy.rank === 1).length, podiums: trophies.length, trophies };
}

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
