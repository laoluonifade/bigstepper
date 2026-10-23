import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { CloudinaryService } from '../profiles/cloudinary.service';
import { AVATAR_TYPES } from '../profiles/profiles.service';
import { AddSponsorMemberDto, ApplySponsorDto, UpdateSponsorDto } from './dto/sponsor.dto';

const isDuplicate = (error: unknown) =>
  error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505';

const slugOf = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'sponsor';

/**
 * Sponsors: brands (like Smileys Africa) and run clubs that put products up as competition prizes.
 * Anyone can apply; Jump admins activate them (see AdminService). Members of an active sponsor can
 * create product-prize competitions and run fulfilment for the prizes they deliver.
 */
@Injectable()
export class SponsorsService {
  constructor(private readonly dataSource: DataSource, private readonly cloudinary: CloudinaryService) {}

  async assertMember(sponsorId: string, userId: string, { active = false } = {}) {
    const [row] = await this.dataSource.query(
      `SELECT s."status", m."role" FROM "sponsors" s JOIN "sponsor_members" m ON m."sponsorId" = s."id" AND m."userId" = $2 WHERE s."id" = $1`,
      [sponsorId, userId],
    ) as Array<{ status: string; role: 'owner' | 'manager' }>;
    if (!row) throw new ForbiddenException('You’re not on this sponsor’s team');
    if (active && row.status !== 'ACTIVE') throw new ForbiddenException('This sponsor isn’t approved yet');
    return row;
  }

