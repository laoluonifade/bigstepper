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

export async function syncHostsGroup(manager: EntityManager, slug: string) {
  await manager.query(
    `INSERT INTO "chat_groups" ("slug","name","description","system")
     VALUES ($1,'Jump Hosts','Jump’s group for creators, club owners and competition hosts. Tell us what you want to see, share what’s working, and hear what’s coming first.',true)
     ON CONFLICT ("slug") DO NOTHING`,
    [slug],
  );
  const [group] = await manager.query(`SELECT "id" FROM "chat_groups" WHERE "slug" = $1`, [slug]) as Array<{ id: string }>;
  await manager.query(
    `INSERT INTO "chat_group_members" ("groupId","userId","role")
     SELECT $1, u."id", 'admin' FROM "users" u WHERE u."role" = 'admin' AND u."deletedAt" IS NULL
     ON CONFLICT ("groupId","userId") DO UPDATE SET "role" = 'admin'`,
    [group.id],
  );
  const eligible = `SELECT cp."userId" FROM "creator_profiles" cp WHERE cp."status" = 'ACTIVE'
     UNION SELECT m."userId" FROM "club_memberships" m WHERE m."role" = 'owner'
     UNION SELECT t."creatorId" FROM "competition_tables" t
       WHERE t."deletedAt" IS NULL AND t."status" NOT IN ('DRAFT','CANCELLED','PENDING_FUNDING','PENDING_APPROVAL')`;
  const added = await manager.query(
    `INSERT INTO "chat_group_members" ("groupId","userId","role")
     SELECT $1, e."userId", 'member' FROM (${eligible}) e JOIN "users" u ON u."id" = e."userId" WHERE u."deletedAt" IS NULL
     ON CONFLICT DO NOTHING RETURNING "userId"`,
    [group.id],
  ) as unknown[];
  const removed = await manager.query(
    `WITH gone AS (
       DELETE FROM "chat_group_members" m WHERE m."groupId" = $1 AND m."role" = 'member'
         AND (m."userId" NOT IN (${eligible}) OR EXISTS (SELECT 1 FROM "users" u WHERE u."id" = m."userId" AND u."deletedAt" IS NOT NULL))
       RETURNING m."userId")
     SELECT * FROM gone`,
    [group.id],
  ) as unknown[];
  return { added: added.length, removed: removed.length };
}
