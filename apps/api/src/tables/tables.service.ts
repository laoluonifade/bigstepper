import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { DataSource, EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { CompetitionTable } from './competition-table.entity';
import { CreateTableDto } from './dto/create-table.dto';
import { TableRegistration } from './table-registration.entity';
import { assertScoringConfiguration } from './challenge-types';
import { CreateCreatorPaidChallengeDto } from '../admin/paid-table.dto';
import { allocatePrizes, assertPrizeSplit } from './prize-split';
import { paidPrizePot } from './paid-prize';
import { MailService } from '../mail/mail.service';
import { challengeInviteEmail } from '../mail/templates';
import { ConfigService } from '@nestjs/config';
import { calculatePrizeBreakdown } from '../payments/financial-policy';
import { reminderConfig } from './reminder-config';

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
  ) {}

  async list(sort = 'popular', type = 'all', activity = 'all') {
    if (!['popular', 'newest'].includes(sort) || !['all', 'free', 'sponsored', 'paid'].includes(type) ||
        !['all', 'WALK', 'RUN', 'DISTANCE', 'STEP', 'TIMED', 'CYCLING'].includes(activity)) {
      throw new BadRequestException('Invalid competition filter');
    }
    const ranked = (await this.dataSource.query(
      `SELECT t."id", COUNT(r."id")::integer AS n
       FROM "competition_tables" t LEFT JOIN "table_registrations" r ON r."tableId"=t."id"
       WHERE t."status"='OPEN_FOR_ENTRY' AND ($1='all' OR t."type"=$1) AND ($2='all' OR t."challengeType"=$2)
       GROUP BY t."id" ORDER BY ${sort === 'newest' ? 't."createdAt" DESC' : 'n DESC, t."createdAt" DESC'} LIMIT 50`,
      [type, activity],
    )) as Array<{ id: string; n: number }>;
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

  /**
   * Public shape of a challenge: the creator is reduced to id + display name (the relation is the full
   * user row, email included, which must never leave the API), plus how many runners have joined.
   */
  private async present(tables: CompetitionTable[], knownCounts?: Array<{ tableId: string; n: number }>) {
    const counts = knownCounts ?? (tables.length
      ? ((await this.dataSource.query(
          `SELECT "tableId", count(*)::int AS n FROM "table_registrations" WHERE "tableId" = ANY($1::uuid[]) GROUP BY "tableId"`,
          [tables.map((table) => table.id)],
        )) as Array<{ tableId: string; n: number }>)
      : []);
    const byTable = new Map(counts.map((row) => [row.tableId, row.n]));
    const funding = tables.length ? (await this.dataSource.query(
      `SELECT "tableId", COALESCE(SUM("amountKobo"),0)::bigint AS amount
       FROM "payment_intents" WHERE "tableId" = ANY($1::uuid[]) AND "purpose"='SPONSOR_FUNDING' AND "status"='SUCCEEDED'
       GROUP BY "tableId"`, [tables.map((table) => table.id)],
    )) as Array<{ tableId: string; amount: string }> : [];
    const fundedByTable = new Map(funding.map((row) => [row.tableId, Number(row.amount)]));
    return tables.map(({ creator, ...table }) => ({
      ...table,
      creator: creator ? { id: creator.id, displayName: creator.displayName } : null,
      entrantCount: byTable.get(table.id) ?? 0,
      fundedPrizeKobo: fundedByTable.get(table.id) ?? 0,
    }));
  }

  async mine(userId: string) {
    const rows = await this.tables.query(
      `SELECT t."id", t."code", t."title", t."type", t."challengeType", t."status", t."scoringClosesAt",
              (t."creatorId" = $1) AS "hosting", (r."id" IS NOT NULL) AS "joined"
       FROM "competition_tables" t
       LEFT JOIN "table_registrations" r ON r."tableId" = t."id" AND r."userId" = $1
       WHERE t."creatorId" = $1 OR r."id" IS NOT NULL
       ORDER BY CASE WHEN t."creatorId"=$1 AND t."status"='PENDING_FUNDING' THEN 0 ELSE 1 END,
                COALESCE(r."joinedAt", t."createdAt") DESC
       LIMIT 100`,
      [userId],
    );
    return rows as Array<{ id: string; code: string; title: string; type: string; challengeType: string; status: string; scoringClosesAt: string | null; hosting: boolean; joined: boolean }>;
  }

  async eligible(userId: string, activity?: string) {
    if (activity !== 'run' && activity !== 'walk' && activity !== 'cycle') throw new BadRequestException('Choose run, walk or cycle');
    return this.dataSource.query(
      `SELECT t."id", t."code", t."title", t."challengeType", t."type"
       FROM "table_registrations" r JOIN "competition_tables" t ON t."id"=r."tableId"
       WHERE r."userId"=$1 AND t."status" IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED')
         AND COALESCE(t."startsAt", '-infinity'::timestamptz) <= now()
         AND COALESCE(t."scoringClosesAt", 'infinity'::timestamptz) > now()
         AND (( $2='CYCLE' AND t."challengeType"='CYCLING') OR
              ( $2 IN ('WALK','RUN') AND (t."challengeType" IN ('DISTANCE','STEP','TIMED') OR t."challengeType"=$2)))
       ORDER BY t."scoringClosesAt" ASC LIMIT 50`,
      [userId, activity.toUpperCase()],
    );
  }

  async create(creatorId: string, input: CreateTableDto) {
    const sponsored = Boolean(input.fundedFree || input.guaranteedPrizeKobo);
    const challengeType = input.challengeType ?? 'RUN';
    if (challengeType === 'CYCLING' && sponsored) throw new BadRequestException('Cycling competitions are free only until bicycle verification is stronger');
    const scoringMethod = input.scoringMethod ?? (challengeType === 'WALK' || challengeType === 'STEP' ? 'MOST_STEPS' : challengeType === 'TIMED' ? 'FASTEST_TIME' : 'FARTHEST_DISTANCE');
    this.validateScoring(challengeType, scoringMethod, input.targetDistanceMetres);
    await this.assertCommunityManager(creatorId, input.communityId);
    if (input.inviteClubMembers && !input.communityId) throw new BadRequestException('Choose a club before inviting its members');
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
      description: input.description?.trim() || null,
      code: randomBytes(4).toString('hex').toUpperCase(),
      creatorId,
      type: sponsored ? 'sponsored' : 'free',
      entryFeeKobo: 0,
      status: input.guaranteedPrizeKobo ? 'PENDING_FUNDING' : 'OPEN_FOR_ENTRY',
      startsAt,
      entryClosesAt,
      scoringClosesAt,
      capacity: input.capacity,
      distanceCapMetres: input.distanceCapMetres ?? null,
      challengeType,
      scoringMethod,
      targetDistanceMetres: input.targetDistanceMetres ?? null,
      ...reminderConfig(input.reminderTime, input.reminderTimeZone),
      communityId: input.communityId ?? null,
      platformFeeBps: sponsored ? 1500 : 3000,
      creatorCommissionBps: 0,
      guaranteedPrizeKobo: input.guaranteedPrizeKobo ?? null,
      fundingDestination: input.fundingDestination ?? 'WINNERS',
      charityName: input.fundingDestination === 'CHARITY' ? input.charityName!.trim() : null,
      prizeSplitBps,
    });
    return this.saveWithInvites(table, input);
  }

  async createPaidDraft(creatorId: string, input: CreateCreatorPaidChallengeDto) {
    if (input.challengeType === 'CYCLING') throw new BadRequestException('Cycling competitions cannot have cash prizes yet');
    this.validateScoring(input.challengeType, input.scoringMethod, input.targetDistanceMetres);
    await this.assertCommunityManager(creatorId, input.communityId);
    if (input.inviteClubMembers && !input.communityId) throw new BadRequestException('Choose a club before inviting its members');
    let guaranteedPrizeKobo: number;
    try { guaranteedPrizeKobo = paidPrizePot(input.capacity, input.entryFeeKobo); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid paid prize pot'); }
    const prizeSplitBps = this.prizeSplit(input.prizeSplitBps, input.capacity);
    this.assertAwardAmounts(guaranteedPrizeKobo - Math.floor(guaranteedPrizeKobo * 0.35), prizeSplitBps);
    const creator = (await this.dataSource.query(
      `SELECT "id" FROM "creator_profiles" WHERE "userId"=$1 AND "status"='ACTIVE'`,
      [creatorId],
    ) as Array<{ id: string }>)[0];
    if (!creator) throw new ForbiddenException('An active creator account is required for paid competitions');
    const startsAt = new Date(input.startsAt);
    const entryClosesAt = new Date(input.entryClosesAt ?? input.scoringClosesAt);
    const scoringClosesAt = new Date(input.scoringClosesAt);
    if ((input.minimumEntrants ?? 2) > input.capacity || entryClosesAt > scoringClosesAt || startsAt > scoringClosesAt) {
      throw new ConflictException('Competition dates or entrant limits are invalid');
    }
    return this.saveWithInvites(this.tables.create({
      creatorId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      code: randomBytes(4).toString('hex').toUpperCase(),
      type: 'paid',
      status: 'PENDING_APPROVAL',
      entryFeeKobo: input.entryFeeKobo,
      guaranteedPrizeKobo,
      minimumEntrants: (input.minimumEntrants ?? 2),
      capacity: input.capacity,
      startsAt,
      entryClosesAt,
      scoringClosesAt,
      distanceCapMetres: null,
      challengeType: input.challengeType,
      scoringMethod: input.scoringMethod,
      targetDistanceMetres: input.targetDistanceMetres ?? null,
      ...reminderConfig(input.reminderTime, input.reminderTimeZone),
      communityId: input.communityId ?? null,
      platformFeeBps: 3500,
      creatorCommissionBps: 500,
      prizeSplitBps,
    }), input);
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
        if (table.capacity) {
          const count = await manager.count(TableRegistration, { where: { tableId } });
          if (count >= table.capacity) throw new ConflictException('This competition is full');
        }
        const registration = await manager.save(TableRegistration, manager.create(TableRegistration, { tableId, userId }));
        await manager.query(
          `UPDATE "challenge_invitations" SET "status"='ACCEPTED',"respondedAt"=now()
           WHERE "tableId"=$1 AND "invitedUserId"=$2 AND "status"='PENDING'`,
          [tableId, userId],
        );
        return registration;
      });
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('You already joined this competition');
      }
      throw error;
    }
  }

  async registration(tableId: string, userId: string) {
    const joined = await this.registrations.exist({ where: { tableId, userId } });
    return { joined };
  }

  async standings(tableId: string) {
    const table = await this.tables.findOne({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Competition not found');
    const metric = table.scoringMethod === 'MOST_STEPS' ? 'r."creditedSteps" DESC' : table.scoringMethod === 'FARTHEST_DISTANCE' ? 'r."creditedDistanceMetres" DESC' : 'r."completionTimeSeconds" ASC NULLS LAST';
    return this.dataSource.query(
      `SELECT row_number() OVER (ORDER BY ${metric},r."joinedAt" ASC,r."userId" ASC)::integer rank,
              r."userId",COALESCE(p."displayName",u."displayName",'Runner') "displayName",p."username",p."avatarUrl",
              r."creditedDistanceMetres",r."creditedSteps",r."completionTimeSeconds"
       FROM "table_registrations" r JOIN "users" u ON u."id"=r."userId" LEFT JOIN "profiles" p ON p."userId"=r."userId" WHERE r."tableId"=$1
       ORDER BY ${metric},r."joinedAt" ASC,r."userId" ASC LIMIT 500`,
      [tableId],
    );
  }

  async getByCode(code: string) {
    const table = await this.tables.findOne({
      where: { code: code.toUpperCase() },
      relations: { creator: true },
    });
    if (!table) throw new NotFoundException('Competition not found');
    const [presented] = await this.present([table]);
    const [host] = (await this.dataSource.query(`SELECT "username", "avatarUrl" FROM "profiles" WHERE "userId" = $1`, [table.creatorId])) as Array<{ username: string; avatarUrl: string | null }>;
    return { ...presented, creator: presented.creator ? { ...presented.creator, username: host?.username ?? null, avatarUrl: host?.avatarUrl ?? null } : null };
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
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid competition scoring');
    }
  }

  private prizeSplit(split: number[] | undefined, capacity: number | null) {
    try { return assertPrizeSplit(split, capacity); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid prize shares'); }
  }

  private assertAwardAmounts(amountKobo: number, split: number[]) {
    try { allocatePrizes(amountKobo, split); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Prize pot is too small'); }
  }

  private async saveWithInvites(table: CompetitionTable, input: Invites) {
    if (table.status !== 'OPEN_FOR_ENTRY' && (input.inviteClubMembers || input.inviteEmails?.length || input.invitePhones?.length)) {
      throw new BadRequestException('Fund or approve this draft before inviting runners');
    }
    const emails = [...new Set((input.inviteEmails ?? []).map((value) => value.trim().toLowerCase()))];
    const phones = [...new Set(input.invitePhones ?? [])];
    // Registered runners get one notification email from the outbox. Check all addresses at once.
    const registered = emails.length ? await this.dataSource.query(
      `SELECT lower("email") "email" FROM "users" WHERE "emailVerified"=true AND lower("email")=ANY($1::text[])`, [emails],
    ) as Array<{ email: string }> : [];
    const known = new Set(registered.map((row) => row.email));
    const saved = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(CompetitionTable, table);
      // The host is visible on every board; funded prizes exclude their score at settlement.
      await manager.save(TableRegistration, manager.create(TableRegistration, { tableId: created.id, userId: created.creatorId }));
      await this.insertInvitations(manager, created, input, emails, phones);
      return created;
    });
    const url = `${this.config.getOrThrow<string>('WEB_ORIGIN')}/competitions/${saved.code}`;
    for (const email of emails.filter((address) => !known.has(address))) this.mail.sendInBackground(challengeInviteEmail({ address: email }, saved.title, url));
    return saved;
  }

  private async insertInvitations(manager: EntityManager, table: CompetitionTable, input: Invites, emails: string[], phones: string[]) {
    if (input.inviteClubMembers && input.communityId) {
      await manager.query(
        `INSERT INTO "challenge_invitations" ("tableId","invitedUserId")
         SELECT $1,m."userId" FROM "club_memberships" m WHERE m."clubId"=$2 AND m."userId"<>$3
         ON CONFLICT DO NOTHING`, [table.id, input.communityId, table.creatorId],
      );
    }
    if (emails.length) await manager.query(
      `INSERT INTO "challenge_invitations" ("tableId","email") SELECT $1,unnest($2::varchar[]) ON CONFLICT DO NOTHING`,
      [table.id, emails],
    );
    if (phones.length) await manager.query(
      `INSERT INTO "challenge_invitations" ("tableId","phone") SELECT $1,unnest($2::varchar[]) ON CONFLICT DO NOTHING`,
      [table.id, phones],
    );
    if (input.inviteClubMembers || emails.length) await manager.query(
      `INSERT INTO "notifications" ("userId","type","title","body")
       SELECT DISTINCT targets."userId",'CHALLENGE_INVITE','You’re invited to a competition',$2
       FROM (
         SELECT i."invitedUserId" "userId" FROM "challenge_invitations" i WHERE i."tableId"=$1 AND i."invitedUserId" IS NOT NULL
         UNION
         SELECT u."id" FROM "challenge_invitations" i JOIN "users" u ON lower(u."email")=i."email" WHERE i."tableId"=$1
       ) targets WHERE targets."userId"<>$3`,
      [table.id, `Join ${table.title} with code ${table.code}.`, table.creatorId],
    );
  }

  async invitations(tableId: string, creatorId: string) {
    const table = await this.tables.findOne({ where: { id: tableId, creatorId } });
    if (!table) throw new NotFoundException('Competition not found');
    return this.dataSource.query(
      `SELECT i."id",i."email",i."phone",p."username",i."status",i."createdAt"
       FROM "challenge_invitations" i LEFT JOIN "profiles" p ON p."userId"=i."invitedUserId"
       WHERE i."tableId"=$1 ORDER BY i."createdAt" DESC LIMIT 200`, [tableId],
    );
  }

  async inviteRunner(tableId: string, creatorId: string, username: string) {
    const invitation = await this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(CompetitionTable, { where: { id: tableId, creatorId } });
      if (!table) throw new NotFoundException('Competition not found or you are not its host');
      if (table.status !== 'OPEN_FOR_ENTRY' || (table.entryClosesAt && table.entryClosesAt <= new Date())) {
        throw new ConflictException('Invitations are closed for this competition');
      }
      const [runner] = await manager.query(
        `SELECT p."userId",p."username",u."email",p."displayName" FROM "profiles" p JOIN "users" u ON u."id"=p."userId" WHERE lower(p."username")=lower($1)`,
        [username],
      ) as Array<{ userId: string; username: string; email: string; displayName: string }>;
      if (!runner) throw new NotFoundException('Runner not found');
      if (runner.userId === creatorId) throw new BadRequestException('You are already hosting this competition');
      if (await manager.exists(TableRegistration, { where: { tableId, userId: runner.userId } })) throw new ConflictException('This runner has already joined');
      const created = await manager.query(
        `INSERT INTO "challenge_invitations" ("tableId","invitedUserId") VALUES ($1,$2)
         ON CONFLICT DO NOTHING RETURNING "id"`, [tableId, runner.userId],
      ) as Array<{ id: string }>;
      const existing = created.length ? null : (await manager.query(
        `SELECT "id","status" FROM "challenge_invitations" WHERE "tableId"=$1 AND "invitedUserId"=$2`,
        [tableId, runner.userId],
      ) as Array<{ id: string; status: string }>)[0];
      if (existing && existing.status !== 'PENDING') throw new ConflictException('This runner already answered the invitation');
      const invitationId = created[0]?.id ?? existing?.id;
      if (!invitationId) throw new ConflictException('This runner was already invited');
      const link = `${this.config.getOrThrow<string>('WEB_ORIGIN')}/competitions/${table.code}`;
      const body = `Join ${table.title} on Jump: ${link}`;
      const message = await manager.query(
        `INSERT INTO "direct_messages" ("senderId","recipientId","body","invitationId") VALUES ($1,$2,$3,$4)
         ON CONFLICT ("invitationId") WHERE "invitationId" IS NOT NULL DO NOTHING RETURNING "id"`,
        [creatorId, runner.userId, body, invitationId],
      ) as Array<{ id: string }>;
      if (!message.length) throw new ConflictException('This runner was already invited in messages');
      await manager.query(
        `INSERT INTO "notifications" ("userId","type","title","body") VALUES ($1,'CHALLENGE_INVITE','You’re invited to a competition',$2)`,
        [runner.userId, body],
      );
      return { runner, table, link };
    });
    return { invited: true, username: invitation.runner.username };
  }

  async respondToInvitation(invitationId: string, userId: string, decision: 'ACCEPT' | 'DECLINE') {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const [invite] = await manager.query(
          `SELECT i."id",i."tableId",i."status" FROM "challenge_invitations" i
           WHERE i."id"=$1 AND i."invitedUserId"=$2 FOR UPDATE OF i`,
          [invitationId, userId],
        ) as Array<{ id: string; tableId: string; status: string }>;
        if (!invite) throw new NotFoundException('Invitation not found');
        if (invite.status !== 'PENDING') throw new ConflictException('This invitation has already been answered');
        if (decision === 'DECLINE') {
          if (await manager.exists(TableRegistration, { where: { tableId: invite.tableId, userId } })) {
            throw new ConflictException('You have already joined this competition');
          }
          const pendingPayment = await manager.query(
            `SELECT 1 FROM "payment_intents" WHERE "tableId"=$1 AND "userId"=$2 AND "purpose"='CHALLENGE_ENTRY'
             AND "status" IN ('INITIATED','PENDING','RECONCILIATION_REQUIRED') LIMIT 1`,
            [invite.tableId, userId],
          ) as unknown[];
          if (pendingPayment.length) throw new ConflictException('Your entry payment is still in progress; check its status before declining');
          await manager.query(`UPDATE "challenge_invitations" SET "status"='DECLINED',"respondedAt"=now() WHERE "id"=$1`, [invite.id]);
          return { status: 'DECLINED', joined: false };
        }
        const table = await manager.findOne(CompetitionTable, { where: { id: invite.tableId }, lock: { mode: 'pessimistic_write' } });
        if (!table) throw new NotFoundException('Competition not found');
        if (table.status !== 'OPEN_FOR_ENTRY' || (table.entryClosesAt && table.entryClosesAt <= new Date())) {
          throw new ConflictException('This competition is not open for entry');
        }
        if (await manager.exists(TableRegistration, { where: { tableId: table.id, userId } })) {
          await manager.query(`UPDATE "challenge_invitations" SET "status"='ACCEPTED',"respondedAt"=now() WHERE "id"=$1`, [invite.id]);
          return { status: 'ACCEPTED', joined: true, tableId: table.id, code: table.code, type: table.type };
        }
        if (table.type === 'paid') {
          const [count] = await manager.query(
            `SELECT COUNT(*)::integer count FROM "table_registrations" WHERE "tableId"=$1 AND "userId"<>$2`,
            [table.id, table.creatorId],
          ) as Array<{ count: number }>;
          if (table.capacity !== null && Number(count.count) >= table.capacity) throw new ConflictException('This competition is full');
          return { status: 'PENDING', joined: false, paymentRequired: true, tableId: table.id, code: table.code, type: table.type };
        }
        if (table.capacity !== null) {
          const count = await manager.count(TableRegistration, { where: { tableId: table.id } });
          if (count >= table.capacity) throw new ConflictException('This competition is full');
        }
        await manager.save(TableRegistration, manager.create(TableRegistration, { tableId: table.id, userId }));
        await manager.query(`UPDATE "challenge_invitations" SET "status"='ACCEPTED',"respondedAt"=now() WHERE "id"=$1`, [invite.id]);
        return { status: 'ACCEPTED', joined: true, tableId: table.id, code: table.code, type: table.type, contributionOptional: table.type === 'sponsored' && table.guaranteedPrizeKobo === null };
      });
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('You already joined this competition');
      }
      throw error;
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
