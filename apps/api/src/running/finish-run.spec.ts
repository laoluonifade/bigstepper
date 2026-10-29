import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { RunningService } from './running.service';

function setup(received: number, distanceMetres: number) {
  const session: Record<string, unknown> = { id: 'session', userId: 'runner', status: 'RUNNING', activityType: 'cycle', distanceMetres, stepCount: 0, pausedSeconds: 0, pausedAt: null, startedAt: new Date(Date.now() - 600_000), expectedSamples: null, finishRequestedAt: null };
  const manager = {
    findOne: jest.fn(async (entity: { name: string }) => (entity.name === 'RunningSession' ? session : null)),
    count: jest.fn(async () => received),
    delete: jest.fn(async () => undefined),
    save: jest.fn(async (...args: unknown[]) => (args.length === 2 ? { id: 'activity', ...(args[1] as object) } : args[0])),
    create: jest.fn((_: unknown, value: unknown) => value),
    query: jest.fn(async () => []),
  };
  const dataSource = { transaction: jest.fn(async (work: (value: typeof manager) => Promise<unknown>) => work(manager)) };
  const queue = { add: jest.fn() };
  const service = new RunningService({} as never, dataSource as never, queue as never);
  return { service, manager, queue, session };
}

describe('finishing a run', () => {
  it('asks an older app to send its points again once, then finishes with what arrived', async () => {
    const { service, manager, queue } = setup(120, 4000);
    await expect(service.finish('runner', 'session', undefined, 400)).rejects.toBeInstanceOf(ConflictException);
    expect(manager.save).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ runningSessionId: 'session' }));
    await expect(service.finish('runner', 'session', undefined, 400)).resolves.toMatchObject({ recordedDistanceMetres: 4000 });
    expect(queue.add).toHaveBeenCalledWith('verify-activity', expect.anything(), expect.objectContaining({ jobId: 'activity-activity' }));
  });

  it('finishes straight away for a phone still uploading, and waits for its points before checking', async () => {
    const { service, queue, session } = setup(120, 900);
    await expect(service.finish('runner', 'session', undefined, 400, { distanceMetres: 4000, deferred: true }))
      .resolves.toMatchObject({ recordedDistanceMetres: 4000, verificationStatus: 'PENDING_VERIFICATION' });
    expect(session.expectedSamples).toBe(400);
    expect(queue.add).toHaveBeenCalledWith('verify-activity', expect.anything(), expect.objectContaining({ jobId: 'activity-activity-late', delay: expect.any(Number) }));
  });

  it('saves once every point has arrived, with the distance from all of them', async () => {
    const { service, queue } = setup(400, 4000);
    await expect(service.finish('runner', 'session', undefined, 400)).resolves.toMatchObject({ recordedDistanceMetres: 4000, verificationStatus: 'PENDING_VERIFICATION' });
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('keeps nothing when GPS measured 0.00 km', async () => {
    const { service, manager, queue } = setup(30, 2);
    await expect(service.finish('runner', 'session', undefined, 30)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(manager.delete).toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('still finishes for older apps that send no point count', async () => {
    const { service, manager } = setup(10, 2);
    await expect(service.finish('runner', 'session')).resolves.toMatchObject({ id: 'activity' });
    expect(manager.count).not.toHaveBeenCalled();
  });
});
