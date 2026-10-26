import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectRedis } from './redis/redis.constants';
import Redis from 'ioredis';

const STATS_KEY = 'public-stats:v1';

@Injectable()
export class AppService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  getHello(): string {
    return 'Jump API';
  }

  async publicStats() {
    const cached = await this.redis.get(STATS_KEY).catch(() => null);
    if (cached) return JSON.parse(cached);
    const [totals] = await this.dataSource.query(
      `SELECT
         (SELECT count(*) FROM "users" WHERE "deletedAt" IS NULL)::integer AS "runners",
         (SELECT count(DISTINCT p."countryCode") FROM "profiles" p JOIN "users" u ON u."id" = p."userId" AND u."deletedAt" IS NULL WHERE p."countryCode" IS NOT NULL)::integer AS "countries",
         (SELECT COALESCE(round(sum("validatedDistanceMetres") / 1000), 0) FROM "activities" WHERE "verificationStatus" = 'VERIFIED')::integer AS "verifiedKm",
         (SELECT count(*) FROM "activities" WHERE "verificationStatus" = 'VERIFIED')::integer AS "activities",
         (SELECT count(DISTINCT "userId") FROM "table_registrations")::integer AS "participants",
         (SELECT count(*) FROM "competition_tables" WHERE "status" NOT IN ('CANCELLED','DRAFT','SCHEDULED','PENDING_FUNDING','PENDING_APPROVAL') AND "deletedAt" IS NULL)::integer AS "competitions"`,
    ) as Array<Record<string, number>>;
    const topCountries = await this.dataSource.query(
      `SELECT p."countryCode" AS "code", count(*)::integer AS "runners" FROM "profiles" p
       JOIN "users" u ON u."id" = p."userId" AND u."deletedAt" IS NULL
       WHERE p."countryCode" IS NOT NULL GROUP BY p."countryCode" ORDER BY count(*) DESC LIMIT 8`,
    ) as Array<{ code: string; runners: number }>;
    const stats = { ...totals, topCountries, updatedAt: new Date().toISOString() };
    await this.redis.set(STATS_KEY, JSON.stringify(stats), 'EX', 600).catch(() => undefined);
    return stats;
  }

  async health() {
    await Promise.all([this.dataSource.query('SELECT 1'), this.redis.ping()]);
    return { status: 'ok', service: 'jump-api', postgres: 'up', redis: 'up' };
  }
}
