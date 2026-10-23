import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { clubInviteEmail } from '../mail/templates';
import { Profile } from '../profiles/profile.entity';
import { CloudinaryService } from '../profiles/cloudinary.service';
import { AVATAR_TYPES } from '../profiles/profiles.service';
import { enrolClubMembers } from '../tables/club-competitions';
import { RANK_ORDER } from '../tables/scoring-engine';
import { planOf } from './club-plans';
import { ClubMembership } from './club-membership.entity';
import { Club } from './club.entity';
import { CreateClubDto, UpdateClubDto } from './dto/create-club.dto';

type Role = ClubMembership['role'];
const MANAGERS: Role[] = ['owner', 'admin'];

const inviteCode = () => randomBytes(6).toString('base64url').replace(/[-_]/g, 'X').slice(0, 10).toUpperCase();
const isDuplicate = (error: unknown) =>
  error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505';

/**
 * Clubs: a page with an about, logo and colour; an owner who can make members managers; managers who
 * edit the club, invite people and host competitions; and members, who are entered into the club's free
 * competitions automatically (see enrolClubMembers).
 */
@Injectable()
export class ClubsService {
  constructor(
    @InjectRepository(Club) private readonly clubs: Repository<Club>,
    @InjectRepository(ClubMembership) private readonly memberships: Repository<ClubMembership>,
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
    private readonly dataSource: DataSource,
    private readonly cloudinary: CloudinaryService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async create(userId: string, input: CreateClubDto) {
    const slug = input.slug?.toLowerCase() ?? await this.freeSlug(input.name);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const club = await manager.save(Club, manager.create(Club, {
          name: input.name.trim(),
          slug,
          ownerUserId: userId,
          description: input.description?.trim() || null,
          privacy: input.privacy ?? 'open',
          inviteCode: inviteCode(),
        }));
        await manager.save(ClubMembership, manager.create(ClubMembership, { clubId: club.id, userId, role: 'owner' }));
        await manager.query(`INSERT INTO "club_follows" ("clubId","userId") VALUES ($1,$2)`, [club.id, userId]);
        return club;
      });
    } catch (error) {
      if (isDuplicate(error)) throw new ConflictException('That club handle is taken. Try another.');
      throw error;
    }
  }

  /** The club's link handle from its name: "Lagos Road Runners" → lagos-road-runners, then -2, -3… if taken. */
  private async freeSlug(name: string) {
    const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 34).replace(/-+$/, '');
    const root = base.length >= 3 ? base : `${base || 'club'}-club`.replace(/^-/, '');
    const taken = new Set((await this.dataSource.query(
      `SELECT "slug" FROM "clubs" WHERE "slug" = $1 OR "slug" LIKE $1 || '-%'`, [root],
    ) as Array<{ slug: string }>).map((row) => row.slug));
    if (!taken.has(root)) return root;
    for (let n = 2; ; n += 1) if (!taken.has(`${root}-${n}`)) return `${root}-${n}`;
  }

  /** Your clubs (ones you're in or follow, with your role), or open clubs to discover, most followed first. */
  async list(viewerId: string, view: 'mine' | 'discover') {
    return this.dataSource.query(
      `SELECT c."id", c."slug", c."name", c."description", c."logoUrl", c."accentColor", c."location", c."privacy", c."verifiedAt" IS NOT NULL AS "verified",
              (SELECT count(*) FROM "club_memberships" x WHERE x."clubId" = c."id")::integer AS "memberCount",
              (SELECT count(*) FROM "club_follows" x WHERE x."clubId" = c."id")::integer AS "followerCount",
              me."role" AS "myRole", f."userId" IS NOT NULL AS "following"
       FROM "clubs" c
       LEFT JOIN "club_memberships" me ON me."clubId" = c."id" AND me."userId" = $1
       LEFT JOIN "club_follows" f ON f."clubId" = c."id" AND f."userId" = $1
       WHERE ${view === 'mine' ? '(me."id" IS NOT NULL OR f."userId" IS NOT NULL)' : `c."privacy" = 'open' AND me."id" IS NULL AND f."userId" IS NULL AND c."suspendedAt" IS NULL`}
       ORDER BY ${view === 'mine' ? `CASE me."role" WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, COALESCE(me."joinedAt", f."createdAt") DESC` : `"followerCount" DESC, "memberCount" DESC, c."createdAt" DESC`}
       LIMIT 50`,
      [viewerId],
    );
  }

  /** Clubs are addressed by their handle; the UUID still works for older links. */
  private async find(clubRef: string) {
    const ref = clubRef.trim().replace(/^\/+/, '').toLowerCase();
    const club = await this.clubs.findOne({ where: UUID_PATTERN.test(ref) ? { id: ref } : { slug: ref } });
    if (!club) throw new NotFoundException('Club not found');
    return club;
  }

  private async roleOf(clubId: string, userId: string | null | undefined): Promise<Role | null> {
    if (!userId) return null;
    const membership = await this.memberships.findOne({ where: { clubId, userId } });
    return membership?.role ?? null;
  }

  private async assertManager(clubId: string, userId: string) {
    const role = await this.roleOf(clubId, userId);
    if (!role || !MANAGERS.includes(role)) throw new ForbiddenException('Only the club owner or a manager can do that');
    return role;
  }

  /**
   * The club page, for anyone with the link (members of invite-only clubs see the same). Members also get
   * the invite code; a visitor learns whether the invite in their link is valid.
   */
  async get(clubRef: string, viewerId?: string | null, invite?: string) {
    const club = await this.find(clubRef);
    const role = await this.roleOf(club.id, viewerId);
    const [counts] = await this.dataSource.query(
      `SELECT (SELECT count(*) FROM "club_memberships" WHERE "clubId" = $1)::integer AS "memberCount",
              (SELECT count(*) FROM "club_follows" WHERE "clubId" = $1)::integer AS "followerCount",
              (SELECT count(*) FROM "competition_tables" WHERE "communityId" = $1 AND "status" NOT IN ('DRAFT','SCHEDULED','CANCELLED','PENDING_FUNDING','PENDING_APPROVAL')
                 AND "visibility" = 'public' AND "archivedAt" IS NULL AND "startsAt" > now())::integer AS "upcomingCompetitions",
              EXISTS (SELECT 1 FROM "club_follows" WHERE "clubId" = $1 AND "userId" = $2) AS "following",
              (SELECT count(*) FROM "competition_tables" WHERE "communityId" = $1
                 AND "status" IN ('OPEN_FOR_ENTRY','ACTIVE','ENTRY_CLOSED') AND ("scoringClosesAt" IS NULL OR "scoringClosesAt" > now()))::integer AS "liveCompetitions"`,
      [club.id, viewerId ?? null],
    ) as Array<{ memberCount: number; followerCount: number; upcomingCompetitions: number; following: boolean; liveCompetitions: number }>;
    const faces = await this.dataSource.query(
      `SELECT COALESCE(p."displayName", u."displayName", 'Runner') AS "displayName", p."avatarUrl",
              CASE WHEN p."gender"='male' THEN 'masculine' WHEN p."gender"='female' THEN 'feminine' ELSE 'neutral' END "avatarStyle", p."verifiedAt" IS NOT NULL AS "verified"
       FROM "club_memberships" m JOIN "users" u ON u."id" = m."userId" LEFT JOIN "profiles" p ON p."userId" = m."userId"
       WHERE m."clubId" = $1 ORDER BY (p."avatarUrl" IS NULL), m."joinedAt" LIMIT 6`,
      [club.id],
    );
    const [owner] = await this.dataSource.query(
      `SELECT COALESCE(p."displayName", u."displayName", 'Runner') AS "displayName", p."username", p."verifiedAt" IS NOT NULL AS "verified"
       FROM "users" u LEFT JOIN "profiles" p ON p."userId" = u."id" WHERE u."id" = $1`,
      [club.ownerUserId],
    );
    const { inviteCode: code, verifiedAt, plan, planRenewsAt, suspendedAt, suspendedReason, ...page } = club;
    const manager = role === 'owner' || role === 'admin';
    return {
      ...page,
      verified: Boolean(verifiedAt),
      suspended: Boolean(suspendedAt),
      // Only the club's managers see why, and its plan.
      ...(manager ? { suspendedReason, plan: planOf(plan, planRenewsAt) } : {}),
      ...counts,
      faces,
      owner: owner ?? null,
      myRole: role,
      inviteValid: Boolean(invite && invite.toUpperCase() === code),
      // Any member can share the club; managers can also reset the link.
      ...(role ? { inviteCode: code } : {}),
    };
  }

  async update(actorId: string, clubRef: string, input: UpdateClubDto) {
    const club = await this.find(clubRef);
    await this.assertManager(club.id, actorId);
    const text = (value: string | undefined, current: string | null) => (value === undefined ? current : value.trim() || null);
    if (input.name !== undefined) club.name = input.name.trim();
    club.description = text(input.description, club.description);
    club.location = text(input.location, club.location);
    club.instagram = input.instagram === undefined ? club.instagram : input.instagram.trim().replace(/^@/, '') || null;
    if (input.website !== undefined) {
      const site = input.website.trim();
      if (site && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(site)) throw new BadRequestException('Enter a web address like club.com');
      club.website = site ? (/^https?:\/\//i.test(site) ? site : `https://${site}`) : null;
    }
    if (input.accentColor) club.accentColor = input.accentColor.toUpperCase();
    if (input.privacy) club.privacy = input.privacy;
    if (input.chatLocked !== undefined) club.chatLocked = input.chatLocked;
    await this.clubs.save(club);
    return this.get(club.id, actorId);
  }

  async setLogo(actorId: string, clubRef: string, file: { buffer: Buffer; mimetype: string } | undefined) {
    const club = await this.find(clubRef);
    await this.assertManager(club.id, actorId);
    if (!file) throw new BadRequestException('Choose an image to upload');
    if (!AVATAR_TYPES.includes(file.mimetype)) throw new BadRequestException('Use a JPG, PNG, WebP or HEIC image');
    club.logoUrl = await this.cloudinary.uploadClubLogo(club.id, file);
    await this.clubs.save(club);
    return this.get(club.id, actorId);
  }

  async removeLogo(actorId: string, clubRef: string) {
    const club = await this.find(clubRef);
    await this.assertManager(club.id, actorId);
    if (club.logoUrl) await this.cloudinary.removeClubLogo(club.id);
    club.logoUrl = null;
    await this.clubs.save(club);
    return this.get(club.id, actorId);
  }

  /** Anyone can see who's in an open club; an invite-only club shows its members to members. */
  async members(clubRef: string, viewerId?: string | null) {
    const club = await this.find(clubRef);
    if (club.privacy === 'invite' && !(await this.roleOf(club.id, viewerId))) throw new ForbiddenException('Join this club to see its members');
    return this.dataSource.query(
      `SELECT m."id", m."userId", m."role", m."joinedAt", p."username", p."avatarUrl", p."countryCode",
              CASE WHEN p."gender"='male' THEN 'masculine' WHEN p."gender"='female' THEN 'feminine' ELSE 'neutral' END "avatarStyle", p."verifiedAt" IS NOT NULL AS "verified",
              COALESCE(p."displayName", u."displayName", 'Runner') AS "displayName"
       FROM "club_memberships" m JOIN "users" u ON u."id" = m."userId" LEFT JOIN "profiles" p ON p."userId" = m."userId"
       WHERE m."clubId" = $1
       ORDER BY CASE m."role" WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m."joinedAt" ASC
       LIMIT 500`,
      [club.id],
    );
  }

  async monthLeaderboard(userId: string, clubRef: string) {
    const club = await this.find(clubRef);
    if (!(await this.roleOf(club.id, userId))) throw new ForbiddenException('Join this club to see its leaderboard');
    return this.dataSource.query(
      `SELECT row_number() OVER (ORDER BY COALESCE(SUM(GREATEST(a."validatedDistanceMetres",a."stepDistanceMetres")),0) DESC,m."joinedAt" ASC)::integer "rank",
              m."userId",COALESCE(p."displayName",u."displayName",'Runner') "displayName",p."username",p."avatarUrl",
              CASE WHEN p."gender"='male' THEN 'masculine' WHEN p."gender"='female' THEN 'feminine' ELSE 'neutral' END "avatarStyle", p."verifiedAt" IS NOT NULL AS "verified",
              COALESCE(SUM(GREATEST(a."validatedDistanceMetres",a."stepDistanceMetres")),0)::integer "monthMetres"
       FROM "club_memberships" m JOIN "users" u ON u."id"=m."userId"
       LEFT JOIN "profiles" p ON p."userId"=m."userId"
       LEFT JOIN "activities" a ON a."userId"=m."userId" AND a."verificationStatus"='VERIFIED' AND a."activityType" IN ('run','walk')
         AND a."startedAt">=date_trunc('month',now()) AND a."startedAt"<date_trunc('month',now())+interval '1 month'
       WHERE m."clubId"=$1 GROUP BY m."userId",m."joinedAt",p."displayName",u."displayName",p."username",p."avatarUrl",p."gender",p."verifiedAt"
       ORDER BY "monthMetres" DESC,m."joinedAt" ASC LIMIT 500`, [club.id],
    );
  }

  /**
   * The club's published challenges in three lists: live, upcoming (open to join, not started yet) and
   * past, with each past one's top three and prize winners. Drafts and scheduled ones are only on the
   * dashboard. Past challenges stay listed even when archived.
   */
  async competitions(clubRef: string, viewerId?: string | null) {
    const club = await this.find(clubRef);
    const member = Boolean(await this.roleOf(club.id, viewerId));
    if (club.privacy === 'invite' && !member) return { live: [], upcoming: [], past: [] };
    const rows = await this.dataSource.query(
      `SELECT t.*, (SELECT count(*) FROM "table_registrations" r WHERE r."tableId" = t."id" AND r."userId" <> t."creatorId")::integer AS "entrantCount",
              EXISTS (SELECT 1 FROM "table_registrations" r WHERE r."tableId" = t."id" AND r."userId" = $2) AS "joined",
              EXISTS (SELECT 1 FROM "competition_prizes" p WHERE p."tableId" = t."id") AS "hasPrizes",
              (SELECT p."productName" FROM "competition_prizes" p WHERE p."tableId" = t."id" ORDER BY p."position" LIMIT 1) AS "topPrize",
              CASE WHEN t."status" = 'SETTLED' OR (t."scoringClosesAt" IS NOT NULL AND t."scoringClosesAt" <= now()) THEN 'past'
                   WHEN t."startsAt" > now() THEN 'upcoming' ELSE 'live' END AS "section",
              CASE WHEN t."status" = 'SETTLED' OR (t."scoringClosesAt" IS NOT NULL AND t."scoringClosesAt" <= now()) THEN (
                SELECT json_agg(x ORDER BY x."rank") FROM (
                  SELECT row_number() OVER (ORDER BY ${RANK_ORDER})::integer AS "rank", COALESCE(p."displayName", u."displayName", 'Runner') AS "displayName", p."username", p."avatarUrl"
                  FROM "table_registrations" r JOIN "users" u ON u."id" = r."userId" LEFT JOIN "profiles" p ON p."userId" = r."userId"
                  WHERE r."tableId" = t."id" AND r."userId" <> t."creatorId" AND r."score" IS NOT NULL ORDER BY ${RANK_ORDER} LIMIT 3) x) END AS "podium"
       FROM "competition_tables" t
       WHERE t."communityId" = $1 AND t."status" NOT IN ('CANCELLED','PENDING_FUNDING','PENDING_APPROVAL','DRAFT','SCHEDULED')
         AND ($3 OR t."visibility" = 'public')
         AND (t."archivedAt" IS NULL OR t."status" = 'SETTLED' OR t."scoringClosesAt" <= now())
       ORDER BY t."startsAt" ASC NULLS LAST
       LIMIT 200`,
      [club.id, viewerId ?? null, member],
    ) as Array<Record<string, unknown> & { section: 'live' | 'upcoming' | 'past'; scoringClosesAt: Date | null }>;
    const pick = (section: string) => rows.filter((row) => row.section === section);
    return {
      live: pick('live').sort((a, b) => (a.scoringClosesAt?.getTime() ?? Infinity) - (b.scoringClosesAt?.getTime() ?? Infinity)),
      upcoming: pick('upcoming'),
      past: pick('past').sort((a, b) => (b.scoringClosesAt?.getTime() ?? 0) - (a.scoringClosesAt?.getTime() ?? 0)).slice(0, 30),
    };
  }

  /** Follow a club to see its challenges and hear about new ones, without joining it. */
  async follow(userId: string, clubRef: string, following: boolean) {
    const club = await this.find(clubRef);
    if (following) await this.dataSource.query(`INSERT INTO "club_follows" ("clubId","userId") VALUES ($1,$2) ON CONFLICT DO NOTHING`, [club.id, userId]);
    else {
      if (await this.roleOf(club.id, userId) === 'owner') throw new ConflictException('The owner always follows their club');
      await this.dataSource.query(`DELETE FROM "club_follows" WHERE "clubId" = $1 AND "userId" = $2`, [club.id, userId]);
    }
    const [{ followerCount }] = await this.dataSource.query(`SELECT count(*)::integer AS "followerCount" FROM "club_follows" WHERE "clubId" = $1`, [club.id]) as Array<{ followerCount: number }>;
    return { following, followerCount };
  }

  /**
   * Join from the club page: open clubs let anyone in, invite-only clubs need the invite in the link.
   * New members go straight into the club's live free competitions.
   */
  async join(userId: string, clubRef: string, invite?: string) {
    const club = await this.find(clubRef);
    if (club.privacy === 'invite' && invite?.toUpperCase() !== club.inviteCode) {
      throw new ForbiddenException('This club is invite-only. Ask a manager for the invite link.');
    }
    return this.dataSource.transaction(async (manager) => {
      const inserted = await manager.query(
        `INSERT INTO "club_memberships" ("clubId", "userId", "role") VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING RETURNING "id"`,
        [club.id, userId],
      ) as unknown[];
      await manager.query(`INSERT INTO "club_follows" ("clubId","userId") VALUES ($1,$2) ON CONFLICT DO NOTHING`, [club.id, userId]);
      if (!inserted.length) return { joined: true, competitions: 0 };
      const enrolled = await enrolClubMembers(manager, { clubId: club.id, userId });
      await this.notifyManagers(manager, club, userId, 'joined');
      return { joined: true, competitions: enrolled.length };
    });
  }

  async leave(userId: string, clubRef: string) {
    const club = await this.find(clubRef);
    const role = await this.roleOf(club.id, userId);
    if (!role) return { left: true };
    if (role === 'owner') throw new ConflictException('The owner can’t leave their own club');
    await this.memberships.delete({ clubId: club.id, userId });
    return { left: true };
  }

  /** Managers add a runner by @username; they're entered into live club competitions like anyone who joins. */
  async addMember(actorId: string, clubRef: string, runner: { username?: string; userId?: string }) {
    const club = await this.find(clubRef);
    await this.assertManager(club.id, actorId);
    const username = runner.username?.trim().replace(/^@/, '').toLowerCase();
    if (!username && !runner.userId) throw new BadRequestException('Enter the runner’s username');
    const profile = await this.profiles.findOne({ where: username ? { username } : { userId: runner.userId } });
    if (!profile) throw new NotFoundException(username ? `No runner with the username @${username}` : 'Runner not found');
    try {
      return await this.dataSource.transaction(async (manager) => {
        const membership = await manager.save(ClubMembership, manager.create(ClubMembership, { clubId: club.id, userId: profile.userId, role: 'member' }));
        await manager.query(`INSERT INTO "club_follows" ("clubId","userId") VALUES ($1,$2) ON CONFLICT DO NOTHING`, [club.id, profile.userId]);
        await enrolClubMembers(manager, { clubId: club.id, userId: profile.userId });
        await manager.query(
          `INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,'CLUB_ADDED',$2,$3,$4)`,
          [profile.userId, `You’re in ${club.name}`, 'A club manager added you. Club competitions count you in automatically.', `/clubs/${club.slug}`],
        );
        return { ...membership, username: profile.username, displayName: profile.displayName };
      });
    } catch (error) {
      if (isDuplicate(error)) throw new ConflictException(`@${profile.username} is already a member`);
      throw error;
    }
  }

  /** The owner makes members managers (role admin) or back again. */
  async setRole(actorId: string, clubRef: string, userId: string, role: 'admin' | 'member') {
    const club = await this.find(clubRef);
    if ((await this.roleOf(club.id, actorId)) !== 'owner') throw new ForbiddenException('Only the club owner can change roles');
    const membership = await this.memberships.findOne({ where: { clubId: club.id, userId } });
    if (!membership) throw new NotFoundException('That person isn’t in this club');
    if (membership.role === 'owner') throw new ConflictException('The owner’s role can’t change');
    membership.role = role;
    await this.memberships.save(membership);
    if (role === 'admin') {
      await this.dataSource.query(
        `INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,'CLUB_ROLE',$2,$3,$4)`,
        [userId, `You’re a manager of ${club.name}`, 'You can now edit the club, invite people and host club competitions.', `/clubs/${club.slug}`],
      );
    }
    return membership;
  }

  /** The owner removes anyone; managers remove members (not other managers). */
  async removeMember(actorId: string, clubRef: string, userId: string) {
    const club = await this.find(clubRef);
    const actorRole = await this.assertManager(club.id, actorId);
    const target = await this.memberships.findOne({ where: { clubId: club.id, userId } });
    if (!target) return { removed: true };
    if (target.role === 'owner') throw new ForbiddenException('The owner can’t be removed');
    if (target.role === 'admin' && actorRole !== 'owner') throw new ForbiddenException('Only the owner can remove a manager');
    await this.memberships.delete({ id: target.id });
    return { removed: true };
  }

  /**
   * Email invitations with the club's invite link. People already on Jump also get a notification; new
   * people land on the club page, sign up, and are joined on the way back.
   */
  async invite(actorId: string, clubRef: string, emails: string[]) {
    const club = await this.find(clubRef);
    await this.assertManager(club.id, actorId);
    const addresses = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
    if (!addresses.length) throw new BadRequestException('Add at least one email address');
    const link = `/clubs/${club.slug}?invite=${club.inviteCode}`;
    const url = `${this.config.getOrThrow<string>('WEB_ORIGIN')}${link}`;
    const [inviter] = await this.dataSource.query(
      `SELECT COALESCE(p."displayName", u."displayName", 'A Jump runner') AS "name" FROM "users" u LEFT JOIN "profiles" p ON p."userId" = u."id" WHERE u."id" = $1`,
      [actorId],
    ) as Array<{ name: string }>;
    const existing = await this.dataSource.query(
      `SELECT u."id", lower(u."email") AS "email", EXISTS (SELECT 1 FROM "club_memberships" m WHERE m."clubId" = $2 AND m."userId" = u."id") AS "member"
       FROM "users" u WHERE lower(u."email") = ANY($1::text[])`,
      [addresses, club.id],
    ) as Array<{ id: string; email: string; member: boolean }>;
    const members = new Set(existing.filter((row) => row.member).map((row) => row.email));
    const toInvite = addresses.filter((address) => !members.has(address));
    for (const address of toInvite) this.mail.sendInBackground(clubInviteEmail({ address }, club.name, inviter?.name ?? 'A Jump runner', url));
    const onJump = existing.filter((row) => !row.member);
    if (onJump.length) {
      await this.dataSource.query(
        `INSERT INTO "notifications" ("userId","type","title","body","link") SELECT unnest($1::uuid[]),'CLUB_INVITE',$2,$3,$4`,
        [onJump.map((row) => row.id), `Join ${club.name}`, `${inviter?.name ?? 'A club manager'} invited you to the club.`, link],
      );
    }
    return { invited: toInvite.length, alreadyMembers: members.size };
  }

  /** A new invite code; links with the old one stop working for invite-only clubs. */
  async resetInvite(actorId: string, clubRef: string) {
    const club = await this.find(clubRef);
    await this.assertManager(club.id, actorId);
    club.inviteCode = inviteCode();
    await this.clubs.save(club);
    return { inviteCode: club.inviteCode };
  }

  private async notifyManagers(manager: DataSource['manager'], club: Club, userId: string, event: 'joined') {
    if (event !== 'joined') return;
    await manager.query(
      `INSERT INTO "notifications" ("userId","type","title","body","link")
       SELECT m."userId", 'CLUB_JOINED', COALESCE(p."displayName", u."displayName", 'Someone') || ' joined ' || $2, 'Say hello on the club page.', $3
       FROM "club_memberships" m, "users" u LEFT JOIN "profiles" p ON p."userId" = u."id"
       WHERE m."clubId" = $1 AND m."role" IN ('owner','admin') AND u."id" = $4 AND m."userId" <> $4`,
      [club.id, club.name, `/clubs/${club.slug}`, userId],
    );
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
