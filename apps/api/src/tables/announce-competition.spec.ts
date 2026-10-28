import type { EntityManager } from 'typeorm';
import { announceCompetition } from './club-challenges';
import { announceNewCompetitions } from '../notifications/community';

const table = { id: 't1', visibility: 'public' as const };

describe('announcing a new competition', () => {
  it('schedules the announcement five hours out instead of sending it straight away', async () => {
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => []);
    await announceCompetition({ query } as unknown as EntityManager, table);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain(`"announceAt" = now() + interval '5 hours'`);
    expect(sql).not.toContain('"notifications"');
    expect(params).toEqual(['t1']);
  });

  it('keeps private competitions private', async () => {
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => []);
    await announceCompetition({ query } as unknown as EntityManager, { ...table, visibility: 'private' as const });
    expect(query).not.toHaveBeenCalled();
  });

  it('only sends once the five hours are up, and skips deleted or closed competitions', async () => {
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => [{ competitions: 0, notified: 0 }]);
    await announceNewCompetitions({ query } as unknown as EntityManager);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain(`COALESCE(t."announceAt", t."createdAt" + interval '5 hours') <= now()`);
    expect(sql).toContain('t."deletedAt" IS NULL');
    expect(sql).toContain(`t."status" IN ('OPEN_FOR_ENTRY', 'ACTIVE')`);
    expect(sql).toContain(`'CLUB_CHALLENGE'`);
  });
});
