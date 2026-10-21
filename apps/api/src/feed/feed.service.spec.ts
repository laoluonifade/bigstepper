import { DataSource } from 'typeorm';
import { FeedService } from './feed.service';

describe('FeedService', () => {
  const query = jest.fn();
  const service = new FeedService({ query } as unknown as DataSource);

  beforeEach(() => query.mockReset());

  it('requires content before creating a post', async () => {
    await expect(service.create('runner', { body: '  ' })).rejects.toThrow('Write an update or choose an activity');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an activity the runner does not own and have verified', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.create('runner', { activityId: 'activity' })).rejects.toThrow('Choose one of your verified activities');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('trims text and attaches an owned verified activity', async () => {
    query.mockResolvedValueOnce([{ id: 'activity' }]).mockResolvedValueOnce([{ id: 'post', createdAt: new Date() }]);
    await service.create('runner', { body: '  Good run  ', activityId: 'activity' });
    expect(query.mock.calls[1][1]).toEqual(['runner', 'Good run', 'activity']);
  });

  it('rejects invalid feed scopes and pages', async () => {
    await expect(service.list('runner', 'all')).rejects.toThrow('Invalid feed scope');
    await expect(service.list('runner', 'following', '-1')).rejects.toThrow('Invalid feed page');
  });
});
