import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Profile } from './profile.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfilesService {
  constructor(@InjectRepository(Profile) private readonly profiles: Repository<Profile>) {}

  async getMine(userId: string) {
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  async updateMine(userId: string, input: UpdateProfileDto) {
    const profile = await this.getMine(userId);
    Object.assign(profile, {
      ...input,
      username: input.username?.toLowerCase(),
      displayName: input.displayName?.trim(),
    });
    try {
      return await this.profiles.save(profile);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505'
      ) {
        throw new ConflictException('Username is already in use');
      }
      throw error;
    }
  }

  async getPublic(username: string) {
    const profile = await this.profiles.findOne({ where: { username: username.toLowerCase() } });
    if (!profile) throw new NotFoundException('Runner not found');
    return { username: profile.username, displayName: profile.displayName, countryCode: profile.countryCode };
  }
}
