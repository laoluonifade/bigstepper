import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { DataSource, EntityManager } from 'typeorm';
import { PushNotificationsProcessor } from '../notifications/push-notifications.processor';
import { trophiesFor } from './trophies';

describe('trophies', () => {
  it('counts wins and podiums from finished boards, and only real placings', async () => {
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => [
      { tableId: 'a', rank: 1, title: 'Move with Tee' }, { tableId: 'b', rank: 3, title: 'Lekki 10K' }, { tableId: 'c', rank: 1, title: 'Steps' },
    ]);
    const cabinet = await trophiesFor({ query } as unknown as EntityManager, 'u1');
    expect(cabinet).toMatchObject({ wins: 2, podiums: 3 });
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('"scoringClosesAt" <= now()');
    expect(sql).toContain('"deletedAt" IS NULL');
    expect(sql).toContain('x."entrants" >= 2');
    expect(sql).toContain('x."score" > 0');
  });

  it('tells the top three once a competition finishes', async () => {
    const query = jest.fn(async (sql: string) => (sql.includes('"podiumAnnouncedAt" = now()')
      ? [{ userId: 'u1', rank: 1, code: 'ABC', title: 'Move with Tee' }, { userId: 'u2', rank: 2, code: 'ABC', title: 'Move with Tee' }]
      : []));
    const processor = new PushNotificationsProcessor({ query, manager: { query } } as unknown as DataSource, {} as ConfigService, {} as Queue);
    expect(await processor.announcePodiums()).toBe(2);
    const insert = query.mock.calls.find(([sql]) => String(sql).includes("'PODIUM'")) as unknown as [string, unknown[]];
    const rows = JSON.parse(String(insert[1][0]));
    expect(rows[0]).toMatchObject({ userId: 'u1', title: '🥇 You won Move with Tee', link: '/competitions/ABC' });
    expect(rows[1].title).toBe('🥈 2nd in Move with Tee');
  });
});
