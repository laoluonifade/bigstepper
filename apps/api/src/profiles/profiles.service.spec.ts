import { DataSource, Repository } from 'typeorm';
import { CloudinaryService } from './cloudinary.service';
import { Profile } from './profile.entity';
import { ProfilesService } from './profiles.service';

describe('ProfilesService public profile', () => {
  const findOne = jest.fn();
  const query = jest.fn();
  const service = new ProfilesService(
    { findOne } as unknown as Repository<Profile>,
    { query } as unknown as DataSource,
    {} as CloudinaryService,
  );
  const totals = { totalMetres: '4200', activities: 2, runs: 1, walks: 1, runMetres: '3000', walkMetres: '1200', longestMetres: 3000, movingSeconds: '1800', monthMetres: '4200' };

  beforeEach(() => {
    findOne.mockReset();
    query.mockReset();
  });

  it('shows verified totals to a non-follower without exposing dated activities', async () => {
    findOne.mockResolvedValue({ userId: 'runner', username: 'runner', activityVisibility: 'followers' });
    query.mockResolvedValueOnce([{ followers: 1, following: 0, followedByMe: false, followsMe: false }]).mockResolvedValueOnce([totals]);

    const profile = await service.getPublic('runner', 'visitor');

    expect(profile.stats).toMatchObject({ totalMetres: 4200, runMetres: 3000, walkMetres: 1200 });
    expect(profile.runsVisible).toBe(false);
    expect(profile).not.toHaveProperty('recent');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('still shows dated activities when the runner shares them publicly', async () => {
    findOne.mockResolvedValue({ userId: 'runner', username: 'runner', activityVisibility: 'public' });
    query.mockResolvedValueOnce([{ followers: 0, following: 0, followedByMe: false, followsMe: false }]).mockResolvedValueOnce([totals]).mockResolvedValueOnce([{ activityType: 'run', metres: 3000 }]);

    const profile = await service.getPublic('runner');

    expect(profile.stats).toMatchObject({ totalMetres: 4200 });
    expect(profile).toHaveProperty('recent', [{ activityType: 'run', metres: 3000 }]);
    expect(query).toHaveBeenCalledTimes(3);
  });
});