  /** A brand or run club asks to sponsor on Jump; the applicant becomes its owner. */
  async apply(userId: string, input: ApplySponsorDto) {
    if (input.kind === 'club') {
      if (!input.clubId) throw new BadRequestException('Choose the club you’re sponsoring as');
      const [manager] = await this.dataSource.query(
        `SELECT 1 FROM "club_memberships" WHERE "clubId" = $1 AND "userId" = $2 AND "role" IN ('owner','admin')`, [input.clubId, userId],
      ) as unknown[];
      if (!manager) throw new ForbiddenException('Only the club’s owner or a manager can register it as a sponsor');
    }
    return this.dataSource.transaction(async (manager) => {
      const base = slugOf(input.name);
      const taken = new Set((await manager.query(`SELECT "slug" FROM "sponsors" WHERE "slug" = $1 OR "slug" LIKE $1 || '-%'`, [base]) as Array<{ slug: string }>).map((row) => row.slug));
      let slug = base;
      for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;
      try {
        const [sponsor] = await manager.query(
          `INSERT INTO "sponsors" ("kind","name","slug","website","description","contactEmail","clubId","deliveryCountries","createdByUserId")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [input.kind, input.name.trim(), slug, normaliseSite(input.website), input.description?.trim() || null, input.contactEmail.trim().toLowerCase(),
            input.kind === 'club' ? input.clubId : null, JSON.stringify([...new Set(input.deliveryCountries)]), userId],
        );
        await manager.query(`INSERT INTO "sponsor_members" ("sponsorId","userId","role") VALUES ($1,$2,'owner')`, [sponsor.id, userId]);
        return sponsor;
      } catch (error) {
        if (isDuplicate(error)) throw new ConflictException('A sponsor with that name already exists');
        throw error;
      }
    });
  }

  /** Sponsors you're on the team of. */
  mine(userId: string) {
    return this.dataSource.query(
      `SELECT s.*, m."role" AS "myRole" FROM "sponsors" s JOIN "sponsor_members" m ON m."sponsorId" = s."id" AND m."userId" = $1 ORDER BY s."createdAt"`,
      [userId],
    );
  }

  async update(userId: string, sponsorId: string, input: UpdateSponsorDto) {
    await this.assertMember(sponsorId, userId);
    const [sponsor] = await this.dataSource.query(
      `UPDATE "sponsors" SET
         "name" = COALESCE($2, "name"), "website" = CASE WHEN $3::text IS NULL THEN "website" ELSE NULLIF($3, '') END,
         "description" = CASE WHEN $4::text IS NULL THEN "description" ELSE NULLIF($4, '') END,
         "contactEmail" = COALESCE($5, "contactEmail"), "deliveryCountries" = COALESCE($6::jsonb, "deliveryCountries"), "updatedAt" = now()
       WHERE "id" = $1 RETURNING *`,
      [sponsorId, input.name?.trim() ?? null, input.website === undefined ? null : normaliseSite(input.website) ?? '', input.description === undefined ? null : input.description.trim(),
        input.contactEmail?.trim().toLowerCase() ?? null, input.deliveryCountries ? JSON.stringify([...new Set(input.deliveryCountries)]) : null],
    ) as [Array<Record<string, unknown>>, number];
    return sponsor[0];
  }

  /** A logo (kind=logo, saved on the profile) or a prize photo (returns its URL for a prize). */
  async uploadImage(userId: string, sponsorId: string, kind: 'logo' | 'prize', file: { buffer: Buffer; mimetype: string } | undefined) {
    await this.assertMember(sponsorId, userId);
    if (!file) throw new BadRequestException('Choose an image');
    if (!AVATAR_TYPES.includes(file.mimetype)) throw new BadRequestException('Use a JPG, PNG, WebP or HEIC image');
    const url = await this.cloudinary.uploadSponsorImage(sponsorId, file);
    if (kind === 'logo') await this.dataSource.query(`UPDATE "sponsors" SET "logoUrl" = $2, "updatedAt" = now() WHERE "id" = $1`, [sponsorId, url]);
    return { url };
  }

  /** The owner adds a teammate by the email on their Jump account. */
  async addMember(userId: string, sponsorId: string, input: AddSponsorMemberDto) {
    const me = await this.assertMember(sponsorId, userId);
    if (me.role !== 'owner') throw new ForbiddenException('Only the sponsor’s owner can add teammates');
    const [user] = await this.dataSource.query(`SELECT "id" FROM "users" WHERE lower("email") = lower($1)`, [input.email.trim()]) as Array<{ id: string }>;
    if (!user) throw new NotFoundException('No Jump account uses that email. Ask them to sign up first.');
    await this.dataSource.query(`INSERT INTO "sponsor_members" ("sponsorId","userId","role") VALUES ($1,$2,'manager') ON CONFLICT DO NOTHING`, [sponsorId, user.id]);
    return { added: true };
  }

  /**
   * The fulfilment dashboard: the sponsor's competitions and each winner's prize and status. Delivery
   * details only appear once submitted, and only where this sponsor delivers (Jump-delivered prizes keep
   * them with Jump).
   */
  async dashboard(userId: string, sponsorId: string) {
    await this.assertMember(sponsorId, userId);
    const competitions = await this.dataSource.query(
      `SELECT t."id", t."code", t."title", t."status", t."startsAt", t."scoringClosesAt", t."prizeFulfilment", t."prizeDeliveryCountries", t."prizesFinalizedAt",
              (SELECT count(*) FROM "table_registrations" r WHERE r."tableId" = t."id")::integer AS "entrants",
              (SELECT json_agg(json_build_object('position', p."position", 'productName', p."productName", 'quantity', p."quantity", 'imageUrl', p."imageUrl") ORDER BY p."position")
                 FROM "competition_prizes" p WHERE p."tableId" = t."id") AS "prizes"
       FROM "competition_tables" t WHERE t."sponsorId" = $1 ORDER BY t."createdAt" DESC LIMIT 100`,
      [sponsorId],
    );
    const awards = await this.dataSource.query(
      `SELECT a."id", a."tableId", a."position", a."standingRank", a."status", a."detailsDueAt", a."trackingNote", a."issueNote",
              a."submittedAt", a."shippedAt", a."deliveredAt", pr."productName",
              COALESCE(p."displayName", u."displayName", 'Winner') AS "winnerName", p."username" AS "winnerUsername",
              CASE WHEN t."prizeFulfilment" = 'sponsor' AND a."status" NOT IN ('AWAITING_DETAILS','FORFEITED') THEN json_build_object(
                'fullName', a."fullName", 'phone', a."phone", 'address', a."address", 'city', a."city", 'region', a."region",
                'country', a."country", 'deliveryNotes', a."deliveryNotes") END AS "delivery"
       FROM "product_awards" a JOIN "competition_tables" t ON t."id" = a."tableId" JOIN "competition_prizes" pr ON pr."id" = a."prizeId"
       JOIN "users" u ON u."id" = a."userId" LEFT JOIN "profiles" p ON p."userId" = a."userId"
       WHERE t."sponsorId" = $1 AND a."status" <> 'FORFEITED'
       ORDER BY a."createdAt" DESC, a."position" LIMIT 500`,
      [sponsorId],
    );
    return { competitions, awards };
  }

  /** Public: who a sponsor is, for its logo and name on competition pages. */
  async publicProfile(slug: string) {
    const [sponsor] = await this.dataSource.query(
      `SELECT "id","kind","name","slug","logoUrl","website","description" FROM "sponsors" WHERE "slug" = $1 AND "status" = 'ACTIVE'`, [slug],
    );
    if (!sponsor) throw new NotFoundException('Sponsor not found');
    return sponsor;
  }

  /** Prize photo URLs must be ones uploaded for this sponsor. */
  assertOwnImages(sponsorId: string, urls: Array<string | undefined>) {
    for (const url of urls) if (url && !this.cloudinary.isOwnSponsorImage(sponsorId, url)) throw new BadRequestException('Upload the prize photos again');
  }
}

function normaliseSite(site?: string) {
  const value = site?.trim();
  if (!value) return null;
  if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(value)) throw new BadRequestException('Enter a web address like brand.com');
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}
