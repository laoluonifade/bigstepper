import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { refreshSeasonDistances } from './league-credits';
import { decideOutcomes } from './league-rules';

interface SeasonRow {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
}

interface DivisionRow {
  id: string;
  name: string;
  level: number;
}

/**
 * Closes league seasons when they end: final distances, ranks, promotion/relegation, notifications,
 * and the next season with everyone placed in their new division. Safe to run repeatedly and from
 * several processes — an advisory lock serialises runs and each step checks the season's status.
 */
@Injectable()
export class LeagueSeasonsService {
  private readonly logger = new Logger(LeagueSeasonsService.name);

  constructor(private readonly dataSource: DataSource) {}

  async closeDueSeasons() {
    // A long outage can leave more than one season due; close them in order.
    for (let i = 0; i < 24; i += 1) {
      const closed = await this.dataSource.transaction((manager) => this.closeOne(manager));
      if (!closed) break;
    }
    await this.dataSource.transaction((manager) => this.ensureActiveSeason(manager));
  }

  private async closeOne(manager: EntityManager): Promise<boolean> {
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext('league-season-rollover'))`);
    const [season] = (await manager.query(
      `SELECT "id", "name", "startsAt", "endsAt" FROM "league_seasons"
       WHERE "status" = 'ACTIVE' AND "endsAt" <= now() ORDER BY "endsAt" ASC LIMIT 1 FOR UPDATE`,
    )) as SeasonRow[];
    if (!season) return false;

    const divisions = (await manager.query(`SELECT "id", "name", "level" FROM "league_divisions" ORDER BY "level"`)) as DivisionRow[];
    const byLevel = new Map(divisions.map((division) => [division.level, division]));
    const byId = new Map(divisions.map((division) => [division.id, division]));
    const minLevel = divisions[0].level;
    const maxLevel = divisions[divisions.length - 1].level;

    await refreshSeasonDistances(manager, season.id);
    const members = (await manager.query(
      `SELECT "id", "userId", "divisionId", "creditedDistanceMetres" FROM "league_memberships"
       WHERE "seasonId" = $1 ORDER BY "creditedDistanceMetres" DESC, "id" ASC`,
      [season.id],
    )) as Array<{ id: string; userId: string; divisionId: string; creditedDistanceMetres: number }>;

    const results = decideOutcomes(
      members.map((member) => ({
        membershipId: member.id,
        divisionLevel: byId.get(member.divisionId)!.level,
        creditedDistanceMetres: member.creditedDistanceMetres,
      })),
      minLevel,
      maxLevel,
    );
    const resultById = new Map(results.map((result) => [result.membershipId, result]));

    // Finish this one first: only one ACTIVE season may exist.
    await manager.query(`UPDATE "league_seasons" SET "status" = 'FINALIZED' WHERE "id" = $1`, [season.id]);

    // Next season: from this one's end to the end of the current calendar month (at least), so a
    // late run never opens a season that is already over.
    const [next] = (await manager.query(
      `INSERT INTO "league_seasons" ("name", "startsAt", "endsAt", "status")
       SELECT to_char(bounds.ends - interval '1 day', 'FMMonth YYYY'), bounds.starts, bounds.ends, 'ACTIVE'
       FROM (SELECT $1::timestamptz AS starts,
                    date_trunc('month', greatest($1::timestamptz, now())) + interval '1 month' AS ends) bounds
       RETURNING "id", "name", "startsAt", "endsAt"`,
      [season.endsAt],
    )) as SeasonRow[];

    for (const member of members) {
      const result = resultById.get(member.id)!;
      const from = byId.get(member.divisionId)!;
      const to = byLevel.get(result.nextLevel)!;
      await manager.query(`UPDATE "league_memberships" SET "finalRank" = $2, "outcome" = $3 WHERE "id" = $1`, [
        member.id,
        result.finalRank,
        result.outcome,
      ]);
      await manager.query(
        `INSERT INTO "league_memberships" ("seasonId", "divisionId", "userId") VALUES ($1, $2, $3)
         ON CONFLICT ("seasonId", "userId") DO NOTHING`,
        [next.id, to.id, member.userId],
      );
      const place = `You finished ${ordinal(result.finalRank)} in ${from.name}`;
      const [title, body] =
        result.outcome === 'PROMOTED'
          ? [`Promoted to ${to.name}`, `${place}. ${next.name} starts now in ${to.name}.`]
          : result.outcome === 'RELEGATED'
            ? [`Moved down to ${to.name}`, `${place}. ${next.name} starts now in ${to.name} — log verified distance to climb back.`]
            : [`You stay in ${to.name}`, `${place}. ${next.name} starts now.`];
      await manager.query(`INSERT INTO "notifications" ("userId", "type", "title", "body") VALUES ($1, 'LEAGUE_RESULT', $2, $3)`, [
        member.userId,
        title,
        body,
      ]);
    }
    await refreshSeasonDistances(manager, next.id);
    this.logger.log(`Closed league season "${season.name}" (${members.length} runners); opened "${next.name}"`);
    return true;
  }

  /** If there is no active season at all, open one for the current month and place everyone in it. */
  private async ensureActiveSeason(manager: EntityManager) {
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext('league-season-rollover'))`);
    const [active] = await manager.query(`SELECT 1 FROM "league_seasons" WHERE "status" = 'ACTIVE' LIMIT 1`);
    if (active) return;
    const [season] = (await manager.query(
      `INSERT INTO "league_seasons" ("name", "startsAt", "endsAt", "status")
       VALUES (to_char(now(), 'FMMonth YYYY'), date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 'ACTIVE')
       RETURNING "id", "name"`,
    )) as SeasonRow[];
    await manager.query(
      `INSERT INTO "league_memberships" ("seasonId", "divisionId", "userId")
       SELECT $1, COALESCE(last."divisionId", bottom."id"), u."id"
       FROM "users" u
       CROSS JOIN (SELECT "id" FROM "league_divisions" ORDER BY "level" LIMIT 1) bottom
       LEFT JOIN LATERAL (
         SELECT m."divisionId" FROM "league_memberships" m JOIN "league_seasons" s ON s."id" = m."seasonId"
         WHERE m."userId" = u."id" ORDER BY s."endsAt" DESC LIMIT 1
       ) last ON true
       ON CONFLICT ("seasonId", "userId") DO NOTHING`,
      [season.id],
    );
    await refreshSeasonDistances(manager, season.id);
    this.logger.log(`No active league season — opened "${season.name}"`);
  }
}

function ordinal(n: number) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}
