import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreatorProfile } from './creator-profile.entity';
import { CreatorSignupDto } from './creator.dto';
import { AmlService } from '../aml/aml.service';

@Injectable()
export class CreatorsService {
  constructor(@InjectRepository(CreatorProfile) private readonly creators: Repository<CreatorProfile>, private readonly aml: AmlService) {}

  async signup(userId: string, input: CreatorSignupDto) {
    await this.aml.assertVerified(userId);
    try {
      return await this.creators.save(this.creators.create({
        userId,
        creatorType: input.creatorType,
        displayName: input.displayName.trim(),
        socialUrl: input.socialUrl?.trim() || null,
        bio: input.bio?.trim() || null,
        status: 'PENDING',
        commissionBps: 500,
      }));
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('Creator account already exists');
      }
      throw error;
    }
  }

  async me(userId: string) {
    const profile = await this.creators.findOne({ where: { userId } });
    if (!profile) throw new NotFoundException('Creator account not found');
    return profile;
  }

  earnings(userId: string) {
    return this.creators.manager.query(
      `SELECT e."id",e."tableId",e."grossPrizeKobo",e."amountKobo",e."currency",e."status",e."createdAt"
       FROM "creator_earnings" e JOIN "creator_profiles" c ON c."id"=e."creatorProfileId"
       WHERE c."userId"=$1 ORDER BY e."createdAt" DESC`,
      [userId],
    );
  }
}
