import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { CloudinaryService } from './cloudinary.service';
import { Profile } from './profile.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';

export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
export const AVATAR_MAX_BYTES = 8 * 1024 * 1024;

/** Verified distance: GPS, or steps × stride when larger (indoors) — what leagues credit. */
const DISTANCE = 'GREATEST(a."validatedDistanceMetres", a."stepDistanceMetres")';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
    private readonly dataSource: DataSource,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async getMine(userId: string) {
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  async updateMine(userId: string, input: UpdateProfileDto) {
    const profile = await this.getMine(userId);
    // Only fields actually sent: assigning `undefined` for the rest blanked them in the response.
    const changes: Partial<Profile> = {};
    if (input.username !== undefined) changes.username = input.username.toLowerCase();
    if (input.displayName !== undefined) {
      const name = input.displayName.trim();
      if (!name) throw new BadRequestException('Display name can’t be empty');
      changes.displayName = name;
    }
    if (input.preferredUnit !== undefined) changes.preferredUnit = input.preferredUnit;
    if (input.activityVisibility !== undefined) changes.activityVisibility = input.activityVisibility;
    if (input.countryCode !== undefined) changes.countryCode = input.countryCode;
    if (input.bio !== undefined) changes.bio = input.bio?.trim() || null;
    if (input.weeklyGoalMetres !== undefined) changes.weeklyGoalMetres = input.weeklyGoalMetres;
    Object.assign(profile, changes);
    try {
      const saved = await this.profiles.save(profile);
      // Challenge leaderboards and emails read the account's name; keep it the same as the profile's.
      if (changes.displayName) await this.dataSource.query(`UPDATE "users" SET "displayName" = $2 WHERE "id" = $1`, [userId, changes.displayName]);
      return saved;
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505'
      ) {
        throw new ConflictException('Username is already in use');
      }
      throw error;
    }
  }

  async setAvatar(userId: string, file: { buffer: Buffer; mimetype: string; size: number } | undefined) {
    if (!file) throw new BadRequestException('Choose a photo to upload');
    if (!AVATAR_TYPES.includes(file.mimetype)) throw new BadRequestException('Use a JPG, PNG, WebP or HEIC photo');
    const profile = await this.getMine(userId);
    profile.avatarUrl = await this.cloudinary.uploadAvatar(userId, file);
    return this.profiles.save(profile);
  }

  async removeAvatar(userId: string) {
    const profile = await this.getMine(userId);
    if (profile.avatarUrl) await this.cloudinary.removeAvatar(userId);
    profile.avatarUrl = null;
    return this.profiles.save(profile);
  }

  private async byUsername(username: string) {
    const profile = await this.profiles.findOne({ where: { username: username.toLowerCase().replace(/^@/, '') } });
    if (!profile) throw new NotFoundException('Runner not found');
    return profile;
  }

  async search(query: string, viewerId: string) {
    const term = query.trim().replace(/^@/, '').slice(0, 50);
    if (term.length < 2) return [];
    const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
    return this.dataSource.query(
      `SELECT p."username",p."displayName",p."avatarUrl",p."bio",
              (p."userId"=$3) "isMe",
              EXISTS (SELECT 1 FROM "follows" f WHERE f."followerId"=$3 AND f."followingId"=p."userId") "followedByMe"
       FROM "profiles" p WHERE p."username" ILIKE $1 ESCAPE '\\' OR p."displayName" ILIKE $1 ESCAPE '\\'
       ORDER BY CASE WHEN lower(p."username")=lower($2) THEN 0 WHEN lower(p."username") LIKE lower($2)||'%' THEN 1 ELSE 2 END,
                p."username" ASC LIMIT 20`, [pattern, term, viewerId],
    );
  }

  /**
   * Verified aggregate totals are public. Dated activities still follow the runner's visibility
   * setting; never expose routes (a start point is often someone's front door).
   */
  async getPublic(username: string, viewerId?: string | null) {
    const profile = await this.byUsername(username);
    const isMe = viewerId === profile.userId;
    const [counts] = await this.dataSource.query(
      `SELECT (SELECT COUNT(*) FROM "follows" WHERE "followingId" = $1)::integer "followers",
              (SELECT COUNT(*) FROM "follows" WHERE "followerId" = $1)::integer "following",
              EXISTS (SELECT 1 FROM "follows" WHERE "followerId" = $2 AND "followingId" = $1) "followedByMe",
              EXISTS (SELECT 1 FROM "follows" WHERE "followerId" = $1 AND "followingId" = $2) "followsMe"`,
      [profile.userId, viewerId ?? null],
    );
    const runsVisible =
      isMe || profile.activityVisibility === 'public' || (profile.activityVisibility === 'followers' && counts.followedByMe);
    const base = {
      username: profile.username,
      displayName: profile.displayName,
      countryCode: profile.countryCode,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      memberSince: profile.createdAt,
      runsVisible,
      isMe,
      followers: counts.followers,
      following: counts.following,
      followedByMe: counts.followedByMe,
      followsMe: counts.followsMe,
    };
    const [totals] = await this.dataSource.query(
      `SELECT COALESCE(SUM(${DISTANCE}), 0)::bigint "totalMetres",
              COUNT(*)::integer "activities",
              COUNT(*) FILTER (WHERE a."activityType" = 'run')::integer "runs",
              COUNT(*) FILTER (WHERE a."activityType" = 'walk')::integer "walks",
              COALESCE(SUM(${DISTANCE}) FILTER (WHERE a."activityType" = 'run'), 0)::bigint "runMetres",
              COALESCE(SUM(${DISTANCE}) FILTER (WHERE a."activityType" = 'walk'), 0)::bigint "walkMetres",
              COALESCE(MAX(${DISTANCE}), 0)::integer "longestMetres",
              COALESCE(SUM(a."movingSeconds"), 0)::bigint "movingSeconds",
              COALESCE(SUM(${DISTANCE}) FILTER (WHERE a."startedAt" >= date_trunc('month', now())), 0)::bigint "monthMetres"
       FROM "activities" a WHERE a."userId" = $1 AND a."verificationStatus" = 'VERIFIED'`,
      [profile.userId],
    );
    const stats = Object.fromEntries(Object.entries(totals as Record<string, string | number>).map(([key, value]) => [key, Number(value)]));
    if (!runsVisible) return { ...base, stats };

    const recent = await this.dataSource.query(
      `SELECT a."activityType", a."startedAt", ${DISTANCE}::integer "metres", a."movingSeconds"
       FROM "activities" a WHERE a."userId" = $1 AND a."verificationStatus" = 'VERIFIED'
       ORDER BY a."startedAt" DESC LIMIT 8`,
      [profile.userId],
    );
    return {
      ...base,
      stats,
      recent,
    };
  }

  async follow(followerId: string, username: string) {
    const target = await this.byUsername(username);
    if (target.userId === followerId) throw new BadRequestException('You can’t follow yourself');
    const created = await this.dataSource.query(
      `INSERT INTO "follows" ("followerId", "followingId") VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING "followerId"`,
      [followerId, target.userId],
    );
    if (created.length) {
      const follower = await this.getMine(followerId);
      await this.dataSource.query(`INSERT INTO "notifications" ("userId", "type", "title", "body") VALUES ($1, 'NEW_FOLLOWER', $2, $3)`, [
        target.userId,
        `${follower.displayName} followed you`,
        `@${follower.username} now follows your walks and runs.`,
      ]);
    }
    return { following: true };
  }

  async unfollow(followerId: string, username: string) {
    const target = await this.byUsername(username);
    await this.dataSource.query(`DELETE FROM "follows" WHERE "followerId" = $1 AND "followingId" = $2`, [followerId, target.userId]);
    return { following: false };
  }

  /** Followers of (or runners followed by) `username`, newest first. */
  async connections(username: string, direction: 'followers' | 'following', viewerId?: string | null) {
    const profile = await this.byUsername(username);
    const [mine, theirs] = direction === 'followers' ? ['followingId', 'followerId'] : ['followerId', 'followingId'];
    return this.dataSource.query(
      `SELECT p."username", p."displayName", p."avatarUrl", p."bio",
              EXISTS (SELECT 1 FROM "follows" v WHERE v."followerId" = $2 AND v."followingId" = f."${theirs}") "followedByMe",
              COALESCE(f."${theirs}" = $2, false) "isMe"
       FROM "follows" f JOIN "profiles" p ON p."userId" = f."${theirs}"
       WHERE f."${mine}" = $1 ORDER BY f."createdAt" DESC LIMIT 200`,
      [profile.userId, viewerId ?? null],
    );
  }
}
