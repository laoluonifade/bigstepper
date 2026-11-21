import type { EntityManager } from 'typeorm';
import { medalMessages, recordResults, trophiesFor } from './trophies';

describe('trophies', () => {
  it('reads medals from the frozen results and counts each kind', async () => {
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => [
      { tableId: 'a', rank: 1, title: 'Move with Tee', kind: 'competition', medal: 'gold' },
      { tableId: 'b', rank: 3, title: 'Lekki 10K', kind: 'competition', medal: 'bronze' },
      { tableId: 'c', rank: 9, title: 'The 10K Club', kind: 'competition', medal: 'completion' },
      { tableId: 'd', rank: 1, title: 'Duel vs Bolu', kind: 'duel', medal: 'gold' },
    ]);
    const cabinet = await trophiesFor({ query } as unknown as EntityManager, 'u1');
    expect(cabinet).toMatchObject({ wins: 2, podiums: 3, medals: { gold: 1, silver: 0, bronze: 1, completed: 1 } });
    expect(cabinet.trophies.map((trophy) => trophy.tableId)).toEqual(['a', 'b', 'd']);
    expect(cabinet.completions.map((trophy) => trophy.tableId)).toEqual(['c']);
    expect(String(query.mock.calls[0][0])).toContain('"competition_results"');
  });

  it('gives podium medals only for real placings, and completion medals for hitting the target', async () => {
    const query = jest.fn(async () => []);
    await recordResults({ query } as unknown as EntityManager, ['t1']);
    const sql = String((query.mock.calls[0] as unknown as [string])[0]);
    expect(sql).toContain('x."entrants" >= 2');
    expect(sql).toContain('x."score" > 0 OR x."targetReachedAt" IS NOT NULL');
    expect(sql).toContain(`t."medalRule" = 'completion'`);
    expect(sql).toContain(`'TARGET_DAYS','LONGEST_STREAK'`);
  });

  it('writes one message per medal, and one summary when someone earns several at once', () => {
    const rows = medalMessages([
      { userId: 'u1', rank: 1, medal: 'gold', code: 'ABC', title: 'Weekly Step Champion' },
      { userId: 'u2', rank: 3, medal: 'bronze', code: 'DEF', title: 'Weekend Warriors' },
      { userId: 'u3', rank: 12, medal: 'completion', code: 'GHI', title: 'The 50K Club' },
      { userId: 'u4', rank: 4, medal: 'completion', code: 'J', title: 'Just 5K' },
      { userId: 'u4', rank: 1, medal: 'gold', code: 'K', title: 'Last Step Standing' },
    ]);
    expect(rows[0]).toMatchObject({ userId: 'u1', title: '🥇 You won Weekly Step Champion!', link: '/competitions/ABC' });
    expect(rows[1]).toMatchObject({ title: '🥉 You finished 3rd in Weekend Warriors', body: 'You’ve earned a bronze medal. It’s on your profile now.' });
    expect(rows[2]).toMatchObject({ title: '🏅 You completed The 50K Club!', body: 'Your completion medal has been added to your profile.' });
    expect(rows[3]).toMatchObject({ userId: 'u4', title: '🥇 2 new medals', link: '/you' });
  });
});
