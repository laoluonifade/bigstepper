import { TablesRepository } from './tables.repository';
import { TablesService } from './tables.service';

describe('challenge invitation responses', () => {
  const manager = {
    query: jest.fn(),
    findOne: jest.fn(),
    exists: jest.fn(),
    count: jest.fn(),
    create: jest.fn((_: unknown, value: unknown) => value),
    save: jest.fn(async (_: unknown, value: unknown) => value),
  };
  const dataSource = { transaction: jest.fn(async (work: (value: unknown) => Promise<unknown>) => work(manager)) };
  const service = new TablesService({} as never, {} as never, dataSource as never, {} as never, {} as never, {} as never, {} as never, new TablesRepository(dataSource as never));

  beforeEach(() => {
    jest.clearAllMocks();
    manager.exists.mockResolvedValue(false);
    manager.count.mockResolvedValue(1);
  });

  it('does not let another account answer the invitation', async () => {
    manager.query.mockResolvedValueOnce([]);
    await expect(service.respondToInvitation('invite', 'stranger', 'ACCEPT')).rejects.toThrow('Invitation not found');
    expect(manager.findOne).not.toHaveBeenCalled();
  });

  it('does not send profile invitations to a funding draft', async () => {
    manager.findOne.mockResolvedValueOnce({ id: 'table', creatorId: 'host', status: 'PENDING_FUNDING' });
    await expect(service.inviteRunner('table', 'host', 'runner')).rejects.toThrow('Invitations are closed');
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('joins a free invite and marks it accepted in the same transaction', async () => {
    manager.query.mockResolvedValueOnce([{ id: 'invite', tableId: 'table', status: 'PENDING' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    manager.findOne.mockResolvedValueOnce({ id: 'table', code: 'ABCDEFGH', type: 'sponsored', status: 'OPEN_FOR_ENTRY', capacity: 10, guaranteedPrizeKobo: null, entryClosesAt: new Date(Date.now() + 60_000) });
    await expect(service.respondToInvitation('invite', 'runner', 'ACCEPT')).resolves.toMatchObject({ status: 'ACCEPTED', joined: true, contributionOptional: true });
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(manager.query.mock.calls[1]).toEqual([expect.stringContaining('UPDATE "challenge_invitations"'), ['invite', 'ACCEPTED']]);
    expect(manager.query.mock.calls[2][0]).toContain('INSERT INTO "table_activity_credits"');
  });

  it('does not mark a paid invite accepted before payment', async () => {
    manager.query.mockResolvedValueOnce([{ id: 'invite', tableId: 'table', status: 'PENDING' }]).mockResolvedValueOnce([{ count: 0 }]);
    manager.findOne.mockResolvedValueOnce({ id: 'table', code: 'ABCDEFGH', type: 'paid', status: 'OPEN_FOR_ENTRY', capacity: 10, creatorId: 'host', entryClosesAt: new Date(Date.now() + 60_000) });
    await expect(service.respondToInvitation('invite', 'runner', 'ACCEPT')).resolves.toMatchObject({ status: 'PENDING', joined: false, paymentRequired: true });
    expect(manager.save).not.toHaveBeenCalled();
  });
});

describe('growing funded-free creation', () => {
  it('opens free entry without requiring a creator deposit', async () => {
    const tables = { create: jest.fn((value) => value) };
    const service = new TablesService(tables as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, new TablesRepository({} as never));
    jest.spyOn(service as unknown as { saveWithInvites: (table: unknown, input: unknown) => Promise<unknown> }, 'saveWithInvites')
      .mockImplementation(async (table) => table);
    const created = await service.create('host', { title: 'Community run', fundedFree: true, capacity: 10, prizeSplitBps: [10000] });
    expect(created).toMatchObject({ type: 'sponsored', status: 'OPEN_FOR_ENTRY', guaranteedPrizeKobo: null, fundingDestination: 'WINNERS', entryFeeKobo: 0 });
  });
});
