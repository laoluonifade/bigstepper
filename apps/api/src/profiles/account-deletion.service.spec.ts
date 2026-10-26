import { ConflictException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { AccountDeletionService } from './account-deletion.service';

const clear = { balance: '0', unpaidPrizes: 0, unpaidEarnings: 0, clubs: 0, hosting: 0, cashEntries: 0 };

function setup(state: Partial<typeof clear> = {}) {
  const query = jest.fn(async (sql: string, _params?: unknown[]) => (sql.includes('AS "balance"') ? [{ ...clear, ...state }] : []));
  const manager = { query };
  const dataSource = { manager, transaction: async (work: (m: typeof manager) => Promise<unknown>) => work(manager) } as unknown as DataSource;
  return { service: new AccountDeletionService(dataSource), query };
}

describe('AccountDeletionService', () => {
  it.each([
    [{ balance: '50000' }, /entry credit/],
    [{ unpaidPrizes: 1 }, /prize money/],
    [{ unpaidEarnings: 2 }, /earnings/],
    [{ clubs: 1 }, /own a club/],
    [{ hosting: 1 }, /hosting/],
    [{ cashEntries: 1 }, /cash prizes/],
  ])('refuses while %j and says why', async (state, message) => {
    const { service, query } = setup(state);
    expect(await service.blocker('u1')).toMatch(message);
    await expect(service.delete('u1')).rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('DELETE'))).toBe(false);
  });

  it('deletes everything personal and anonymises the account when nothing is owed', async () => {
    const { service, query } = setup();
    expect(await service.blocker('u1')).toBeNull();
    await service.delete('u1');
    const statements = query.mock.calls.map(([sql]) => String(sql));
    for (const table of ['running_sessions', 'feed_posts', 'direct_messages', 'follows', 'club_memberships', 'push_tokens', 'auth_sessions', 'notifications']) {
      expect(statements.some((sql) => sql.startsWith(`DELETE FROM "${table}"`))).toBe(true);
    }
    expect(statements.findIndex((sql) => sql.includes('"table_activity_credits"'))).toBeLessThan(statements.findIndex((sql) => sql.includes('DELETE FROM "running_sessions"')));
    const account = query.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE "users"'));
    expect(account?.[1]?.[1]).toMatch(/^deleted-[0-9a-f]+@deleted\.startajump\.invalid$/);
    const profile = query.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE "profiles"'));
    expect(profile?.[0]).toContain('"avatarUrl" = NULL');
    expect(profile?.[1]?.[1]).toMatch(/^deleted_[0-9a-f]+$/);
  });
});
