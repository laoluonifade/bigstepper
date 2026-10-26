import { DataSource } from 'typeorm';
import { CloudinaryService } from '../profiles/cloudinary.service';
import { FeedService } from './feed.service';

describe('FeedService', () => {
  const query = jest.fn();
  const service = new FeedService({ query } as unknown as DataSource, {} as CloudinaryService);

  beforeEach(() => query.mockReset());

  it('requires content before creating a post', async () => {
    await expect(service.create('runner', { body: '  ' })).rejects.toThrow('Write an update, add a photo or choose an activity');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an activity the runner does not own and have verified', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.create('runner', { activityId: 'activity' })).rejects.toThrow('Choose one of your verified activities');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('trims text and attaches an owned verified activity', async () => {
    query.mockResolvedValueOnce([{ id: 'activity' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'post', createdAt: new Date() }]);
    await service.create('runner', { body: '  Good run  ', activityId: 'activity' });
    expect(query.mock.calls[2][1]).toEqual(['runner', 'Good run', 'activity', null]);
  });

  it('adds the caption to the post the activity made by itself instead of posting it twice', async () => {
    query.mockResolvedValueOnce([{ id: 'activity' }]).mockResolvedValueOnce([{ id: 'auto', createdAt: new Date() }]);
    await expect(service.create('runner', { body: 'Good run', activityId: 'activity' })).resolves.toMatchObject({ id: 'auto' });
    expect(query.mock.calls[1][1]).toEqual(['runner', 'activity', 'Good run', null]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO "feed_posts"'))).toBe(false);
  });

  it('rejects invalid feed scopes and pages', async () => {
    await expect(service.list('runner', 'all')).rejects.toThrow('Invalid feed scope');
    await expect(service.list('runner', 'following', '-1')).rejects.toThrow('Invalid feed page');
  });

  it('does not let a runner react to a hidden post', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.react('viewer', 'post', 'LIKE')).rejects.toThrow('Post not found');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('trims comments and checks visibility before inserting', async () => {
    query.mockResolvedValueOnce([{}]).mockResolvedValueOnce([{ id: 'comment' }]);
    await service.comment('viewer', 'post', '  Nice run!  ');
    expect(query.mock.calls[1][1]).toEqual(['post', 'viewer', 'Nice run!']);
  });

  it('does not reveal a post that the viewer cannot see', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.post('viewer', 'hidden-post')).rejects.toThrow('Post not found');
  });
});
