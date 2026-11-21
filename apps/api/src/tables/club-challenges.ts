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

export const UNPUBLISHED = ['DRAFT', 'SCHEDULED'];

export type ClubForHosting = { id: string; slug: string; name: string; plan: string; planRenewsAt: Date | null; suspendedAt: Date | null; role: string | null };

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

export async function canManageTable(manager: EntityManager, table: Pick<CompetitionTable, 'creatorId' | 'communityId'>, userId: string) {
  if (table.creatorId === userId) return true;
  if (!table.communityId) return false;
  const rows = await manager.query(`SELECT 1 FROM "club_memberships" WHERE "clubId" = $1 AND "userId" = $2 AND "role" IN ('owner','admin')`, [table.communityId, userId]) as unknown[];
  return rows.length > 0;
}

export function checkClubPrizes(prizes: ClubPrizesDto, capacity: number | null, clubId: string, cloudinary: CloudinaryService) {
  const positions = prizes.prizes.map((prize) => prize.position).sort((a, b) => a - b);
  if (positions.some((position, index) => position !== index + 1)) throw new BadRequestException('Number the prizes 1, 2, 3… in the order they’re won');
  const winners = prizes.prizes.reduce((sum, prize) => sum + prize.quantity, 0);
  if (capacity !== null && winners > capacity) throw new BadRequestException(`There are ${winners} prizes but only ${capacity} places`);
  for (const prize of prizes.prizes) {
    if (prize.imageUrl && !cloudinary.isOwnClubPrizeImage(clubId, prize.imageUrl)) throw new BadRequestException('Upload the prize photos again');
  }
}

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

export async function announceCompetition(manager: EntityManager, table: Pick<CompetitionTable, 'id' | 'visibility'>) {
  if (table.visibility !== 'public') return;
  await manager.query(
    `UPDATE "competition_tables" SET "announceAt" = now() + interval '5 hours' WHERE "id" = $1 AND "announcedAt" IS NULL AND "announceAt" IS NULL`,
    [table.id],
  );
}

export async function openTable(manager: EntityManager, table: CompetitionTable) {
  table.status = 'OPEN_FOR_ENTRY';
  table.publishAt = null;
  await manager.save(CompetitionTable, table);
  if (table.autoEnrolClub && table.communityId && table.type !== 'paid') await enrolClubMembers(manager, { tableId: table.id });
  await announceCompetition(manager, table);
  return table;
}

const TEMPLATE_FIELDS = [
  'title', 'description', 'venue', 'address', 'latitude', 'longitude', 'type', 'challengeType', 'scoringMethod', 'targetDistanceMetres', 'targetSteps', 'targetSeconds', 'targetSessions',
  'dailyTarget', 'minSessions', 'minActivityMetres', 'minActivitySeconds', 'eligibleActivities', 'format', 'timeZone', 'rulesVersion',
  'reminderTime', 'reminderTimeZone', 'capacity', 'distanceCapMetres', 'visibility', 'eligibleCountries', 'platformFeeBps', 'creatorCommissionBps',
  'prizeSplitBps', 'minimumEntrants', 'fundingDestination', 'prizeDeliveryCountries', 'prizeFulfilment', 'prizeShipping', 'prizeShippingNote',
  'prizeEligibilityNote', 'prizeClaimDays', 'prizeSelection', 'autoEnrolClub', 'enrolAudience', 'medalRule', 'hourFrom', 'hourTo', 'personal',
] as const;

export type ChallengeTemplate = Partial<Record<(typeof TEMPLATE_FIELDS)[number], unknown>> & {
  durationMs: number;
  entryOffsetMs: number;
  prizes: PrizeInputDto[];
};

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

export async function createFromTemplate(manager: EntityManager, template: ChallengeTemplate, values: {
  creatorId: string; communityId: string; startsAt: Date; status: 'DRAFT' | 'SCHEDULED' | 'OPEN_FOR_ENTRY'; publishAt?: Date | null;
  seriesId?: string | null; edition?: number | null; title?: string; endsAt?: Date; joinHost?: boolean; quiet?: boolean;
}) {
  const { durationMs, entryOffsetMs, prizes, ...fields } = template;
  const scoringClosesAt = values.endsAt ?? new Date(values.startsAt.getTime() + durationMs);
  const table = await manager.save(CompetitionTable, manager.create(CompetitionTable, {
    ...(fields as Partial<CompetitionTable>),
    title: values.title ?? (fields.title as string),
    code: randomBytes(4).toString('hex').toUpperCase(),
    creatorId: values.creatorId,
    communityId: values.communityId,
    status: values.status === 'OPEN_FOR_ENTRY' ? 'DRAFT' : values.status,
    publishAt: values.publishAt ?? null,
    startsAt: values.startsAt,
    scoringClosesAt,
    entryClosesAt: new Date(Math.min(scoringClosesAt.getTime(), values.startsAt.getTime() + entryOffsetMs)),
    seriesId: values.seriesId ?? null,
    edition: values.edition ?? null,
    entryFeeKobo: 0,
    guaranteedPrizeKobo: null,
    charityName: null,
    archivedAt: null,
    prizesFinalizedAt: null,
    resultsFinalizedAt: null,
    fundedAt: null,
    promotedUntil: null,
  }));
  if (values.quiet) await manager.query(`UPDATE "competition_tables" SET "announcedAt" = now() WHERE "id" = $1`, [table.id]);
  if (values.joinHost !== false) {
    await manager.save(TableRegistration, manager.create(TableRegistration, { tableId: table.id, userId: values.creatorId }));
    await creditActivities(manager, { tableId: table.id, userId: values.creatorId });
  }
  if (prizes.length) await savePrizes(manager, table.id, prizes);
  return values.status === 'OPEN_FOR_ENTRY' ? openTable(manager, table) : table;
}

