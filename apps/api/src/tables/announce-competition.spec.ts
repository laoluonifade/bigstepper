import type { EntityManager } from 'typeorm';
import { announceCompetition } from './club-challenges';

const table = { id: 't1', communityId: null, visibility: 'public' as const, creatorId: 'host', title: 'Move with Tee', code: 'ABC12345' };

describe('announcing a new competition', () => {
  it('tells everyone (but the host, entrants and club followers) about a public one, once', async () => {
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => []);
    await announceCompetition({ query } as unknown as EntityManager, table);
    const [sql, params] = query.mock.calls.find(([text]) => String(text).includes("'NEW_COMPETITION'")) as unknown as [string, unknown[]];
    expect(sql).toContain('u."id" <> $4');
    expect(sql).toContain('"table_registrations"');
    expect(sql).toContain('"club_follows"');
    expect(sql).toContain('n."type" = \'NEW_COMPETITION\'');
    expect(params).toEqual(['t1', 'Move with Tee', 'ABC12345', 'host', null]);
  });

  it('keeps private competitions private', async () => {
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => []);
    await announceCompetition({ query } as unknown as EntityManager, { ...table, visibility: 'private' as const });
    expect(query).not.toHaveBeenCalled();
  });
});
