import { BadRequestException } from '@nestjs/common';
import { alreadyImported, saveImportedActivity } from '../running/import-activity';
import { spreadSteps } from './apple-health-steps';
import { AppleHealthService } from './apple-health.service';

jest.mock('../tables/competition-credits', () => ({ retotal: jest.fn(), uncreditActivity: jest.fn(), HEALTH_ELIGIBLE: () => 'true' }));

jest.mock('../running/import-activity', () => ({
  alreadyImported: jest.fn(),
  saveImportedActivity: jest.fn(),
}));

const imported = alreadyImported as jest.Mock;
const save = saveImportedActivity as jest.Mock;

function setup(linked = true) {
  const links = { exist: jest.fn().mockResolvedValue(linked), update: jest.fn() };
  const queue = { add: jest.fn() };
  const service = new AppleHealthService(links as never, {} as never, queue as never);
  return { service, links, queue };
}

const workout = {
  id: '6F9619FF-8B86-D011-B42D-00C04FC964FF',
  activityType: 'walk' as const,
  startedAt: '2026-10-30T06:00:00.000Z',
  finishedAt: '2026-10-30T06:30:00.000Z',
  distanceMetres: 2400,
  steps: 3200,
  route: [[6.5, 3.4, 0], [6.505, 3.4, 900], [6.51, 3.4, 1800]] as Array<[number, number, number]>,
};

describe('AppleHealthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    imported.mockResolvedValue(false);
    save.mockResolvedValue({ id: 'activity' });
  });

  it('needs a connection before importing', async () => {
    const { service } = setup(false);
    await expect(service.importWorkout('runner', workout)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('imports a workout with its route and sensor steps, then queues verification', async () => {
    const { service, queue, links } = setup();
    await expect(service.importWorkout('runner', workout)).resolves.toEqual({ imported: true });
    const input = save.mock.calls[0][1];
    expect(input).toMatchObject({ source: 'apple_health', externalId: 'ah:6f9619ff-8b86-d011-b42d-00c04fc964ff', recordedSteps: 3200, stepsSource: 'sensor', elapsedSeconds: 1800 });
    expect(input.points.map((point: { stepCount: number }) => point.stepCount)).toEqual([0, 1600, 3200]);
    expect(queue.add).toHaveBeenCalledWith('verify-activity', { activityId: 'activity' }, expect.anything());
    expect(links.update).not.toHaveBeenCalled();
  });

  it('skips workouts already imported or overlapping another activity', async () => {
    imported.mockResolvedValue(true);
    const { service } = setup();
    await expect(service.importWorkout('runner', workout)).resolves.toEqual({ imported: false });
    expect(save).not.toHaveBeenCalled();
  });

  it('skips workouts without a usable route', async () => {
    const { service } = setup();
    await expect(service.importWorkout('runner', { ...workout, route: [[6.5, 3.4, 0], [200, 3.4, 10]] })).resolves.toEqual({ imported: false });
    expect(save).not.toHaveBeenCalled();
  });

  it('caps implausible step counts and leaves rides without steps', async () => {
    const { service } = setup();
    await service.importWorkout('runner', { ...workout, steps: 199_999 });
    expect(save.mock.calls[0][1].recordedSteps).toBe(1800 * 4);
    await service.importWorkout('runner', { ...workout, activityType: 'cycle' });
    expect(save.mock.calls[1][1]).toMatchObject({ recordedSteps: 0, stepsSource: null });
  });
});

describe('AppleHealthService daily steps', () => {
  function stepsSetup(changed: Array<{ day: string }>, tables: Array<{ id: string }>) {
    const query = jest.fn().mockResolvedValueOnce(changed).mockResolvedValueOnce(tables);
    const dataSource = { query, transaction: jest.fn(async (work: (manager: unknown) => Promise<void>) => work('manager')) };
    const links = { exist: jest.fn().mockResolvedValue(true) };
    return { service: new AppleHealthService(links as never, dataSource as never, {} as never), query, dataSource };
  }
  const today = new Date().toISOString().slice(0, 10);

  it('saves recent days only and rescores the competitions Apple Health counts in', async () => {
    const { service, query, dataSource } = stepsSetup([{ day: today }], [{ id: 'table' }]);
    await expect(service.saveDailySteps('runner', [{ day: today, steps: 12_000 }, { day: '2001-01-01', steps: 5 }])).resolves.toEqual({ saved: 1 });
    expect(JSON.parse(query.mock.calls[0][1][1])).toEqual([{ day: today, steps: 12_000 }]);
    expect(query.mock.calls[0][0]).toContain('LEAST(x."steps", 100000)');
    expect(query.mock.calls[0][0]).toContain('LEAST(COALESCE(x."countedSteps", 0), s.steps)');
    expect(dataSource.transaction).toHaveBeenCalled();
  });

  it('does nothing more when no day changed', async () => {
    const { service, query, dataSource } = stepsSetup([], []);
    await service.saveDailySteps('runner', [{ day: today, steps: 100 }]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});

describe('spreadSteps', () => {
  it('spreads steps along the distance covered', () => {
    expect(spreadSteps([[0, 0], [0, 0], [0.001, 0]], 100)).toEqual([0, 0, 100]);
  });
});