export type SeriesCadence = 'daily' | 'weekly' | 'monthly' | 'custom';

export function defaultLeadDays(cadence: SeriesCadence, intervalDays?: number | null) {
  if (cadence === 'daily') return 0;
  if (cadence === 'custom') return Math.min(7, Math.max(0, (intervalDays ?? 7) - 1));
  return 7;
}

function localParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(date).map((part) => [part.type, Number(part.value)]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

function fromLocal(local: { year: number; month: number; day: number; hour: number; minute: number; second: number }, timeZone: string) {
  const wall = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  let guess = wall;
  for (let pass = 0; pass < 2; pass += 1) {
    const seen = localParts(new Date(guess), timeZone);
    guess += wall - Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
  }
  return new Date(guess);
}

export function nextStart(from: Date, cadence: SeriesCadence, timeZone = 'Africa/Lagos', intervalDays?: number | null) {
  const local = localParts(from, timeZone);
  if (cadence === 'monthly') {
    const month = local.month === 12 ? 1 : local.month + 1;
    const year = local.month === 12 ? local.year + 1 : local.year;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return fromLocal({ ...local, year, month, day: Math.min(local.day, lastDay) }, timeZone);
  }
  const days = cadence === 'daily' ? 1 : cadence === 'weekly' ? 7 : Math.max(1, intervalDays ?? 7);
  const shifted = new Date(Date.UTC(local.year, local.month - 1, local.day + days));
  return fromLocal({ ...local, year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() }, timeZone);
}

export function editionLabel(startsAt: Date, endsAt: Date, cadence: SeriesCadence, timeZone = 'Africa/Lagos') {
  const last = new Date(endsAt.getTime() - 1);
  const format = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).format(date);
  if (cadence === 'monthly' && format(startsAt, { day: 'numeric' }) === '1') return format(startsAt, { month: 'long', year: 'numeric' });
  if (format(startsAt, { dateStyle: 'short' }) === format(last, { dateStyle: 'short' })) return format(startsAt, { weekday: 'short', day: 'numeric', month: 'short' });
  const sameMonth = format(startsAt, { month: 'short', year: 'numeric' }) === format(last, { month: 'short', year: 'numeric' });
  return sameMonth
    ? `${format(startsAt, { day: 'numeric' })}–${format(last, { day: 'numeric', month: 'short' })}`
    : `${format(startsAt, { day: 'numeric', month: 'short' })} – ${format(last, { day: 'numeric', month: 'short' })}`;
}

export async function carryOverEntrants(manager: EntityManager, table: Pick<CompetitionTable, 'id' | 'seriesId' | 'edition' | 'capacity' | 'startsAt'>) {
  if (!table.seriesId || !table.edition) return [];
  const carried = await manager.query(
    `WITH previous AS (
       SELECT t."id" FROM "competition_tables" t
       WHERE t."seriesId" = $2 AND t."edition" < $3 AND t."status" <> 'CANCELLED' AND t."deletedAt" IS NULL
       ORDER BY t."edition" DESC LIMIT 1
     )
     INSERT INTO "table_registrations" ("tableId", "userId")
     SELECT $1, r."userId" FROM "table_registrations" r
     JOIN previous p ON p."id" = r."tableId"
     JOIN "users" u ON u."id" = r."userId" AND u."deletedAt" IS NULL
     ORDER BY r."joinedAt"
     LIMIT COALESCE($4::integer, 2147483647)
     ON CONFLICT DO NOTHING
     RETURNING "userId"`,
    [table.id, table.seriesId, table.edition, table.capacity],
  ) as Array<{ userId: string }>;
  if (table.startsAt && table.startsAt <= new Date()) {
    for (const { userId } of carried) await creditActivities(manager, { tableId: table.id, userId });
  }
  return carried.map((row) => row.userId);
}

export async function assertCountryEligible(manager: EntityManager, table: Pick<CompetitionTable, 'eligibleCountries'>, userId: string) {
  if (!table.eligibleCountries?.length) return;
  const [profile] = await manager.query(`SELECT "countryCode" FROM "profiles" WHERE "userId" = $1`, [userId]) as Array<{ countryCode: string | null }>;
  if (!profile?.countryCode) throw new ForbiddenException('This competition is limited to some countries. Add your country to your profile first.');
  if (!table.eligibleCountries.includes(profile.countryCode)) throw new ForbiddenException('This competition isn’t open to runners in your country');
}
