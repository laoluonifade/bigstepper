import type { EntityManager } from 'typeorm';
import { enrolClubMembers } from '../tables/club-competitions';

export async function joinCommunityClub(manager: EntityManager, slug: string) {
  const [club] = await manager.query(`SELECT "id" FROM "clubs" WHERE "slug" = $1`, [slug]) as Array<{ id: string }>;
  if (!club) return 0;
  const joined = await manager.query(
    `WITH due AS (
       UPDATE "users" SET "communityClubAt" = now()
       WHERE "id" IN (SELECT "id" FROM "users" WHERE "communityClubAt" IS NULL AND "deletedAt" IS NULL ORDER BY "createdAt" LIMIT 500 FOR UPDATE SKIP LOCKED)
       RETURNING "id"
     ), followed AS (
       INSERT INTO "club_follows" ("clubId", "userId") SELECT $1, "id" FROM due ON CONFLICT DO NOTHING
     )
     INSERT INTO "club_memberships" ("clubId", "userId", "role") SELECT $1, "id", 'member' FROM due
     ON CONFLICT DO NOTHING
     RETURNING "userId"`,
    [club.id],
  ) as Array<{ userId: string }>;
  for (const { userId } of joined) await enrolClubMembers(manager, { clubId: club.id, userId });
  return joined.length;
}

export async function announceNewCompetitions(manager: EntityManager) {
  const rows = await manager.query(
    `WITH fresh AS (
       UPDATE "competition_tables" t SET "announcedAt" = now()
       WHERE t."announcedAt" IS NULL AND t."visibility" = 'public' AND t."status" IN ('OPEN_FOR_ENTRY', 'ACTIVE')
         AND t."deletedAt" IS NULL AND t."archivedAt" IS NULL AND (t."scoringClosesAt" IS NULL OR t."scoringClosesAt" > now())
       RETURNING t."id", t."code", t."title", t."creatorId", t."communityId"
     ), sent AS (
       INSERT INTO "notifications" ("userId", "type", "title", "body", "link")
       SELECT u."id", 'NEW_COMPETITION', 'New competition: ' || f."title",
              'Hosted by ' || COALESCE(c."name", p."displayName", 'a Jump runner') || '. Tap to see the rules and join.', '/competitions/' || f."code"
       FROM fresh f
       LEFT JOIN "clubs" c ON c."id" = f."communityId"
       LEFT JOIN "profiles" p ON p."userId" = f."creatorId"
       JOIN "users" u ON u."deletedAt" IS NULL AND u."id" <> f."creatorId"
       WHERE NOT EXISTS (SELECT 1 FROM "table_registrations" r WHERE r."tableId" = f."id" AND r."userId" = u."id")
         AND NOT EXISTS (SELECT 1 FROM "notifications" n WHERE n."userId" = u."id" AND n."link" = '/competitions/' || f."code")
       RETURNING 1
     )
     SELECT (SELECT count(*) FROM fresh)::integer AS "competitions", (SELECT count(*) FROM sent)::integer AS "notified"`,
  ) as Array<{ competitions: number; notified: number }>;
  return rows[0] ?? { competitions: 0, notified: 0 };
}
