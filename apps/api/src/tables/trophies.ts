import { DataSource, EntityManager } from 'typeorm';
import { retotal } from './competition-credits';
import { RANK_ORDER } from './scoring-engine';

export type MedalKind = 'gold' | 'silver' | 'bronze' | 'completion';

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
  medal: MedalKind;
  seriesId: string | null;
}

export const RESULTS_GRACE_HOURS = 12;
const FRESH_DAYS = 3;

const FINALIZABLE = `t."resultsFinalizedAt" IS NULL AND t."deletedAt" IS NULL
  AND t."status" NOT IN ('CANCELLED','DRAFT','SCHEDULED','PENDING_FUNDING','PENDING_APPROVAL')
  AND (t."status" = 'SETTLED' OR (t."type" = 'free' AND t."scoringClosesAt" <= now() - interval '${RESULTS_GRACE_HOURS} hours'))`;

const WINDOW_DAYS = `(((t."scoringClosesAt" - interval '1 millisecond') AT TIME ZONE t."timeZone")::date - (COALESCE(t."startsAt", t."createdAt") AT TIME ZONE t."timeZone")::date + 1)`;

const COMPLETED = `(x."targetReachedAt" IS NOT NULL
  OR (t."dailyTarget" IS NOT NULL AND t."scoringMethod" IN ('TARGET_DAYS','LONGEST_STREAK') AND t."scoringClosesAt" IS NOT NULL AND x."score" >= ${WINDOW_DAYS})
  OR (t."scoringMethod" = 'MOST_STEPS_ONE_DAY' AND t."targetSteps" IS NOT NULL AND x."score" >= t."targetSteps")
  OR (t."scoringMethod" = 'PERSONAL_TARGET' AND x."score" >= 100)
  OR (t."scoringMethod" = 'PERSONAL_DAYS' AND t."scoringClosesAt" IS NOT NULL AND x."score" >= ${WINDOW_DAYS}))`;

const PODIUM = `x."rank" <= 3 AND x."entrants" >= 2 AND (x."score" > 0 OR x."targetReachedAt" IS NOT NULL)`;

export async function recordResults(manager: EntityManager, tableIds: string[]) {
  if (!tableIds.length) return [];
  return manager.query(
    `WITH ranked AS (
       SELECT r."tableId", r."userId", r."score", r."targetReachedAt",
              row_number() OVER (PARTITION BY r."tableId" ORDER BY ${RANK_ORDER})::integer AS "rank",
              count(*) OVER (PARTITION BY r."tableId")::integer AS "entrants"
       FROM "table_registrations" r JOIN "users" u ON u."id" = r."userId" AND u."deletedAt" IS NULL
       WHERE r."tableId" = ANY($1::uuid[])
     ), judged AS (
       SELECT x."tableId", x."userId", x."rank", x."entrants", x."score", ${COMPLETED} AS "completed",
              CASE WHEN t."medalRule" = 'completion' THEN CASE WHEN ${COMPLETED} THEN 'completion' END
                   WHEN ${PODIUM} THEN (ARRAY['gold','silver','bronze'])[x."rank"] END AS "medal"
       FROM ranked x JOIN "competition_tables" t ON t."id" = x."tableId"
     )
     INSERT INTO "competition_results" ("tableId","userId","rank","entrants","score","completed","medal")
     SELECT "tableId","userId","rank","entrants","score","completed","medal" FROM judged
     ON CONFLICT ("tableId","userId") DO UPDATE SET "rank" = EXCLUDED."rank", "entrants" = EXCLUDED."entrants", "score" = EXCLUDED."score",
       "completed" = EXCLUDED."completed", "medal" = EXCLUDED."medal", "finalizedAt" = now()
     RETURNING "tableId","userId","rank","medal"`,
    [tableIds],
  ) as Promise<Array<{ tableId: string; userId: string; rank: number; medal: MedalKind | null }>>;
}

export async function finalizeTable(manager: EntityManager, tableId: string) {
  const [table] = await manager.query(
    `SELECT t."id", t."code", t."title", t."type", t."podiumAnnouncedAt" IS NULL AS "unannounced",
            COALESCE(t."scoringClosesAt", t."prizesFinalizedAt", now()) > now() - interval '${FRESH_DAYS} days' AS "fresh"
     FROM "competition_tables" t WHERE t."id" = $1 AND ${FINALIZABLE} FOR UPDATE`,
    [tableId],
  ) as Array<{ id: string; code: string; title: string; type: string; unannounced: boolean; fresh: boolean }>;
  if (!table) return [];
  if (table.type === 'free' && table.fresh) await retotal(manager, [table.id]);
  const results = await recordResults(manager, [table.id]);
  await manager.query(`UPDATE "competition_tables" SET "resultsFinalizedAt" = now(), "podiumAnnouncedAt" = COALESCE("podiumAnnouncedAt", now()) WHERE "id" = $1`, [table.id]);
  if (!table.fresh || !table.unannounced) return [];
  return results.filter((row) => row.medal).map((row) => ({ userId: row.userId, rank: row.rank, medal: row.medal!, code: table.code, title: table.title }));
}

