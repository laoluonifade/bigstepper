import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { planOf } from '../clubs/club-plans';
import { ClubPrizesDto, PrizeInputDto } from '../prizes/dto/prizes.dto';
import { CloudinaryService } from '../profiles/cloudinary.service';
import { enrolClubMembers } from './club-competitions';
import { creditActivities } from './competition-credits';
import { CompetitionTable } from './competition-table.entity';
import { TableRegistration } from './table-registration.entity';

/** Not public yet: a draft, or waiting for its publish time. */
export const UNPUBLISHED = ['DRAFT', 'SCHEDULED'];

export type ClubForHosting = { id: string; slug: string; name: string; plan: string; planRenewsAt: Date | null; suspendedAt: Date | null; role: string | null };

/**
 * A club manager running a challenge for their club: the club must exist and not be suspended, and a new
 * live (or scheduled) challenge must fit the club's plan.
 */
export async function assertClubCanHost(manager: EntityManager, clubId: string, userId: string, { adding = true } = {}) {
  const [club] = await manager.query(
    `SELECT c."id", c."slug", c."name", c."plan", c."planRenewsAt", c."suspendedAt", m."role"
     FROM "clubs" c LEFT JOIN "club_memberships" m ON m."clubId" = c."id" AND m."userId" = $2 WHERE c."id" = $1`,
    [clubId, userId],
  ) as ClubForHosting[];
  if (!club) throw new NotFoundException('Club not found');
  if (club.role !== 'owner' && club.role !== 'admin') throw new ForbiddenException('Only the club owner or a manager can do that');
  if (club.suspendedAt) throw new ForbiddenException('Jump has suspended this club, so it can’t run competitions. Contact Jump support.');
  if (adding) {
    const plan = planOf(club.plan, club.planRenewsAt);
    const [{ live }] = await manager.query(
      `SELECT count(*)::integer AS "live" FROM "competition_tables"
       WHERE "communityId" = $1 AND "status" IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED','SCHEDULED')
         AND ("scoringClosesAt" IS NULL OR "scoringClosesAt" > now())`,
      [clubId],
    ) as Array<{ live: number }>;
    if (live >= plan.liveChallenges) {
      throw new ConflictException(`Your club can run ${plan.liveChallenges} competitions at a time on the ${plan.label} plan. Wait for one to finish, or save this as a draft.`);
    }
  }
  return club;
}

/** A club manager, or the person who made it, can manage a challenge. */
export async function canManageTable(manager: EntityManager, table: Pick<CompetitionTable, 'creatorId' | 'communityId'>, userId: string) {
  if (table.creatorId === userId) return true;
  if (!table.communityId) return false;
  const rows = await manager.query(`SELECT 1 FROM "club_memberships" WHERE "clubId" = $1 AND "userId" = $2 AND "role" IN ('owner','admin')`, [table.communityId, userId]) as unknown[];
  return rows.length > 0;
}

/** Prize tiers numbered from 1 with no gaps, enough places for every winner, and photos uploaded for this club. */
export function checkClubPrizes(prizes: ClubPrizesDto, capacity: number | null, clubId: string, cloudinary: CloudinaryService) {
  const positions = prizes.prizes.map((prize) => prize.position).sort((a, b) => a - b);
  if (positions.some((position, index) => position !== index + 1)) throw new BadRequestException('Number the prizes 1, 2, 3… in the order they’re won');
  const winners = prizes.prizes.reduce((sum, prize) => sum + prize.quantity, 0);
  if (capacity !== null && winners > capacity) throw new BadRequestException(`There are ${winners} prizes but only ${capacity} places`);
  for (const prize of prizes.prizes) {
    if (prize.imageUrl && !cloudinary.isOwnClubPrizeImage(clubId, prize.imageUrl)) throw new BadRequestException('Upload the prize photos again');
  }
}

