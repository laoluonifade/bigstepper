import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { STREAK_TIME_ZONE } from '../running/streaks';
import { COUNTED_STATUSES, countedMetres } from '../running/counted';

const ACTIVITIES: Record<string, string[]> = { run: ['run'], walk: ['walk'], cycle: ['cycle'], foot: ['run', 'walk'] };
const PERIODS = ['week', 'month', 'all'] as const;

@Injectable()
export class LeaderboardService {
  constructor(private readonly dataSource: DataSource) {}

  async board(viewerId: string | null, activity = 'foot', period = 'week', scope = 'global', limit = '50') {
    if (!viewerId && scope === 'country') throw new BadRequestException('Sign in to see your country’s board');
    const types = ACTIVITIES[activity];
    const size = Number(limit);
    if (!types || !PERIODS.includes(period as (typeof PERIODS)[number]) || !['global', 'country'].includes(scope) || !Number.isInteger(size) || size < 1 || size > 100) {
      throw new BadRequestException('Invalid leaderboard filter');
    }
    const zone = `'${STREAK_TIME_ZONE}'`;
    const since = period === 'all' ? null : `date_trunc('${period}', now() AT TIME ZONE ${zone}) AT TIME ZONE ${zone}`;
    const health = activity === 'walk' || activity === 'foot';
    const rows = (await this.dataSource.query(
      `WITH acts AS (
         SELECT a."userId", (a."startedAt" AT TIME ZONE ${zone})::date AS "day", SUM(${countedMetres()})::bigint AS "metres", COUNT(*)::integer AS "activities"
         FROM "activities" a
         WHERE a."verificationStatus" IN ${COUNTED_STATUSES} AND a."activityType" = ANY($1::text[]) ${since ? `AND a."startedAt" >= ${since}` : ''}
         GROUP BY 1, 2
       ),
       health AS (
         SELECT d."userId", d."day", d."countedMetres"::bigint AS "metres" FROM "daily_steps" d
         WHERE ${health ? 'd."countedMetres" > 0' : 'false'} ${since ? `AND d."day" >= (${since} AT TIME ZONE ${zone})::date` : ''}
       ),
       days AS (
         SELECT COALESCE(a."userId", h."userId") AS "userId", GREATEST(COALESCE(a."metres", 0), COALESCE(h."metres", 0)) AS "metres", COALESCE(a."activities", 0) AS "activities"
         FROM acts a FULL JOIN health h ON h."userId" = a."userId" AND h."day" = a."day"
       ),
       totals AS (
         SELECT d."userId", SUM(d."metres")::bigint AS "metres", SUM(d."activities")::integer AS "activities"
         FROM days d
         ${scope === 'country' ? `JOIN "profiles" pc ON pc."userId" = d."userId" AND pc."countryCode" = (SELECT "countryCode" FROM "profiles" WHERE "userId" = $2)` : ''}
         GROUP BY d."userId"
         HAVING SUM(d."metres") > 0
       ),
       ranked AS (SELECT t.*, rank() OVER (ORDER BY t."metres" DESC)::integer AS "rank" FROM totals t)
       SELECT r."rank", r."userId", r."metres", r."activities",
              COALESCE(p."displayName", 'Runner') AS "displayName", p."username", p."avatarUrl", p."countryCode",
              CASE WHEN p."gender"='male' THEN 'masculine' WHEN p."gender"='female' THEN 'feminine' ELSE 'neutral' END "avatarStyle", p."verifiedAt" IS NOT NULL AS "verified"
       FROM ranked r LEFT JOIN "profiles" p ON p."userId" = r."userId"
       WHERE r."rank" <= $3 OR r."userId" = $2
       ORDER BY r."rank", p."username"`,
      [types, viewerId, size],
    )) as Array<{ rank: number; userId: string; metres: string; activities: number; displayName: string; username: string | null; avatarUrl: string | null; countryCode: string | null; verified: boolean }>;
    const shaped = rows.map((row) => ({ ...row, metres: Number(row.metres), isMe: row.userId === viewerId }));
    return { rows: shaped.filter((row) => row.rank <= size).slice(0, size), me: shaped.find((row) => row.isMe) ?? null };
  }
}
