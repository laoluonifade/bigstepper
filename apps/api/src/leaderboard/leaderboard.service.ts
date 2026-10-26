import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { STREAK_TIME_ZONE } from '../running/streaks';

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
    const since = period === 'all' ? null : `date_trunc('${period}', now() AT TIME ZONE '${STREAK_TIME_ZONE}') AT TIME ZONE '${STREAK_TIME_ZONE}'`;
    const rows = (await this.dataSource.query(
      `WITH totals AS (
         SELECT a."userId", SUM(GREATEST(a."validatedDistanceMetres", a."stepDistanceMetres"))::bigint AS "metres", COUNT(*)::integer AS "activities"
         FROM "activities" a
         ${scope === 'country' ? `JOIN "profiles" pc ON pc."userId" = a."userId" AND pc."countryCode" = (SELECT "countryCode" FROM "profiles" WHERE "userId" = $2)` : ''}
         WHERE a."verificationStatus" = 'VERIFIED' AND a."activityType" = ANY($1::text[]) ${since ? `AND a."startedAt" >= ${since}` : ''}
         GROUP BY a."userId"
         HAVING SUM(GREATEST(a."validatedDistanceMetres", a."stepDistanceMetres")) > 0
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
