import type { DataSource } from 'typeorm';
import type { CompetitionTable } from './competition-table.entity';
import { TablesService } from './tables.service';

function service(money: { paid?: boolean; entered?: boolean; awarded?: boolean }) {
  const query = jest.fn(async () => [{ paid: false, entered: false, awarded: false, ...money }]);
  const dataSource = { manager: { query } } as unknown as DataSource;
  const tables = new (TablesService as unknown as new (...args: unknown[]) => TablesService)(null, null, dataSource, null, null, null);
  return { tables, query };
}

const table = (type: string) => ({ id: 't1', creatorId: 'host', type }) as CompetitionTable;

describe('deleting a competition', () => {
  it('always allows a free competition, without even checking for money', async () => {
    const { tables, query } = service({ entered: true });
    expect(await tables.deletionBlocker(table('free'))).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ['sponsored', { paid: true }],
    ['paid', { paid: true }],
    ['paid', { entered: true }],
    ['sponsored', { awarded: true }],
  ])('refuses a %s competition with money on it (%j)', async (type, money) => {
    expect(await service(money).tables.deletionBlocker(table(type))).toMatch(/Money has been paid/);
  });

  it('allows a funded or paid competition nobody has paid into yet', async () => {
    expect(await service({}).tables.deletionBlocker(table('sponsored'))).toBeNull();
    // Someone joined a funded-free one without paying: still no money.
    expect(await service({ entered: true }).tables.deletionBlocker(table('sponsored'))).toBeNull();
    expect(await service({}).tables.deletionBlocker(table('paid'))).toBeNull();
  });
});
