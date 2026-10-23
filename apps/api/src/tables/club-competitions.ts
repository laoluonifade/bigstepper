import { EntityManager } from 'typeorm';
import { creditActivities } from './competition-credits';

/**
 * Club competitions include the whole club. Free and funded-free ones enrol members directly: everyone
 * when the competition opens, and each new member as they join the club. Places are filled in the order
 * people joined the club, never past the competition's capacity. Paid ones only invite (members choose
 * whether to pay); see inviteClubToPaid.
 *
 * Returns who was enrolled where, after crediting activities they'd already recorded in the window.
 */
export async function enrolClubMembers(manager: EntityManager, scope: { tableId: string } | { clubId: string; userId: string }) {
  const [filter, params] = 'tableId' in scope
    ? ['t."id" = $1', [scope.tableId]]
    : ['t."communityId" = $1 AND m."userId" = $2', [scope.clubId, scope.userId]];
  const enrolled = await manager.query(
    `WITH open AS (
       SELECT t."id", t."code", t."title", t."communityId",
              COALESCE(t."capacity", 2147483647) - (SELECT count(*) FROM "table_registrations" r WHERE r."tableId" = t."id") AS "room"
       FROM "competition_tables" t
       JOIN "club_memberships" m ON m."clubId" = t."communityId"
       WHERE ${filter}
         AND t."type" IN ('free', 'sponsored') AND t."status" = 'OPEN_FOR_ENTRY'
         AND (t."entryClosesAt" IS NULL OR t."entryClosesAt" > now())
         AND (t."scoringClosesAt" IS NULL OR t."scoringClosesAt" > now())
       GROUP BY t."id"
     ),
     candidates AS (
       SELECT o."id" AS "tableId", m."userId", o."room",
              row_number() OVER (PARTITION BY o."id" ORDER BY m."joinedAt", m."userId") AS "place"
       FROM open o
       JOIN "club_memberships" m ON m."clubId" = o."communityId"
       WHERE ${'userId' in scope ? 'm."userId" = $2' : 'true'}
         AND NOT EXISTS (SELECT 1 FROM "table_registrations" r WHERE r."tableId" = o."id" AND r."userId" = m."userId")
     )
     INSERT INTO "table_registrations" ("tableId", "userId")
     SELECT "tableId", "userId" FROM candidates WHERE "place" <= "room"
     ON CONFLICT DO NOTHING
     RETURNING "tableId", "userId"`,
    params,
  ) as Array<{ tableId: string; userId: string }>;
  for (const row of enrolled) await creditActivities(manager, row);
  if (enrolled.length) {
    await manager.query(
      `INSERT INTO "notifications" ("userId", "type", "title", "body", "link")
       SELECT e."userId", 'CHALLENGE_INVITE', 'You’re in a club competition',
              'Your club entered you in ' || t."title" || '. Every verified activity in its window counts.', '/competitions/' || t."code"
       FROM jsonb_to_recordset($1::jsonb) AS e("tableId" uuid, "userId" uuid)
       JOIN "competition_tables" t ON t."id" = e."tableId"
       WHERE e."userId" <> t."creatorId"`,
      [JSON.stringify(enrolled)],
    );
  }
  return enrolled;
}

/** A paid club competition that just opened: invite every member (they pay to enter, so nobody is enrolled). */
export async function inviteClubToPaid(manager: EntityManager, tableId: string) {
  const invited = await manager.query(
    `INSERT INTO "challenge_invitations" ("tableId", "invitedUserId")
     SELECT t."id", m."userId" FROM "competition_tables" t
     JOIN "club_memberships" m ON m."clubId" = t."communityId"
     WHERE t."id" = $1 AND m."userId" <> t."creatorId"
     ON CONFLICT DO NOTHING
     RETURNING "invitedUserId"`,
    [tableId],
  ) as Array<{ invitedUserId: string }>;
  if (invited.length) {
    await manager.query(
      `INSERT INTO "notifications" ("userId", "type", "title", "body", "link")
       SELECT unnest($2::uuid[]), 'CHALLENGE_INVITE', 'Your club is hosting a competition', 'Join ' || t."title" || ' with code ' || t."code" || '.', '/competitions/' || t."code"
       FROM "competition_tables" t WHERE t."id" = $1`,
      [tableId, invited.map((row) => row.invitedUserId)],
    );
  }
}
