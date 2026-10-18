import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ActivityVerificationReview } from './activity-verification-review.entity';
import { Activity } from './activity.entity';

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @InjectRepository(ActivityVerificationReview)
    private readonly reviews: Repository<ActivityVerificationReview>,
  ) {}

  list(userId: string) {
    return this.activities.find({ where: { userId }, order: { startedAt: 'DESC' }, take: 100 });
  }

  async get(userId: string, activityId: string) {
    const activity = await this.activities.findOne({ where: { id: activityId, userId } });
    if (!activity) throw new NotFoundException('Activity not found');
    return activity;
  }

  async requestReview(userId: string, activityId: string, reason: string) {
    const activity = await this.get(userId, activityId);
    if (activity.verificationStatus === 'PENDING_VERIFICATION') {
      throw new ConflictException('Verification is still in progress');
    }
    try {
      return await this.reviews.save(
        this.reviews.create({ activityId, requestedByUserId: userId, reason: reason.trim(), status: 'PENDING' }),
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505'
      ) {
        throw new ConflictException('A review is already pending');
      }
      throw error;
    }
  }
}
