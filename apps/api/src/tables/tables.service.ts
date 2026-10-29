import { recordShare, recordView } from '../clubs/engagement';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { creditActivities, retotal } from './competition-credits';
import { enrolClubMembers } from './club-competitions';
import { AmlService } from '../aml/aml.service';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { DataSource, EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { CompetitionTable } from './competition-table.entity';
import { CreateTableDto } from './dto/create-table.dto';
import { TableRegistration } from './table-registration.entity';
import { ACTIVITY_RULES, METRICS, ScoringMethod } from './competition-rules';
import { scoringColumns } from './scoring-columns';
import { CloudinaryService } from '../profiles/cloudinary.service';
import { AVATAR_TYPES } from '../profiles/profiles.service';
import { announceCompetition, assertClubCanHost, assertCountryEligible, canManageTable, checkClubPrizes, nextStart, prizeColumns, savePrizes, templateOf, UNPUBLISHED } from './club-challenges';
import { TablesRepository, type DiscoverView } from './tables.repository';
import { CreateCreatorPaidChallengeDto } from '../admin/paid-table.dto';
import { allocatePrizes, assertPrizeSplit } from './prize-split';
import { paidPrizePot } from './paid-prize';
import { MailService } from '../mail/mail.service';
import { challengeInviteEmail } from '../mail/templates';
import { ConfigService } from '@nestjs/config';
import { calculatePrizeBreakdown } from '../payments/financial-policy';
import { reminderConfig } from './reminder-config';
import { changesPlace, placeColumns, type PlaceFieldsDto } from './place';

type Invites = { inviteEmails?: string[]; invitePhones?: string[]; inviteClubMembers?: true; communityId?: string };

@Injectable()
export class TablesService {
  constructor(
    @InjectRepository(CompetitionTable)
    private readonly tables: Repository<CompetitionTable>,
    @InjectRepository(TableRegistration)
    private readonly registrations: Repository<TableRegistration>,
    private readonly dataSource: DataSource,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly cloudinary: CloudinaryService,
    private readonly aml: AmlService,
    private readonly repo: TablesRepository,
  ) {}

  async list(sort = 'popular', type = 'all', activity = 'all') {
    if (!['popular', 'newest'].includes(sort) || !['all', 'free', 'sponsored', 'paid'].includes(type) ||
        !['all', 'WALK', 'RUN', 'DISTANCE', 'STEP', 'TIMED', 'CYCLING'].includes(activity)) {
      throw new BadRequestException('Invalid competition filter');
    }
    const ranked = await this.repo.openByPopularity(sort as 'popular' | 'newest', type, activity);
    if (!ranked.length) return [];
    const tables = await this.tables.find({
      where: { id: In(ranked.map((row) => row.id)) },
      relations: { creator: true },
    });
    const byId = new Map(tables.map((table) => [table.id, table]));
    return this.present(ranked.flatMap((row) => {
      const table = byId.get(row.id);
      return table ? [table] : [];
    }), ranked.map((row) => ({ tableId: row.id, n: row.n })));
  }

  async discover(viewerId: string | null, view = 'trending', type = 'all', activity = 'all', page = '0') {
    if (!['for-you', 'trending', 'starting', 'newest', 'friends', 'created', 'archived'].includes(view) || !['all', 'free', 'sponsored', 'paid'].includes(type) ||
        !['all', 'WALK', 'RUN', 'DISTANCE', 'STEP', 'TIMED', 'CYCLING'].includes(activity) || !/^(0|[1-9]\d{0,3})$/.test(page)) {
      throw new BadRequestException('Invalid competition filter');
    }
    if ((view === 'for-you' || view === 'friends' || view === 'created' || view === 'archived') && !viewerId) view = 'trending';
    const ranked = await this.repo.discover(view as DiscoverView, viewerId, type, activity, Number(page) * 20);
    const pageRows = ranked.slice(0, 20);
    if (!pageRows.length) return { items: [], hasMore: false };
    const tables = await this.tables.find({ where: { id: In(pageRows.map((row) => row.id)) }, relations: { creator: true } });
    const byId = new Map(tables.map((table) => [table.id, table]));
    const items = await this.present(pageRows.flatMap((row) => byId.get(row.id) ?? []), pageRows.map((row) => ({ tableId: row.id, n: row.n })));
    const podiums = await this.podiums(pageRows.map((row) => row.id), viewerId);
    return { items: items.map((item) => ({ ...item, ...(podiums.get(item.id) ?? { leaders: [], faces: [], myRank: null }) })), hasMore: ranked.length > 20 };
  }

  private async podiums(tableIds: string[], viewerId: string | null = null) {
    const out = new Map<string, { leaders: Array<{ rank: number; displayName: string; username: string | null; avatarUrl: string | null; avatarStyle: string; verified: boolean; score: number }>; faces: Array<{ displayName: string; avatarUrl: string | null; avatarStyle: string }>; myRank: number | null }>();
    if (!tableIds.length) return out;
    const rows = await this.repo.podiums(tableIds, viewerId);
    for (const row of rows) {
      const entry = out.get(row.tableId) ?? { leaders: [], faces: [], myRank: null };
      if (viewerId && row.userId === viewerId) entry.myRank = row.rank;
      if (row.rank > 5) { out.set(row.tableId, entry); continue; }
      const score = row.score;
      const scored = score !== null && (METRICS[row.scoringMethod as ScoringMethod]?.better === 'lower' || score > 0);
      if (scored && score !== null && row.rank <= 3) entry.leaders.push({ rank: row.rank, displayName: row.displayName, username: row.username, avatarUrl: row.avatarUrl, avatarStyle: row.avatarStyle, verified: row.verified, score });
      entry.faces.push({ displayName: row.displayName, avatarUrl: row.avatarUrl, avatarStyle: row.avatarStyle });
      out.set(row.tableId, entry);
    }
    return out;
  }

  async joinMany(userId: string, tableIds: string[]) {
    const joined: string[] = [];
    const needsPayment: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    for (const tableId of [...new Set(tableIds)].slice(0, 20)) {
      const table = await this.tables.findOne({ where: { id: tableId } });
      if (!table) { skipped.push({ id: tableId, reason: 'Not found' }); continue; }
      if (table.type === 'paid') { needsPayment.push(tableId); continue; }
      try {
        await this.registerFree(tableId, userId);
        joined.push(tableId);
      } catch (error) {
        skipped.push({ id: tableId, reason: error instanceof Error ? error.message : 'Couldn’t join' });
      }
    }
    return { joined, needsPayment, skipped };
  }

  private async present(tables: CompetitionTable[], knownCounts?: Array<{ tableId: string; n: number }>) {
    const ids = tables.map((table) => table.id);
    const [counts, funding] = await Promise.all([
      knownCounts ?? (ids.length ? this.repo.entrantCounts(ids) : []),
      ids.length ? this.repo.fundedTotals(ids) : [],
    ]);
    const byTable = new Map(counts.map((row) => [row.tableId, row.n]));
    const fundedByTable = new Map(funding.map((row) => [row.tableId, row.amount]));
    return tables.map(({ creator, ...table }) => ({
      ...table,
      creator: creator ? { id: creator.id, displayName: creator.displayName } : null,
      entrantCount: byTable.get(table.id) ?? 0,
      fundedPrizeKobo: fundedByTable.get(table.id) ?? 0,
    }));
  }

  async mine(userId: string) {
    return this.repo.mine(userId);
  }

  async eligible(userId: string, activity?: string) {
    if (activity !== 'run' && activity !== 'walk' && activity !== 'cycle') throw new BadRequestException('Choose run, walk or cycle');
    return this.repo.liveFor(userId, activity);
  }

  async create(creatorId: string, input: CreateTableDto) {
    const sponsored = Boolean(input.fundedFree || input.guaranteedPrizeKobo);
    const challengeType = input.challengeType ?? 'RUN';
    const scoring = scoringColumns({ ...input, challengeType, scoringMethod: input.scoringMethod ?? ACTIVITY_RULES[challengeType].options[0].method }, sponsored);
    const format = input.format ?? (input.visibility === 'private' ? 'invite' : 'open');
    if (format === 'head_to_head' && input.capacity !== 2) throw new BadRequestException('Head-to-head is for exactly two people');
    if (format === 'head_to_head' && (input.inviteClubMembers || new Set([...(input.inviteEmails ?? []).map((email) => email.trim().toLowerCase()), ...(input.invitePhones ?? [])]).size > 1)) {
      throw new BadRequestException('Head-to-head is you and one opponent. Invite one person.');
    }
    const publish = input.publish ?? 'now';
    if ((input.clubPrizes || publish === 'schedule' || input.series) && !input.communityId) {
      throw new BadRequestException('Prizes, scheduling and series are for club competitions. Host it from your club’s page.');
    }
    if ((publish !== 'now' || input.series) && sponsored) throw new BadRequestException('Cash-prize competitions open once they’re funded, so they can’t be drafted, scheduled or repeated');
    if (input.communityId) await assertClubCanHost(this.dataSource.manager, input.communityId, creatorId, { adding: publish !== 'draft' });
    if (input.inviteClubMembers && !input.communityId) throw new BadRequestException('Choose a club before inviting its members');
    if (input.inviteClubMembers && input.communityId) await this.assertClubFits(input.communityId, input.format === 'head_to_head' ? 2 : input.capacity);
    const prizeSplitBps = this.prizeSplit(input.prizeSplitBps, input.capacity);
    if (input.guaranteedPrizeKobo !== undefined && (!Number.isSafeInteger(input.guaranteedPrizeKobo) || input.guaranteedPrizeKobo < 1_000_000)) {
      throw new BadRequestException('Fixed contributions must be at least ₦10,000');
    }
    if (input.fundingDestination === 'CHARITY' && (!input.fundedFree || !input.guaranteedPrizeKobo || !input.charityName?.trim())) {
      throw new BadRequestException('Charity funding requires a fixed creator-funded amount and charity name');
    }
    if (input.charityName && input.fundingDestination !== 'CHARITY') throw new BadRequestException('Choose charity as the funding destination');
    if (input.guaranteedPrizeKobo && input.fundingDestination !== 'CHARITY') {
      this.assertAwardAmounts(calculatePrizeBreakdown(input.guaranteedPrizeKobo, 1500, 0).winnerAmountKobo, prizeSplitBps);
    }
    if (input.openEnded && sponsored) throw new BadRequestException('Prize competitions need an end date so winners can be paid');
    const prizes = input.clubPrizes ?? null;
    if (prizes) {
      if (!sponsored) throw new BadRequestException('Club prizes are for funded and paid competitions. Choose funded or paid to add them.');
      if (input.openEnded) throw new BadRequestException('Prize competitions need an end date so winners can be decided');
      checkClubPrizes(prizes, input.capacity, input.communityId!, this.cloudinary);
    }
    if (input.series && input.openEnded) throw new BadRequestException('A series needs an end date for each edition');
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const scoringClosesAt = input.openEnded ? null : input.scoringClosesAt
      ? new Date(input.scoringClosesAt)
      : new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const entryClosesAt = input.openEnded ? null : input.entryClosesAt ? new Date(input.entryClosesAt) : scoringClosesAt;
    if (scoringClosesAt && entryClosesAt && (entryClosesAt > scoringClosesAt || startsAt > scoringClosesAt)) {
      throw new ConflictException('Entry and start times must be before scoring closes');
    }
    const publishAt = publish === 'schedule' ? new Date(input.publishAt ?? '') : null;
    if (publishAt && (Number.isNaN(publishAt.getTime()) || publishAt <= new Date() || (scoringClosesAt && publishAt >= scoringClosesAt))) {
      throw new BadRequestException('Schedule it for a time in the future, before it ends');
    }
    const table = this.tables.create({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      ...placeColumns(input),
      code: randomBytes(4).toString('hex').toUpperCase(),
      creatorId,
      type: sponsored ? 'sponsored' : 'free',
      entryFeeKobo: 0,
      status: publish === 'draft' ? 'DRAFT' : publish === 'schedule' ? 'SCHEDULED' : input.guaranteedPrizeKobo ? 'PENDING_FUNDING' : 'OPEN_FOR_ENTRY',
      publishAt,
      ...(prizes ? prizeColumns(prizes) : {}),
      eligibleCountries: [...new Set(input.eligibleCountries ?? [])],
      autoEnrolClub: Boolean(input.inviteClubMembers && input.communityId),
      enrolAudience: input.inviteClubMembers && input.communityId && (await this.isOfficialClub(input.communityId)) ? input.enrolAudience ?? 'all' : 'all',
      startsAt,
      entryClosesAt,
      scoringClosesAt,
      capacity: input.capacity,
      distanceCapMetres: input.distanceCapMetres ?? null,
      ...scoring,
      format,
      ...reminderConfig(input.reminderTime, input.reminderTimeZone),
      communityId: input.communityId ?? null,
      platformFeeBps: sponsored ? 1500 : 3000,
      creatorCommissionBps: 0,
      guaranteedPrizeKobo: input.guaranteedPrizeKobo ?? null,
      fundingDestination: input.fundingDestination ?? 'WINNERS',
      charityName: input.fundingDestination === 'CHARITY' ? input.charityName!.trim() : null,
      prizeSplitBps,
      visibility: format === 'open' ? 'public' : 'private',
    });
    return this.saveWithInvites(table, input, async (manager, created) => {
      if (prizes) await savePrizes(manager, created.id, prizes.prizes);
      if (input.series && created.communityId) {
        const template = await templateOf(manager, created);
        const seriesId = await this.repo.createSeries(manager, {
          clubId: created.communityId, title: created.title, cadence: input.series.cadence, template,
          autoPublish: input.series.autoPublish, nextStartsAt: nextStart(created.startsAt!, input.series.cadence), createdByUserId: creatorId,
        });
        created.seriesId = seriesId;
        created.edition = 1;
        await manager.update(CompetitionTable, { id: created.id }, { seriesId, edition: 1 });
      }
      if (created.status === 'OPEN_FOR_ENTRY') await announceCompetition(manager, created);
    });
  }

  async createPaidDraft(creatorId: string, input: CreateCreatorPaidChallengeDto) {
    await this.assertCommunityManager(creatorId, input.communityId);
    if (input.inviteClubMembers && !input.communityId) throw new BadRequestException('Choose a club before inviting its members');
    const { columns, clubPrizes } = await this.paidColumns(creatorId, input);
    return this.saveWithInvites(this.tables.create({
      creatorId,
      code: randomBytes(4).toString('hex').toUpperCase(),
      ...columns,
    }), input, async (manager, created) => {
      if (clubPrizes) await savePrizes(manager, created.id, clubPrizes.prizes);
    });
  }

  async convertToPaid(tableId: string, userId: string, input: CreateCreatorPaidChallengeDto) {
    const { columns, clubPrizes } = await this.paidColumns(userId, input);
    return this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(CompetitionTable, { where: { id: tableId }, lock: { mode: 'pessimistic_write' } });
      if (!table || table.deletedAt) throw new NotFoundException('Competition not found');
      if (table.creatorId !== userId) throw new ForbiddenException('Only the person who created this competition can make it paid');
      if (table.type !== 'free') throw new ConflictException('Only free competitions can be made paid');
      if (![...UNPUBLISHED, 'OPEN_FOR_ENTRY', 'LIVE'].includes(table.status) || (table.scoringClosesAt && table.scoringClosesAt <= new Date())) {
        throw new ConflictException('This competition has finished, so it can’t be made paid');
      }
      if (table.seriesId) throw new ConflictException('Competitions in a series stay free. Create a separate paid one.');
      if ((input.communityId ?? null) !== table.communityId) throw new BadRequestException('A paid version stays with the same club as the original');
      if ((await this.repo.otherEntrants(manager, tableId, userId)).length) {
        throw new ConflictException('People have already joined this for free, so it can’t become paid. Create a new paid competition instead.');
      }
      await this.repo.declinePendingInvitations(manager, tableId);
      Object.assign(table, columns, { publishAt: null, autoEnrolClub: false, enrolAudience: 'all', eligibleCountries: [], visibility: 'public' });
      const saved = await manager.save(table);
      if (clubPrizes) await savePrizes(manager, saved.id, clubPrizes.prizes);
      return saved;
    });
  }

  private async paidColumns(creatorId: string, input: CreateCreatorPaidChallengeDto) {
    const scoring = scoringColumns(input, true);
    const clubPrizes = input.clubPrizes ?? null;
    if (clubPrizes) {
      if (!input.communityId) throw new BadRequestException('Club prizes are for club competitions. Host it from your club’s page.');
      checkClubPrizes(clubPrizes, input.capacity, input.communityId, this.cloudinary);
    }
    let guaranteedPrizeKobo: number;
    try { guaranteedPrizeKobo = paidPrizePot(input.capacity, input.entryFeeKobo); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid paid prize pot'); }
    const prizeSplitBps = this.prizeSplit(input.prizeSplitBps, input.capacity);
    this.assertAwardAmounts(guaranteedPrizeKobo - Math.floor(guaranteedPrizeKobo * 0.35), prizeSplitBps);
    if (!(await this.repo.activeCreatorId(creatorId))) throw new ForbiddenException('An active creator account is required for paid competitions');
    await this.aml.assertVerified(creatorId);
    const minimumEntrants = await this.aml.assertPaidChallengeLimits(creatorId, {
      entryFeeKobo: input.entryFeeKobo, potKobo: guaranteedPrizeKobo, capacity: input.capacity, minimumEntrants: input.minimumEntrants,
    });
    const startsAt = new Date(input.startsAt);
    const entryClosesAt = new Date(input.entryClosesAt ?? input.scoringClosesAt);
    const scoringClosesAt = new Date(input.scoringClosesAt);
    if (minimumEntrants > input.capacity || entryClosesAt > scoringClosesAt || startsAt > scoringClosesAt) {
      throw new ConflictException('Competition dates or entrant limits are invalid');
    }
    return {
      clubPrizes,
      columns: {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        ...placeColumns(input),
        type: 'paid',
        status: 'PENDING_APPROVAL',
        entryFeeKobo: input.entryFeeKobo,
        guaranteedPrizeKobo,
        minimumEntrants,
        capacity: input.capacity,
        startsAt,
        entryClosesAt,
        scoringClosesAt,
        distanceCapMetres: null,
        ...scoring,
        format: input.capacity === 2 ? 'head_to_head' as const : 'open' as const,
        ...reminderConfig(input.reminderTime, input.reminderTimeZone),
        communityId: input.communityId ?? null,
        platformFeeBps: 3500,
        creatorCommissionBps: 500,
        prizeSplitBps,
        ...(clubPrizes ? prizeColumns(clubPrizes) : {}),
      },
    };
  }

  async registerFree(tableId: string, userId: string) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const table = await manager.findOne(CompetitionTable, {
          where: { id: tableId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!table || !['free', 'sponsored'].includes(table.type)) throw new NotFoundException('Free-entry competition not found');
        if (table.status !== 'OPEN_FOR_ENTRY' || (table.entryClosesAt && table.entryClosesAt <= new Date())) {
          throw new ConflictException('This competition is not open for entry');
        }
        if (table.visibility === 'private' && table.creatorId !== userId) {
          if (!(await this.repo.invitedOrMember(manager, tableId, userId, table.communityId))) throw new ForbiddenException('This is a private competition. Ask the host to invite you.');
        }
        await assertCountryEligible(manager, table, userId);
        if (table.capacity) {
          const count = await manager.count(TableRegistration, { where: { tableId } });
          if (count >= table.capacity) throw new ConflictException('This competition is full');
        }
        const registration = await manager.save(TableRegistration, manager.create(TableRegistration, { tableId, userId }));
        await creditActivities(manager, { tableId, userId });
        await this.repo.acceptPendingInvitation(manager, tableId, userId);
        return registration;
      });
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('You already joined this competition');
      }
      throw error;
    }
  }

  async leave(tableId: string, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(CompetitionTable, { where: { id: tableId }, lock: { mode: 'pessimistic_write' } });
      if (!table) throw new NotFoundException('Competition not found');
      const registration = await manager.findOne(TableRegistration, { where: { tableId, userId } });
      if (!registration) throw new NotFoundException('You’re not in this competition');
      if (table.type === 'paid') throw new ForbiddenException('Paid entries can’t be withdrawn. Contact Jump support if something’s wrong.');
      if (table.status === 'SETTLED' || (table.scoringClosesAt && table.scoringClosesAt <= new Date())) {
        throw new ConflictException('This competition has finished, so you can’t leave it now.');
      }
      await manager.delete(TableRegistration, { id: registration.id });
      return { left: true };
    });
  }

  async update(tableId: string, userId: string, input: PlaceFieldsDto & { title?: string; description?: string | null; startsAt?: string; scoringClosesAt?: string | null; endNow?: boolean }) {
    return this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(CompetitionTable, { where: { id: tableId }, lock: { mode: 'pessimistic_write' } });
      if (!table) throw new NotFoundException('Competition not found');
      if (!(await canManageTable(manager, table, userId))) throw new ForbiddenException('Only the host or the club’s managers can edit this competition');
      if (table.status === 'SETTLED' || table.status === 'CANCELLED') throw new ConflictException('This competition is finished and can’t be changed');
      const now = new Date();
      if (input.title !== undefined) {
        const title = input.title.trim();
        if (title.length < 3) throw new BadRequestException('Give it a name of at least 3 characters');
        table.title = title;
      }
      if (input.description !== undefined) table.description = input.description?.trim() || null;
      if (changesPlace(input)) Object.assign(table, placeColumns(input));
      const datesChanging = input.startsAt !== undefined || input.scoringClosesAt !== undefined || input.endNow;
      if (datesChanging && table.type !== 'free') throw new ConflictException('Prize competitions keep the dates they were funded or approved with');
      if (input.startsAt !== undefined) {
        if (table.startsAt && table.startsAt <= now) throw new ConflictException('It has already started, so the start can’t move');
        const startsAt = new Date(input.startsAt);
        if (startsAt < new Date(now.getTime() - 60_000)) throw new BadRequestException('The start can’t be in the past');
        table.startsAt = startsAt;
      }
      if (input.endNow) {
        table.scoringClosesAt = now;
        table.entryClosesAt = now;
      } else if (input.scoringClosesAt !== undefined) {
        if (table.scoringClosesAt && table.scoringClosesAt <= now) throw new ConflictException('It has already ended');
        if (input.scoringClosesAt === null) {
          table.scoringClosesAt = null;
          table.entryClosesAt = null;
        } else {
          const end = new Date(input.scoringClosesAt);
          if (end <= now) throw new BadRequestException('The end has to be in the future. Use End now to finish it today.');
          if (table.startsAt && end <= table.startsAt) throw new BadRequestException('The end has to be after the start');
          table.entryClosesAt = !table.entryClosesAt || table.entryClosesAt.getTime() === table.scoringClosesAt?.getTime() ? end : table.entryClosesAt > end ? end : table.entryClosesAt;
          table.scoringClosesAt = end;
        }
      }
      await manager.save(table);
      if (datesChanging) await retotal(manager, [table.id]);
      return table;
    });
  }

  async deletionBlocker(table: CompetitionTable, manager: EntityManager = this.dataSource.manager): Promise<string | null> {
    if (table.type === 'free') return null;
    const row = await this.repo.moneyFlags(manager, table.id, table.creatorId);
    if (row.paid || row.awarded || (table.type === 'paid' && row.entered)) {
      return 'Money has been paid into this competition, so it can’t be deleted. You can end or archive it instead, or contact Jump support.';
    }
    return null;
  }

  async shared(tableId: string, viewerId: string, channel: string) {
    const table = await this.tables.findOne({ where: { id: tableId } });
    if (!table || table.deletedAt) throw new NotFoundException('Competition not found');
    await recordShare(this.dataSource.manager, { clubId: table.communityId, tableId: table.id, viewerId, channel });
    return { ok: true };
  }

  async deletionCheck(tableId: string, userId: string) {
    const table = await this.tables.findOne({ where: { id: tableId } });
    if (!table || table.deletedAt) throw new NotFoundException('Competition not found');
    if (table.creatorId !== userId && !(await canManageTable(this.dataSource.manager, table, userId))) throw new ForbiddenException('Only the host can delete this competition');
    const reason = await this.deletionBlocker(table);
    return { canDelete: !reason, reason };
  }

  async remove(tableId: string, userId: string) {
    const entrants = await this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(CompetitionTable, { where: { id: tableId }, lock: { mode: 'pessimistic_write' } });
      if (!table || table.deletedAt) throw new NotFoundException('Competition not found');
      if (table.creatorId !== userId && !(await canManageTable(manager, table, userId))) throw new ForbiddenException('Only the host can delete this competition');
      const reason = await this.deletionBlocker(table, manager);
      if (reason) throw new ConflictException(reason);
      const others = await this.repo.otherEntrants(manager, tableId, userId);
      table.status = 'CANCELLED';
      table.deletedAt = new Date();
      await manager.save(table);
      await this.repo.declinePendingInvitations(manager, tableId);
      return { title: table.title, others };
    });
    if (entrants.others.length) await this.repo.notifyDeleted(entrants.others, entrants.title).catch(() => undefined);
    return { deleted: true };
  }

  async setBanner(tableId: string, userId: string, file: { buffer: Buffer; mimetype: string } | undefined) {
    const table = await this.editableTable(tableId, userId);
    if (!file) throw new BadRequestException('Choose an image to upload');
    if (!AVATAR_TYPES.includes(file.mimetype)) throw new BadRequestException('Use a JPG, PNG, WebP or HEIC image');
    table.bannerUrl = await this.cloudinary.uploadCompetitionBanner(table.id, file);
    await this.tables.save(table);
    return { bannerUrl: table.bannerUrl };
  }

  async removeBanner(tableId: string, userId: string) {
    const table = await this.editableTable(tableId, userId);
    if (table.bannerUrl) await this.cloudinary.removeCompetitionBanner(table.id).catch(() => undefined);
    table.bannerUrl = null;
    await this.tables.save(table);
    return { bannerUrl: null };
  }

  private async editableTable(tableId: string, userId: string) {
    const table = await this.tables.findOne({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Competition not found');
    if (!(await canManageTable(this.dataSource.manager, table, userId))) throw new ForbiddenException('Only the host or the club’s managers can edit this competition');
    if (table.status === 'SETTLED' || table.status === 'CANCELLED') throw new ConflictException('This competition is finished and can’t be changed');
    return table;
  }

  async archive(tableId: string, userId: string, archived: boolean) {
    const table = await this.tables.findOne({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Competition not found');
    if (!(await canManageTable(this.dataSource.manager, table, userId))) throw new ForbiddenException('Only the host or the club’s managers can archive this competition');
    if (archived) {
      const over = table.status === 'SETTLED' || (table.scoringClosesAt !== null && table.scoringClosesAt <= new Date());
      const others = await this.registrations.count({ where: { tableId } }) > 1;
      if (!over && others) throw new ConflictException('It’s still running. End it first, then archive it.');
      if (['paid', 'sponsored'].includes(table.type) && table.status !== 'SETTLED' && others) throw new ConflictException('Prizes are still being settled. Archive it once the result is final.');
    }
    await this.tables.update({ id: tableId }, { archivedAt: archived ? new Date() : null });
    return { archived };
  }

  async discard(tableId: string, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(CompetitionTable, { where: { id: tableId }, lock: { mode: 'pessimistic_write' } });
      if (!table) throw new NotFoundException('Competition not found');
      if (!(await canManageTable(manager, table, userId))) throw new ForbiddenException('Only the host or the club’s managers can discard this draft');
      if (!['PENDING_FUNDING', 'PENDING_APPROVAL', ...UNPUBLISHED].includes(table.status)) throw new ConflictException('Only drafts can be discarded. This one is already open.');
      if (await this.repo.hasSucceededPayment(manager, tableId)) throw new ConflictException('Money has already been paid into this draft. Contact Jump support to close it.');
      table.status = 'CANCELLED';
      await manager.save(table);
      return { discarded: true };
    });
  }

  async registration(tableId: string, userId: string) {
    const joined = await this.registrations.exist({ where: { tableId, userId } });
    return { joined };
  }

  async standings(tableId: string) {
    const table = await this.tables.findOne({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Competition not found');
    return this.repo.standings(tableId);
  }

  async getByCode(code: string, viewerId?: string | null, visitor?: string | null) {
    const table = await this.tables.findOne({
      where: { code: code.toUpperCase() },
      relations: { creator: true },
    });
    if (!table || table.deletedAt) throw new NotFoundException('Competition not found');
    const manageable = Boolean(viewerId && await canManageTable(this.dataSource.manager, table, viewerId));
    if (UNPUBLISHED.includes(table.status) && !manageable) throw new NotFoundException('Competition not found');
    if (!manageable) void recordView(this.dataSource.manager, { clubId: table.communityId, tableId: table.id, viewerId, anonKey: visitor });
    const [presented] = await this.present([table]);
    const productPrizes = table.prizeFulfilment ? await this.clubPrizes(table, manageable) : null;
    const [club, host] = await Promise.all([
      table.communityId ? this.repo.club(table.communityId, table.seriesId) : undefined,
      this.repo.host(table.creatorId),
    ]);
    return { ...presented, productPrizes, club: club ?? null, canManage: manageable, creator: presented.creator ? { ...presented.creator, username: host?.username ?? null, avatarUrl: host?.avatarUrl ?? null, avatarStyle: host?.avatarStyle ?? 'neutral', verified: host?.verified ?? false } : null };
  }

  private async clubPrizes(table: CompetitionTable, manageable: boolean) {
    const [prizes, winners] = await Promise.all([
      this.repo.prizes(table.id, manageable),
      table.prizesFinalizedAt ? this.repo.prizeWinners(table.id) : [],
    ]);
    return {
      prizes,
      winners,
      selection: table.prizeSelection,
      deliveryCountries: table.prizeDeliveryCountries,
      fulfilment: table.prizeFulfilment,
      shipping: table.prizeShipping,
      shippingNote: table.prizeShippingNote,
      eligibilityNote: table.prizeEligibilityNote,
      claimDays: table.prizeClaimDays,
    };
  }

  async result(tableId: string) {
    const result = await this.repo.latestResult(tableId);
    if (!result) throw new NotFoundException('Final result is not available');
    return result;
  }

  private prizeSplit(split: number[] | undefined, capacity: number | null) {
    try { return assertPrizeSplit(split, capacity); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid prize shares'); }
  }

  private assertAwardAmounts(amountKobo: number, split: number[]) {
    try { allocatePrizes(amountKobo, split); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Prize pot is too small'); }
  }

  private async saveWithInvites(table: CompetitionTable, input: Invites, afterSave?: (manager: EntityManager, created: CompetitionTable) => Promise<void>) {
    const deferred = UNPUBLISHED.includes(table.status);
    if (deferred && (input.inviteEmails?.length || input.invitePhones?.length)) throw new BadRequestException('Invite people by email or phone once it’s published');
    if (!deferred && table.status !== 'OPEN_FOR_ENTRY' && (input.inviteClubMembers || input.inviteEmails?.length || input.invitePhones?.length)) {
      throw new BadRequestException('Fund or approve this draft before inviting runners');
    }
    if (deferred) input = { ...input, inviteClubMembers: undefined };
    const emails = [...new Set((input.inviteEmails ?? []).map((value) => value.trim().toLowerCase()))];
    const phones = [...new Set(input.invitePhones ?? [])];
    const known = await this.repo.verifiedEmails(emails);
    const saved = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(CompetitionTable, table);
      await manager.save(TableRegistration, manager.create(TableRegistration, { tableId: created.id, userId: created.creatorId }));
      await creditActivities(manager, { tableId: created.id, userId: created.creatorId });
      await this.insertInvitations(manager, created, input, emails, phones);
      if (afterSave) await afterSave(manager, created);
      return created;
    });
    const url = `${this.config.getOrThrow<string>('WEB_ORIGIN')}/competitions/${saved.code}`;
    for (const email of emails.filter((address) => !known.has(address))) this.mail.sendInBackground(challengeInviteEmail({ address: email }, saved.title, url));
    return saved;
  }

  private async insertInvitations(manager: EntityManager, table: CompetitionTable, input: Invites, emails: string[], phones: string[]) {
    if (input.inviteClubMembers && input.communityId && table.type !== 'paid') {
      await enrolClubMembers(manager, { tableId: table.id });
    } else if (input.inviteClubMembers && input.communityId) {
      await this.repo.inviteClubMembers(manager, table.id, input.communityId, table.creatorId);
    }
    if (emails.length) await this.repo.inviteEmails(manager, table.id, emails);
    if (phones.length) await this.repo.invitePhones(manager, table.id, phones);
    if ((input.inviteClubMembers && table.type === 'paid') || emails.length) await this.repo.notifyInvitees(manager, table);
  }

  async invitations(tableId: string, creatorId: string) {
    const table = await this.tables.findOne({ where: { id: tableId, creatorId } });
    if (!table) throw new NotFoundException('Competition not found');
    return this.repo.invitations(tableId);
  }

  async inviteRunner(tableId: string, creatorId: string, username: string) {
    const invitation = await this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(CompetitionTable, { where: { id: tableId, creatorId } });
      if (!table) throw new NotFoundException('Competition not found or you are not its host');
      if (table.status !== 'OPEN_FOR_ENTRY' || (table.entryClosesAt && table.entryClosesAt <= new Date())) {
        throw new ConflictException('Invitations are closed for this competition');
      }
      const runner = await this.repo.runnerByUsername(manager, username);
      if (!runner) throw new NotFoundException('Runner not found');
      if (runner.userId === creatorId) throw new BadRequestException('You are already hosting this competition');
      if (table.format === 'head_to_head') {
        if (await this.repo.opponentAlreadyInvited(manager, tableId, runner.userId)) throw new ConflictException('You’ve already invited your opponent. Head-to-head is just the two of you.');
      }
      if (await manager.exists(TableRegistration, { where: { tableId, userId: runner.userId } })) throw new ConflictException('This runner has already joined');
      const created = await this.repo.createInvitation(manager, tableId, runner.userId);
      const existing = created ? undefined : await this.repo.invitationFor(manager, tableId, runner.userId);
      if (existing && existing.status !== 'PENDING') throw new ConflictException('This runner already answered the invitation');
      const invitationId = created ?? existing?.id;
      if (!invitationId) throw new ConflictException('This runner was already invited');
      const link = `${this.config.getOrThrow<string>('WEB_ORIGIN')}/competitions/${table.code}`;
      const body = `Join ${table.title} on Jump: ${link}`;
      const sent = await this.repo.sendInvitationMessage(manager, { senderId: creatorId, recipientId: runner.userId, body, invitationId });
      if (!sent) throw new ConflictException('This runner was already invited in messages');
      await this.repo.notifyInvited(manager, runner.userId, body, `/competitions/${table.code}`);
      return { runner, table, link };
    });
    return { invited: true, username: invitation.runner.username };
  }

  async respondToInvitation(invitationId: string, userId: string, decision: 'ACCEPT' | 'DECLINE') {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const invite = await this.repo.lockInvitation(manager, invitationId, userId);
        if (!invite) throw new NotFoundException('Invitation not found');
        if (invite.status !== 'PENDING') throw new ConflictException('This invitation has already been answered');
        if (decision === 'DECLINE') {
          if (await manager.exists(TableRegistration, { where: { tableId: invite.tableId, userId } })) {
            throw new ConflictException('You have already joined this competition');
          }
          if (await this.repo.entryPaymentInProgress(manager, invite.tableId, userId)) throw new ConflictException('Your entry payment is still in progress; check its status before declining');
          await this.repo.answerInvitation(manager, invite.id, 'DECLINED');
          return { status: 'DECLINED', joined: false };
        }
        const table = await manager.findOne(CompetitionTable, { where: { id: invite.tableId }, lock: { mode: 'pessimistic_write' } });
        if (!table) throw new NotFoundException('Competition not found');
        if (table.status !== 'OPEN_FOR_ENTRY' || (table.entryClosesAt && table.entryClosesAt <= new Date())) {
          throw new ConflictException('This competition is not open for entry');
        }
        if (await manager.exists(TableRegistration, { where: { tableId: table.id, userId } })) {
          await this.repo.answerInvitation(manager, invite.id, 'ACCEPTED');
          return { status: 'ACCEPTED', joined: true, tableId: table.id, code: table.code, type: table.type };
        }
        await assertCountryEligible(manager, table, userId);
        if (table.type === 'paid') {
          if (table.capacity !== null && await this.repo.entrantsOtherThan(manager, table.id, table.creatorId) >= table.capacity) throw new ConflictException('This competition is full');
          return { status: 'PENDING', joined: false, paymentRequired: true, tableId: table.id, code: table.code, type: table.type };
        }
        if (table.capacity !== null) {
          const count = await manager.count(TableRegistration, { where: { tableId: table.id } });
          if (count >= table.capacity) throw new ConflictException('This competition is full');
        }
        await manager.save(TableRegistration, manager.create(TableRegistration, { tableId: table.id, userId }));
        await this.repo.answerInvitation(manager, invite.id, 'ACCEPTED');
        await creditActivities(manager, { tableId: table.id, userId });
        return { status: 'ACCEPTED', joined: true, tableId: table.id, code: table.code, type: table.type, contributionOptional: table.type === 'sponsored' && table.guaranteedPrizeKobo === null };
      });
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('You already joined this competition');
      }
      throw error;
    }
  }

  private async assertClubFits(clubId: string, capacity: number) {
    const members = await this.repo.clubMemberCount(clubId);
    if (members > capacity) throw new BadRequestException(`The club has ${members} members. Set the maximum to at least ${members} so everyone gets a place.`);
  }

  private async isOfficialClub(clubId: string) {
    const slug = this.config.get<string>('COMMUNITY_CLUB_SLUG') ?? 'jump-community-club';
    return ((await this.dataSource.query(`SELECT 1 FROM "clubs" WHERE "id" = $1 AND "slug" = $2`, [clubId, slug])) as unknown[]).length > 0;
  }

  private async assertCommunityManager(userId: string, communityId?: string) {
    if (!communityId) return;
    if (!(await this.repo.isClubManager(communityId, userId))) throw new ForbiddenException('Community owner or admin access required');
  }
}

