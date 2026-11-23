import dataSource from '../database/data-source';
import { enrolClubMembers } from '../tables/club-competitions';

class DryRun extends Error {}

async function main() {
  const slug = process.env.COMMUNITY_CLUB_SLUG ?? 'jump-community-club';
  const dryRun = process.argv.includes('--dry-run');
  const quiet = process.argv.includes('--quiet');
  await dataSource.initialize();
  const perTable: Array<{ competition: string; added: number }> = [];
  let people = 0;
  try {
    const [club] = await dataSource.query(`SELECT "id", "name", "slug" FROM "clubs" WHERE "slug" = $1`, [slug]) as Array<{ id: string; name: string; slug: string }>;
    if (!club) throw new Error(`No club with the slug ${slug}`);
    await dataSource.transaction(async (manager) => {
      const tables = await manager.query(
        `SELECT "id", "title" FROM "competition_tables"
         WHERE "communityId" = $1 AND "deletedAt" IS NULL AND "archivedAt" IS NULL AND "status" = 'OPEN_FOR_ENTRY'
           AND ("scoringClosesAt" IS NULL OR "scoringClosesAt" > now())
         ORDER BY "startsAt"`,
        [club.id],
      ) as Array<{ id: string; title: string }>;
      const counts = new Map<string, number>();
      for (const table of tables) {
        const enrolled = await enrolClubMembers(manager, { tableId: table.id }, { notify: false });
        perTable.push({ competition: table.title, added: enrolled.length });
        for (const { userId } of enrolled) counts.set(userId, (counts.get(userId) ?? 0) + 1);
      }
      people = counts.size;
      if (dryRun) throw new DryRun();
      if (!quiet && counts.size) {
        await manager.query(
          `INSERT INTO "notifications" ("userId","type","title","body","link")
           SELECT (e->>'userId')::uuid, 'CHALLENGE_INVITE', $2,
                  'We entered you in ' || (e->>'count') || CASE WHEN (e->>'count')::integer = 1 THEN ' competition' ELSE ' competitions' END
                  || ' in ' || $3 || '. Your steps already count. Leave any you don’t want.', $4
           FROM jsonb_array_elements($1::jsonb) e`,
          [JSON.stringify([...counts].map(([userId, count]) => ({ userId, count }))), 'You’re in the club competitions', club.name, `/clubs/${club.slug}`],
        );
      }
    }).catch((error) => { if (!(error instanceof DryRun)) throw error; });
    console.table(perTable);
    console.log(dryRun ? `Dry run: ${people} members would be added (${perTable.reduce((sum, row) => sum + row.added, 0)} entries). Nothing was saved.`
      : `Added ${people} members (${perTable.reduce((sum, row) => sum + row.added, 0)} entries)${quiet ? ' without notifying them' : ', one notification each'}.`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