/** The challenge's columns for its prize terms (or none). */
export function prizeColumns(prizes: ClubPrizesDto | null | undefined) {
  return prizes ? {
    prizeDeliveryCountries: [...new Set(prizes.deliveryCountries)],
    prizeFulfilment: prizes.fulfilment,
    prizeShipping: prizes.shipping,
    prizeShippingNote: prizes.shippingNote?.trim() || null,
    prizeEligibilityNote: prizes.eligibilityNote?.trim() || null,
    prizeClaimDays: prizes.claimDays ?? 14,
    prizeSelection: prizes.selection,
  } : {
    prizeDeliveryCountries: [], prizeFulfilment: null, prizeShipping: null, prizeShippingNote: null, prizeEligibilityNote: null, prizeClaimDays: 14, prizeSelection: 'top' as const,
  };
}

export async function savePrizes(manager: EntityManager, tableId: string, prizes: PrizeInputDto[], { replace = false } = {}) {
  if (replace) await manager.query(`DELETE FROM "competition_prizes" WHERE "tableId" = $1`, [tableId]);
  for (const prize of prizes) {
    await manager.query(
      `INSERT INTO "competition_prizes" ("tableId","position","kind","productName","description","imageUrl","quantity","estimatedValue","currency","redeemInstructions")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [tableId, prize.position, prize.kind, prize.productName.trim(), prize.description?.trim() || null, prize.imageUrl ?? null, prize.quantity,
        prize.estimatedValue ?? null, prize.currency ?? 'NGN', prize.redeemInstructions?.trim() || null],
    );
  }
}

/** Followers hear about each new public challenge from the club. */
export async function announceToFollowers(manager: EntityManager, table: Pick<CompetitionTable, 'id' | 'communityId' | 'visibility' | 'creatorId' | 'title' | 'code'>) {
  if (!table.communityId || table.visibility !== 'public') return;
  await manager.query(
    `INSERT INTO "notifications" ("userId","type","title","body","link")
     SELECT f."userId", 'CLUB_CHALLENGE', c."name" || ' has a new competition', $2, '/competitions/' || $3
     FROM "club_follows" f JOIN "clubs" c ON c."id" = f."clubId"
     WHERE f."clubId" = $1 AND f."userId" <> $4
       AND NOT EXISTS (SELECT 1 FROM "table_registrations" r WHERE r."tableId" = $5 AND r."userId" = f."userId")`,
    [table.communityId, `${table.title}. Tap to see the rules and join.`, table.code, table.creatorId, table.id],
  );
}

/** Opens a draft or scheduled challenge: entry opens, the club is entered if asked, and followers hear. */
export async function openTable(manager: EntityManager, table: CompetitionTable) {
  table.status = 'OPEN_FOR_ENTRY';
  table.publishAt = null;
  await manager.save(CompetitionTable, table);
  if (table.autoEnrolClub && table.communityId && table.type !== 'paid') await enrolClubMembers(manager, { tableId: table.id });
  await announceToFollowers(manager, table);
  return table;
}

/** What a duplicate or a series edition copies: the rules, branding, limits and prize terms. */
const TEMPLATE_FIELDS = [
  'title', 'description', 'type', 'challengeType', 'scoringMethod', 'targetDistanceMetres', 'targetSteps', 'targetSeconds', 'targetSessions',
  'dailyTarget', 'minSessions', 'minActivityMetres', 'minActivitySeconds', 'eligibleActivities', 'format', 'timeZone', 'rulesVersion',
  'reminderTime', 'reminderTimeZone', 'capacity', 'distanceCapMetres', 'visibility', 'eligibleCountries', 'platformFeeBps', 'creatorCommissionBps',
  'prizeSplitBps', 'minimumEntrants', 'fundingDestination', 'prizeDeliveryCountries', 'prizeFulfilment', 'prizeShipping', 'prizeShippingNote',
  'prizeEligibilityNote', 'prizeClaimDays', 'prizeSelection', 'autoEnrolClub',
] as const;

export type ChallengeTemplate = Partial<Record<(typeof TEMPLATE_FIELDS)[number], unknown>> & {
  durationMs: number;
  entryOffsetMs: number;
  prizes: PrizeInputDto[];
};

/** Only free challenges repeat: a cash prize has to be funded each time. */
export function assertRepeatable(table: CompetitionTable) {
  if (table.type !== 'free') throw new BadRequestException('Only free-entry competitions (with or without club prizes) can be copied or repeated. Cash prizes are funded one competition at a time.');
  if (!table.startsAt || !table.scoringClosesAt) throw new BadRequestException('Give the competition an end date first');
}

export async function templateOf(manager: EntityManager, table: CompetitionTable): Promise<ChallengeTemplate> {
  assertRepeatable(table);
  const prizes = await manager.query(
    `SELECT "position","kind","productName","description","imageUrl","quantity","estimatedValue","currency","redeemInstructions"
     FROM "competition_prizes" WHERE "tableId" = $1 ORDER BY "position"`, [table.id],
  ) as PrizeInputDto[];
  const fields = Object.fromEntries(TEMPLATE_FIELDS.map((field) => [field, table[field]]));
  const start = table.startsAt!.getTime();
  return {
    ...fields,
    durationMs: table.scoringClosesAt!.getTime() - start,
    entryOffsetMs: (table.entryClosesAt ?? table.scoringClosesAt!).getTime() - start,
    prizes: prizes.map((prize) => ({ ...prize, description: prize.description ?? undefined, imageUrl: prize.imageUrl ?? undefined, estimatedValue: prize.estimatedValue ?? undefined, redeemInstructions: prize.redeemInstructions ?? undefined })),
  };
}

/** A new challenge from a template, with its own dates, code, board and entrants. The creator is entered like any host. */
export async function createFromTemplate(manager: EntityManager, template: ChallengeTemplate, values: {
  creatorId: string; communityId: string; startsAt: Date; status: 'DRAFT' | 'SCHEDULED' | 'OPEN_FOR_ENTRY'; publishAt?: Date | null;
  seriesId?: string | null; edition?: number | null; title?: string;
}) {
  const { durationMs, entryOffsetMs, prizes, ...fields } = template;
  const table = await manager.save(CompetitionTable, manager.create(CompetitionTable, {
    ...(fields as Partial<CompetitionTable>),
    title: values.title ?? (fields.title as string),
    code: randomBytes(4).toString('hex').toUpperCase(),
    creatorId: values.creatorId,
    communityId: values.communityId,
    status: values.status === 'OPEN_FOR_ENTRY' ? 'DRAFT' : values.status,
    publishAt: values.publishAt ?? null,
    startsAt: values.startsAt,
    scoringClosesAt: new Date(values.startsAt.getTime() + durationMs),
    entryClosesAt: new Date(values.startsAt.getTime() + entryOffsetMs),
    seriesId: values.seriesId ?? null,
    edition: values.edition ?? null,
    entryFeeKobo: 0,
    guaranteedPrizeKobo: null,
    charityName: null,
    archivedAt: null,
    prizesFinalizedAt: null,
    fundedAt: null,
    promotedUntil: null,
  }));
  await manager.save(TableRegistration, manager.create(TableRegistration, { tableId: table.id, userId: values.creatorId }));
  await creditActivities(manager, { tableId: table.id, userId: values.creatorId });
  if (prizes.length) await savePrizes(manager, table.id, prizes);
  return values.status === 'OPEN_FOR_ENTRY' ? openTable(manager, table) : table;
}

/** The next edition's start: a week or a calendar month on. */
export function nextStart(from: Date, cadence: 'weekly' | 'monthly') {
  const next = new Date(from);
  if (cadence === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

/** Only people from the listed countries can join; an empty list lets everyone in. */
export async function assertCountryEligible(manager: EntityManager, table: Pick<CompetitionTable, 'eligibleCountries'>, userId: string) {
  if (!table.eligibleCountries?.length) return;
  const [profile] = await manager.query(`SELECT "countryCode" FROM "profiles" WHERE "userId" = $1`, [userId]) as Array<{ countryCode: string | null }>;
  if (!profile?.countryCode) throw new ForbiddenException('This competition is limited to some countries. Add your country to your profile first.');
  if (!table.eligibleCountries.includes(profile.countryCode)) throw new ForbiddenException('This competition isn’t open to runners in your country');
}
