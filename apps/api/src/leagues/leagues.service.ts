import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Profile } from '../profiles/profile.entity';
import { PROMOTE_SHARE, RELEGATE_SHARE } from './league-rules';
import { LeagueDivision } from './league-division.entity';
import { LeagueMembership } from './league-membership.entity';
import { LeagueSeason } from './league-season.entity';

@Injectable()
export class LeaguesService {
  constructor(
    @InjectRepository(LeagueDivision) private readonly divisions: Repository<LeagueDivision>,
    @InjectRepository(LeagueSeason) private readonly seasons: Repository<LeagueSeason>,
    @InjectRepository(LeagueMembership) private readonly memberships: Repository<LeagueMembership>,
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
  ) {}

  async list() {
    const [seasons, divisions] = await Promise.all([
      this.seasons.find({ order: { startsAt: 'DESC' }, take: 20 }),
      this.divisions.find({ order: { level: 'ASC' } }),
    ]);
    return { seasons, divisions, rules: { promotePercent: PROMOTE_SHARE * 100, relegatePercent: RELEGATE_SHARE * 100 } };
  }

  async mine(userId: string) {
    return this.memberships.find({ where: { userId }, order: { creditedDistanceMetres: 'DESC' } });
  }

  async standings(seasonId: string) {
    const exists = await this.seasons.exist({ where: { id: seasonId } });
    if (!exists) throw new NotFoundException('League season not found');
    const rows = await this.memberships
      .createQueryBuilder('m')
      .innerJoin('users', 'u', 'u.id = m."userId" AND u.role = :role', { role: 'runner' })
      .where('m."seasonId" = :seasonId', { seasonId })
      // Property paths, not quoted columns: TypeORM needs them to order a paginated (take) query.
      .orderBy('m.divisionId', 'ASC')
      .addOrderBy('m.creditedDistanceMetres', 'DESC')
      .addOrderBy('m.id', 'ASC')
      .take(1000)
      .getMany();
    // Same public fields table leaderboards show: display name and handle.
    const profiles = rows.length ? await this.profiles.find({ where: { userId: In(rows.map((row) => row.userId)) } }) : [];
    const byUser = new Map(profiles.map((profile) => [profile.userId, profile]));
    return rows.map((row) => ({
      ...row,
      displayName: byUser.get(row.userId)?.displayName ?? null,
      username: byUser.get(row.userId)?.username ?? null,
      avatarUrl: byUser.get(row.userId)?.avatarUrl ?? null,
      avatarStyle: byUser.get(row.userId)?.gender === 'male' ? 'masculine' : byUser.get(row.userId)?.gender === 'female' ? 'feminine' : 'neutral',
    }));
  }
}
