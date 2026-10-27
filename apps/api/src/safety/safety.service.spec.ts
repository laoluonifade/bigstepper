import { SafetyService } from './safety.service';

function setup(overrides: Record<string, unknown> = {}) {
  const repo = {
    userIdByUsername: jest.fn(async () => 'other'),
    block: jest.fn(), unfollowBothWays: jest.fn(),
    rant: jest.fn(async () => ({ userId: 'other', snapshot: { body: 'spam' } })),
    messageSeenBy: jest.fn(async () => undefined),
    createReport: jest.fn(async () => true),
    lockReport: jest.fn(async () => ({ id: 'report', targetType: 'profile', targetId: 'other', targetUserId: 'other', status: 'OPEN' })),
    removeContent: jest.fn(), suspend: jest.fn(), resolveOpen: jest.fn(async () => ['me']), audit: jest.fn(), thankReporters: jest.fn(),
    ...overrides,
  };
  const dataSource = { transaction: jest.fn(async (work: (manager: unknown) => Promise<unknown>) => work({})) };
  return { service: new SafetyService(dataSource as never, repo as never), repo };
}

const RANT = '0b9f7b52-0f4e-4a43-9f4c-7c1c1a2b3c4d';

describe('SafetyService', () => {
  it('blocks and unfollows both ways in one go', async () => {
    const { service, repo } = setup();
    await service.block('me', 'other');
    expect(repo.block).toHaveBeenCalledWith({}, 'me', 'other');
    expect(repo.unfollowBothWays).toHaveBeenCalledWith({}, 'me', 'other');
  });

  it('won’t block yourself', async () => {
    const { service } = setup({ userIdByUsername: jest.fn(async () => 'me') });
    await expect(service.block('me', 'me')).rejects.toThrow('can’t block yourself');
  });

  it('reports a Rant with what it said at the time', async () => {
    const { service, repo } = setup();
    await service.report('me', { targetType: 'rant', target: RANT, reason: 'spam', note: '  bots  ' });
    expect(repo.createReport).toHaveBeenCalledWith(expect.objectContaining({ targetUserId: 'other', note: 'bots', snapshot: { body: 'spam' } }));
  });

  it('won’t report a message you can’t see', async () => {
    const { service } = setup();
    await expect(service.report('me', { targetType: 'message', target: RANT, reason: 'harassment' })).rejects.toThrow('no longer on Jump');
  });

  it('won’t report your own Rant', async () => {
    const { service } = setup({ rant: jest.fn(async () => ({ userId: 'me', snapshot: {} })) });
    await expect(service.report('me', { targetType: 'rant', target: RANT, reason: 'spam' })).rejects.toThrow('can’t report yourself');
  });

  it('won’t remove a profile, and needs a reason to suspend', async () => {
    const { service, repo } = setup();
    await expect(service.resolve('admin', 'report', { action: 'remove' })).rejects.toThrow('Suspend the account instead');
    await expect(service.resolve('admin', 'report', { action: 'suspend' })).rejects.toThrow('Say why');
    await service.resolve('admin', 'report', { action: 'suspend', note: 'Impersonating a club' });
    expect(repo.suspend).toHaveBeenCalledWith({}, 'other', 'Impersonating a club');
    expect(repo.thankReporters).toHaveBeenCalledWith({}, ['me'], true);
  });
});
