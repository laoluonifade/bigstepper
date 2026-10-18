import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeagueDivision } from './league-division.entity';
import { LeagueMembership } from './league-membership.entity';
import { LeagueSeason } from './league-season.entity';

@Injectable()
export class LeaguesService {
  constructor(
    @InjectRepository(LeagueDivision) private readonly divisions: Repository<LeagueDivision>,
    @InjectRepository(LeagueSeason) private readonly seasons: Repository<LeagueSeason>,
    @InjectRepository(LeagueMembership) private readonly memberships: Repository<LeagueMembership>,
  ) {}

  async list() {
    const [seasons, divisions] = await Promise.all([
      this.seasons.find({ order: { startsAt: 'DESC' }, take: 20 }),
      this.divisions.find({ order: { level: 'ASC' } }),
    ]);
    return { seasons, divisions };
  }

  async mine(userId: string) {
    return this.memberships.find({ where: { userId }, order: { creditedDistanceMetres: 'DESC' } });
  }

  async standings(seasonId: string) {
    const exists = await this.seasons.exist({ where: { id: seasonId } });
    if (!exists) throw new NotFoundException('League season not found');
    return this.memberships.find({
      where: { seasonId },
      order: { divisionId: 'ASC', creditedDistanceMetres: 'DESC', id: 'ASC' },
      take: 1000,
    });
  }
}
