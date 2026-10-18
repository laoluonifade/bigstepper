import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { ClubMembership } from './club-membership.entity';
import { Club } from './club.entity';
import { CreateClubDto } from './dto/create-club.dto';

@Injectable()
export class ClubsService {
  constructor(
    @InjectRepository(Club) private readonly clubs: Repository<Club>,
    @InjectRepository(ClubMembership) private readonly memberships: Repository<ClubMembership>,
    private readonly dataSource: DataSource,
  ) {}

  async create(userId: string, input: CreateClubDto) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const club = await manager.save(
          Club,
          manager.create(Club, { name: input.name.trim(), slug: input.slug.toLowerCase(), ownerUserId: userId }),
        );
        await manager.save(ClubMembership, manager.create(ClubMembership, { clubId: club.id, userId, role: 'owner' }));
        return club;
      });
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('Community slug is already in use');
      }
      throw error;
    }
  }

  async get(clubId: string) {
    const club = await this.clubs.findOne({ where: { id: clubId } });
    if (!club) throw new NotFoundException('Community not found');
    const memberCount = await this.memberships.count({ where: { clubId } });
    return { ...club, memberCount };
  }

  async members(clubId: string) {
    await this.get(clubId);
    return this.memberships.find({ where: { clubId }, order: { joinedAt: 'ASC' }, take: 500 });
  }

  async addMember(actorUserId: string, clubId: string, userId: string) {
    const actor = await this.memberships.findOne({ where: { clubId, userId: actorUserId } });
    if (!actor || !['owner', 'admin'].includes(actor.role)) throw new ForbiddenException('Community admin access required');
    try {
      return await this.memberships.save(this.memberships.create({ clubId, userId, role: 'member' }));
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('Runner is already a member');
      }
      throw error;
    }
  }
}
