import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { CompetitionTable } from './competition-table.entity';
import { CreateTableDto } from './dto/create-table.dto';
import { TableRegistration } from './table-registration.entity';
import { assertScoringConfiguration } from './challenge-types';
import { CreateCreatorPaidChallengeDto } from '../admin/paid-table.dto';

@Injectable()
export class TablesService {
  constructor(
    @InjectRepository(CompetitionTable)
    private readonly tables: Repository<CompetitionTable>,
    @InjectRepository(TableRegistration)
    private readonly registrations: Repository<TableRegistration>,
    private readonly dataSource: DataSource,
  ) {}

  async list() {
    const tables = await this.tables.find({
      where: { status: 'OPEN_FOR_ENTRY' },
      relations: { creator: true },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return this.present(tables);
  }

  /**
   * Public shape of a challenge: the creator is reduced to id + display name (the relation is the full
   * user row, email included, which must never leave the API), plus how many runners have joined.
   */
  private async present(tables: CompetitionTable[]) {
    const counts = tables.length
      ? ((await this.dataSource.query(
          `SELECT "tableId", count(*)::int AS n FROM "table_registrations" WHERE "tableId" = ANY($1::uuid[]) GROUP BY "tableId"`,
          [tables.map((table) => table.id)],
        )) as Array<{ tableId: string; n: number }>)
      : [];
    const byTable = new Map(counts.map((row) => [row.tableId, row.n]));
    return tables.map(({ creator, ...table }) => ({
      ...table,
      creator: creator ? { id: creator.id, displayName: creator.displayName } : null,
      entrantCount: byTable.get(table.id) ?? 0,
    }));
  }

  async mine(userId: string) {
    const rows = await this.tables.query(
      `SELECT t."id", t."code", t."title", t."type", t."status", t."scoringClosesAt",
              (t."creatorId" = $1) AS "hosting", (r."id" IS NOT NULL) AS "joined"
       FROM "competition_tables" t
       LEFT JOIN "table_registrations" r ON r."tableId" = t."id" AND r."userId" = $1
       WHERE t."creatorId" = $1 OR r."id" IS NOT NULL
       ORDER BY COALESCE(r."joinedAt", t."createdAt") DESC
       LIMIT 50`,
      [userId],
    );
    return rows as Array<{ id: string; code: string; title: string; type: string; status: string; scoringClosesAt: string | null; hosting: boolean; joined: boolean }>;
  }

  async create(creatorId: string, input: CreateTableDto) {
    const challengeType = input.challengeType ?? 'RUN';
    const scoringMethod = input.scoringMethod ?? (challengeType === 'WALK' || challengeType === 'STEP' ? 'MOST_STEPS' : challengeType === 'TIMED' ? 'FASTEST_TIME' : 'FARTHEST_DISTANCE');
    this.validateScoring(challengeType, scoringMethod, input.targetDistanceMetres);
    await this.assertCommunityManager(creatorId, input.communityId);
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const scoringClosesAt = input.scoringClosesAt
      ? new Date(input.scoringClosesAt)
      : new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const entryClosesAt = input.entryClosesAt ? new Date(input.entryClosesAt) : scoringClosesAt;
    if (entryClosesAt > scoringClosesAt || startsAt > scoringClosesAt) {
      throw new ConflictException('Entry and start times must be before scoring closes');
    }
    const table = this.tables.create({
      title: input.title.trim(),
      code: randomBytes(4).toString('hex').toUpperCase(),
      creatorId,
      type: 'free',
      entryFeeKobo: 0,
      status: 'OPEN_FOR_ENTRY',
      startsAt,
      entryClosesAt,
      scoringClosesAt,
      capacity: input.capacity ?? null,
      distanceCapMetres: input.distanceCapMetres ?? null,
      challengeType,
      scoringMethod,
      targetDistanceMetres: input.targetDistanceMetres ?? null,
      communityId: input.communityId ?? null,
      platformFeeBps: 3000,
      creatorCommissionBps: 0,
    });
    return this.tables.save(table);
  }

  async createPaidDraft(creatorId: string, input: CreateCreatorPaidChallengeDto) {
    this.validateScoring(input.challengeType, input.scoringMethod, input.targetDistanceMetres);
    await this.assertCommunityManager(creatorId, input.communityId);
    const creator = (await this.dataSource.query(
      `SELECT "id" FROM "creator_profiles" WHERE "userId"=$1 AND "status"='ACTIVE'`,
      [creatorId],
    ) as Array<{ id: string }>)[0];
    if (!creator) throw new ForbiddenException('An active creator account is required for paid challenges');
    const startsAt = new Date(input.startsAt);
    const entryClosesAt = new Date(input.entryClosesAt ?? input.scoringClosesAt);
    const scoringClosesAt = new Date(input.scoringClosesAt);
    if ((input.minimumEntrants ?? 2) > input.capacity || entryClosesAt > scoringClosesAt || startsAt > scoringClosesAt) {
      throw new ConflictException('Challenge dates or entrant limits are invalid');
    }
    return this.tables.save(this.tables.create({
      creatorId,
      title: input.title.trim(),
      code: randomBytes(4).toString('hex').toUpperCase(),
      type: 'paid',
      status: 'PENDING_APPROVAL',
      entryFeeKobo: input.entryFeeKobo,
      guaranteedPrizeKobo: input.guaranteedPrizeKobo,
      minimumEntrants: (input.minimumEntrants ?? 2),
      capacity: input.capacity,
      startsAt,
      entryClosesAt,
      scoringClosesAt,
      distanceCapMetres: null,
      challengeType: input.challengeType,
      scoringMethod: input.scoringMethod,
      targetDistanceMetres: input.targetDistanceMetres ?? null,
      communityId: input.communityId ?? null,
      platformFeeBps: 3500,
      creatorCommissionBps: 500,
    }));
  }

  async registerFree(tableId: string, userId: string) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const table = await manager.findOne(CompetitionTable, {
          where: { id: tableId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!table || table.type !== 'free') throw new NotFoundException('Free challenge not found');
        if (table.status !== 'OPEN_FOR_ENTRY' || (table.entryClosesAt && table.entryClosesAt <= new Date())) {
          throw new ConflictException('This challenge is not open for entry');
        }
        if (table.capacity) {
          const count = await manager.count(TableRegistration, { where: { tableId } });
          if (count >= table.capacity) throw new ConflictException('This challenge is full');
        }
        return manager.save(TableRegistration, manager.create(TableRegistration, { tableId, userId }));
      });
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('You already joined this challenge');
      }
      throw error;
    }
  }

  async standings(tableId: string) {
    const table = await this.tables.findOne({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Challenge not found');
    const metric = table.scoringMethod === 'MOST_STEPS' ? 'r."creditedSteps" DESC' : table.scoringMethod === 'FARTHEST_DISTANCE' ? 'r."creditedDistanceMetres" DESC' : 'r."completionTimeSeconds" ASC NULLS LAST';
    return this.dataSource.query(
      `SELECT row_number() OVER (ORDER BY ${metric},r."joinedAt" ASC,r."userId" ASC)::integer rank,
              r."userId",COALESCE(u."displayName",'Runner') "displayName",r."creditedDistanceMetres",r."creditedSteps",r."completionTimeSeconds"
       FROM "table_registrations" r JOIN "users" u ON u."id"=r."userId" WHERE r."tableId"=$1
       ORDER BY ${metric},r."joinedAt" ASC,r."userId" ASC LIMIT 500`,
      [tableId],
    );
  }

  async getByCode(code: string) {
    const table = await this.tables.findOne({
      where: { code: code.toUpperCase() },
      relations: { creator: true },
    });
    if (!table) throw new NotFoundException('Challenge not found');
    return (await this.present([table]))[0];
  }

  async result(tableId: string) {
    const rows = (await this.dataSource.query(
      `SELECT s.*, snap."standings", snap."algorithmVersion" FROM "table_settlements" s
       JOIN "table_leaderboard_snapshots" snap ON snap."id" = s."snapshotId"
       WHERE s."tableId" = $1 ORDER BY s."version" DESC LIMIT 1`,
      [tableId],
    )) as Array<Record<string, unknown>>;
    if (!rows[0]) throw new NotFoundException('Final result is not available');
    return rows[0];
  }

  private validateScoring(challengeType: Parameters<typeof assertScoringConfiguration>[0], scoringMethod: Parameters<typeof assertScoringConfiguration>[1], target?: number) {
    try {
      assertScoringConfiguration(challengeType, scoringMethod, target);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid challenge scoring');
    }
  }

  private async assertCommunityManager(userId: string, communityId?: string) {
    if (!communityId) return;
    const allowed = await this.dataSource.query(
      `SELECT 1 FROM "club_memberships" WHERE "clubId"=$1 AND "userId"=$2 AND "role" IN ('owner','admin')`,
      [communityId, userId],
    ) as unknown[];
    if (!allowed.length) throw new ForbiddenException('Community owner or admin access required');
  }
}
