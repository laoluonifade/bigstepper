import type Redis from 'ioredis';
import type { DataSource } from 'typeorm';
import { AppService } from './app.service';

describe('public stats', () => {
  it('reads totals and top countries once, then serves them from the 10-minute cache', async () => {
    const store = new Map<string, string>();
    const redis = { get: jest.fn(async (key: string) => store.get(key) ?? null), set: jest.fn(async (key: string, value: string) => { store.set(key, value); return 'OK'; }) };
    const query = jest.fn(async (sql: string) => (sql.includes('"countryCode" AS "code"')
      ? [{ code: 'NG', runners: 120 }, { code: 'GB', runners: 9 }]
      : [{ runners: 131, countries: 2, verifiedKm: 4210, activities: 980, participants: 88, competitions: 14 }]));
    const service = new AppService({ query } as unknown as DataSource, redis as unknown as Redis);

    const first = await service.publicStats();
    expect(first).toMatchObject({ runners: 131, countries: 2, verifiedKm: 4210, topCountries: [{ code: 'NG', runners: 120 }, { code: 'GB', runners: 9 }] });
    expect(redis.set).toHaveBeenCalledWith('public-stats:v1', expect.any(String), 'EX', 600);
    expect(JSON.stringify(first)).not.toMatch(/email|username|displayName/);

    await service.publicStats();
    expect(query).toHaveBeenCalledTimes(2);
  });
});