export type MedalNotice = Awaited<ReturnType<typeof finalizeTable>>[number];

export async function finalizeDue(dataSource: DataSource, onError: (tableId: string, error: unknown) => void, limit = 40) {
  const due = await dataSource.query(
    `SELECT t."id" FROM "competition_tables" t WHERE ${FINALIZABLE} ORDER BY t."scoringClosesAt" NULLS LAST LIMIT $1`,
    [limit],
  ) as Array<{ id: string }>;
  const notices: MedalNotice[] = [];
  for (const { id } of due) {
    try { notices.push(...await dataSource.transaction((manager) => finalizeTable(manager, id))); }
    catch (error) { onError(id, error); }
  }
  return { finalized: due.length, notices };
}

const MEDAL_EMOJI: Record<MedalKind, string> = { gold: '🥇', silver: '🥈', bronze: '🥉', completion: '🏅' };

export function medalMessages(notices: MedalNotice[]) {
  const byUser = new Map<string, MedalNotice[]>();
  for (const notice of notices) byUser.set(notice.userId, [...(byUser.get(notice.userId) ?? []), notice]);
  return [...byUser].map(([userId, mine]) => {
    if (mine.length > 1) {
      const best = mine.find((notice) => notice.medal === 'gold') ?? mine[0];
      return {
        userId,
        title: `${MEDAL_EMOJI[best.medal]} ${mine.length} new medals`,
        body: `${mine.map((notice) => notice.title).slice(0, 3).join(', ')}${mine.length > 3 ? ` and ${mine.length - 3} more` : ''}. They’re on your profile now.`,
        link: '/you',
      };
    }
    const [notice] = mine;
    const link = `/competitions/${notice.code}`;
    if (notice.medal === 'completion') return { userId, title: `🏅 You completed ${notice.title}!`, body: 'Your completion medal has been added to your profile.', link };
    if (notice.medal === 'gold') return { userId, title: `🥇 You won ${notice.title}!`, body: 'Your gold medal is ready. Tap to see the final board.', link };
    return {
      userId,
      title: `${MEDAL_EMOJI[notice.medal]} You finished ${notice.rank === 2 ? '2nd' : '3rd'} in ${notice.title}`,
      body: `You’ve earned a ${notice.medal} medal. It’s on your profile now.`,
      link,
    };
  });
}

export async function trophiesFor(manager: EntityManager, userId: string) {
  const rows = await manager.query(
    `SELECT * FROM (
       SELECT t."id" AS "tableId", t."code", t."title", t."challengeType", t."scoringMethod", t."bannerUrl",
              COALESCE(t."scoringClosesAt", t."prizesFinalizedAt", x."finalizedAt") AS "endedAt",
              x."rank", x."entrants", x."score", 'competition' AS "kind", x."medal", t."seriesId"
       FROM "competition_results" x JOIN "competition_tables" t ON t."id" = x."tableId" AND t."deletedAt" IS NULL
       WHERE x."userId" = $1 AND x."medal" IS NOT NULL
       UNION ALL
       SELECT d."id", '', 'Duel vs ' || COALESCE(p."displayName", 'a runner'),
              CASE d."activity" WHEN 'run' THEN 'RUN' WHEN 'walk' THEN 'WALK' WHEN 'cycle' THEN 'CYCLING' ELSE 'DISTANCE' END, 'DUEL', NULL,
              d."settledAt", 1, 2, (CASE WHEN d."challengerId" = $1 THEN d."challengerMetres" ELSE d."opponentMetres" END)::float8, 'duel', 'gold', NULL
       FROM "duels" d LEFT JOIN "profiles" p ON p."userId" = CASE WHEN d."challengerId" = $1 THEN d."opponentId" ELSE d."challengerId" END
       WHERE d."status" = 'FINISHED' AND d."winnerId" = $1
     ) won ORDER BY "endedAt" DESC LIMIT 300`,
    [userId],
  ) as Trophy[];
  const podium = rows.filter((row) => row.medal !== 'completion');
  const count = (medal: MedalKind) => rows.filter((row) => row.kind === 'competition' && row.medal === medal).length;
  return {
    wins: podium.filter((row) => row.rank === 1).length,
    podiums: podium.length,
    trophies: podium.slice(0, 100),
    completions: rows.filter((row) => row.medal === 'completion').slice(0, 100),
    medals: { gold: count('gold'), silver: count('silver'), bronze: count('bronze'), completed: count('completion') },
  };
}
