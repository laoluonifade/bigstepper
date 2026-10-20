import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { Profile } from '../profiles/profile.entity';
import { ClubMembership } from './club-membership.entity';
import { Club } from './club.entity';
import { CreateClubDto } from './dto/create-club.dto';

@Injectable()
export class ClubsService {
  constructor(
    @InjectRepository(Club) private readonly clubs: Repository<Club>,
    @InjectRepository(ClubMembership) private readonly memberships: Repository<ClubMembership>,
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
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

  /** Clubs are addressed by their handle (slug); the UUID still works for older links. */
  async get(clubRef: string) {
    const ref = clubRef.trim().replace(/^\/+/, '').toLowerCase();
    const club = await this.clubs.findOne({ where: UUID_PATTERN.test(ref) ? { id: ref } : { slug: ref } });
    if (!club) throw new NotFoundException('Community not found');
    const memberCount = await this.memberships.count({ where: { clubId: club.id } });
    return { ...club, memberCount };
  }

  async members(clubRef: string) {
    const club = await this.get(clubRef);
    const memberships = await this.memberships.find({ where: { clubId: club.id }, order: { joinedAt: 'ASC' }, take: 500 });
    const profiles = memberships.length
      ? await this.profiles.find({ where: { userId: In(memberships.map((member) => member.userId)) } })
      : [];
    const byUser = new Map(profiles.map((profile) => [profile.userId, profile]));
    return memberships.map((member) => ({
      ...member,
      username: byUser.get(member.userId)?.username ?? null,
      avatarUrl: byUser.get(member.userId)?.avatarUrl ?? null,
      displayName: byUser.get(member.userId)?.displayName ?? null,
    }));
  }

  /** Admins add runners by their @username (or, for older clients, their user ID). */
  async addMember(actorUserId: string, clubRef: string, runner: { username?: string; userId?: string }) {
    const club = await this.get(clubRef);
    const actor = await this.memberships.findOne({ where: { clubId: club.id, userId: actorUserId } });
    if (!actor || !['owner', 'admin'].includes(actor.role)) throw new ForbiddenException('Community admin access required');
    const username = runner.username?.trim().replace(/^@/, '').toLowerCase();
    if (!username && !runner.userId) throw new BadRequestException('Enter the runner’s username');
    const profile = await this.profiles.findOne({ where: username ? { username } : { userId: runner.userId } });
    if (!profile) throw new NotFoundException(username ? `No runner with the username @${username}` : 'Runner not found');
    try {
      const membership = await this.memberships.save(this.memberships.create({ clubId: club.id, userId: profile.userId, role: 'member' }));
      return { ...membership, username: profile.username, displayName: profile.displayName };
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException(`@${profile.username} is already a member`);
      }
      throw error;
    }
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
