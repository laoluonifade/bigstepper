import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CloudinaryService } from '../profiles/cloudinary.service';
import { AVATAR_TYPES } from '../profiles/profiles.service';
import { CreateFeedPostDto } from './create-feed-post.dto';
import { extractMentions } from './mentions';

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);
  constructor(private readonly dataSource: DataSource, private readonly cloudinary: CloudinaryService) {}

  private async notify(sql: string, params: unknown[]) {
    try { await this.dataSource.query(sql, params); }
    catch (error) { this.logger.error('Could not create Rant notification', error instanceof Error ? error.stack : String(error)); }
  }

  /** Tells each @mentioned runner (not the author) where they were tagged. */
  private async notifyMentions(authorId: string, postId: string, text: string, where: string) {
    const usernames = extractMentions(text);
    if (!usernames.length) return;
    await this.notify(
      `INSERT INTO "notifications" ("userId","type","title","body","link")
       SELECT tagged."userId",'RANT_MENTION',author."displayName" || ' mentioned you in ' || $4,'Open Jump to see it.','/feed/' || $2
       FROM "profiles" tagged JOIN "profiles" author ON author."userId"=$1
       WHERE lower(tagged."username")=ANY($3::text[]) AND tagged."userId"<>$1`,
      [authorId, postId, usernames, where],
    );
  }

  async list(viewerId: string, scope = 'following', page = '0') {
    if (scope !== 'following' && scope !== 'explore') throw new BadRequestException('Invalid feed scope');
    if (!/^(0|[1-9]\d{0,3})$/.test(page)) throw new BadRequestException('Invalid feed page');
    return this.dataSource.query(
      `SELECT f."id", f."body", f."imageUrl", f."createdAt", f."userId", f."activityId",
              p."username", p."displayName", p."avatarUrl",
              CASE WHEN p."gender"='male' THEN 'masculine' WHEN p."gender"='female' THEN 'feminine' ELSE 'neutral' END "avatarStyle", p."verifiedAt" IS NOT NULL AS "verified",
              a."activityType", a."startedAt", a."validatedSteps",
              GREATEST(a."validatedDistanceMetres", a."stepDistanceMetres") "distanceMetres",
              a."movingSeconds",
              (SELECT COUNT(*)::integer FROM "feed_post_reactions" reactions WHERE reactions."postId"=f."id") "reactionCount",
              (SELECT reactions."reaction" FROM "feed_post_reactions" reactions WHERE reactions."postId"=f."id" AND reactions."userId"=$1) "myReaction",
              (SELECT COUNT(*)::integer FROM "feed_comments" comments WHERE comments."postId"=f."id") "commentCount",
              (SELECT COALESCE(json_agg(top."reaction"), '[]'::json) FROM (
                SELECT r."reaction" FROM "feed_post_reactions" r WHERE r."postId"=f."id"
                GROUP BY r."reaction" ORDER BY COUNT(*) DESC, r."reaction" LIMIT 3) top) "topReactions"
       FROM "feed_posts" f
       JOIN "profiles" p ON p."userId"=f."userId"
       LEFT JOIN "activities" a ON a."id"=f."activityId" AND a."verificationStatus"='VERIFIED'
       WHERE ($2='explore' OR f."userId"=$1 OR EXISTS (
           SELECT 1 FROM "follows" follow WHERE follow."followerId"=$1 AND follow."followingId"=f."userId"
         ))
         AND (f."activityId" IS NULL OR a."id" IS NOT NULL)
       ORDER BY f."createdAt" DESC, f."id" DESC LIMIT 20 OFFSET $3`,
      [viewerId, scope, Number(page) * 20],
    );
  }

  async post(viewerId: string, postId: string) {
    const [post] = await this.dataSource.query(
      `SELECT f."id",f."body",f."imageUrl",f."createdAt",f."userId",f."activityId",
              p."username",p."displayName",p."avatarUrl",
              CASE WHEN p."gender"='male' THEN 'masculine' WHEN p."gender"='female' THEN 'feminine' ELSE 'neutral' END "avatarStyle", p."verifiedAt" IS NOT NULL AS "verified",
              a."activityType",a."startedAt",a."validatedSteps",
              GREATEST(a."validatedDistanceMetres",a."stepDistanceMetres") "distanceMetres",a."movingSeconds",
              (SELECT COUNT(*)::integer FROM "feed_post_reactions" r WHERE r."postId"=f."id") "reactionCount",
              (SELECT r."reaction" FROM "feed_post_reactions" r WHERE r."postId"=f."id" AND r."userId"=$1) "myReaction",
              (SELECT COUNT(*)::integer FROM "feed_comments" c WHERE c."postId"=f."id") "commentCount",
              (SELECT COALESCE(json_agg(top."reaction"), '[]'::json) FROM (
                SELECT r."reaction" FROM "feed_post_reactions" r WHERE r."postId"=f."id"
                GROUP BY r."reaction" ORDER BY COUNT(*) DESC, r."reaction" LIMIT 3) top) "topReactions"
       FROM "feed_posts" f JOIN "profiles" p ON p."userId"=f."userId"
       LEFT JOIN "activities" a ON a."id"=f."activityId" AND a."verificationStatus"='VERIFIED'
       WHERE f."id"=$2 AND (f."activityId" IS NULL OR a."id" IS NOT NULL)`,
      [viewerId, postId],
    ) as Array<Record<string, unknown>>;
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  private async assertVisible(postId: string) {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM "feed_posts" f JOIN "profiles" p ON p."userId"=f."userId"
       LEFT JOIN "activities" a ON a."id"=f."activityId" AND a."verificationStatus"='VERIFIED'
       WHERE f."id"=$1 AND (f."activityId" IS NULL OR a."id" IS NOT NULL)`,
      [postId],
    ) as unknown[];
    if (!rows.length) throw new NotFoundException('Post not found');
  }

  async react(viewerId: string, postId: string, reaction: string) {
    await this.assertVisible(postId);
    const changed = await this.dataSource.query(
      `INSERT INTO "feed_post_reactions" ("postId","userId","reaction") VALUES ($1,$2,$3)
       ON CONFLICT ("postId","userId") DO UPDATE SET "reaction"=EXCLUDED."reaction"
       WHERE "feed_post_reactions"."reaction" IS DISTINCT FROM EXCLUDED."reaction"
       RETURNING "postId"`,
      [postId, viewerId, reaction],
    ) as Array<{ postId: string }>;
    if (changed.length) await this.notify(
      `INSERT INTO "notifications" ("userId","type","title","body","link")
       SELECT f."userId",'RANT_REACTION',p."displayName" || ' reacted to your Rant','Open Jump to see the reaction.','/feed/' || f."id"
       FROM "feed_posts" f JOIN "profiles" p ON p."userId"=$2
       WHERE f."id"=$1 AND f."userId"<>$2`, [postId, viewerId],
    );
    return { reaction };
  }

  async unreact(viewerId: string, postId: string) {
    await this.assertVisible(postId);
    await this.dataSource.query(`DELETE FROM "feed_post_reactions" WHERE "postId"=$1 AND "userId"=$2`, [postId, viewerId]);
    return { reaction: null };
  }

  async comments(viewerId: string, postId: string) {
    await this.assertVisible(postId);
    return this.dataSource.query(
      `SELECT c."id",c."postId",c."userId",c."body",c."createdAt",p."username",p."displayName",p."avatarUrl",
              CASE WHEN p."gender"='male' THEN 'masculine' WHEN p."gender"='female' THEN 'feminine' ELSE 'neutral' END "avatarStyle", p."verifiedAt" IS NOT NULL AS "verified"
       FROM (SELECT * FROM "feed_comments" WHERE "postId"=$1 ORDER BY "createdAt" DESC,"id" DESC LIMIT 100) c
       JOIN "profiles" p ON p."userId"=c."userId"
       ORDER BY c."createdAt" ASC,c."id" ASC`, [postId],
    );
  }

  async comment(viewerId: string, postId: string, body: string) {
    const trimmed = body.trim();
    if (!trimmed) throw new BadRequestException('Write a comment');
    await this.assertVisible(postId);
    const [row] = await this.dataSource.query(
      `INSERT INTO "feed_comments" ("postId","userId","body") VALUES ($1,$2,$3) RETURNING "id","postId","userId","body","createdAt"`,
      [postId, viewerId, trimmed],
    );
    await this.notify(
      `INSERT INTO "notifications" ("userId","type","title","body","link")
       SELECT f."userId",'RANT_COMMENT',p."displayName" || ' commented on your Rant','Open Jump to read the comment.','/feed/' || f."id"
       FROM "feed_posts" f JOIN "profiles" p ON p."userId"=$2
       WHERE f."id"=$1 AND f."userId"<>$2`, [postId, viewerId],
    );
    await this.notifyMentions(viewerId, postId, trimmed, 'a comment');
    return row;
  }

  async removeComment(viewerId: string, commentId: string) {
    const rows = await this.dataSource.query(`DELETE FROM "feed_comments" WHERE "id"=$1 AND "userId"=$2 RETURNING "id"`, [commentId, viewerId]) as unknown[];
    if (!rows.length) throw new NotFoundException('Comment not found');
    return { deleted: true };
  }

  async uploadImage(userId: string, file: { buffer: Buffer; mimetype: string; size: number } | undefined) {
    if (!file) throw new BadRequestException('Choose a photo');
    if (!AVATAR_TYPES.includes(file.mimetype)) throw new BadRequestException('Use a JPG, PNG, WebP or HEIC photo');
    return { url: await this.cloudinary.uploadPostImage(userId, file) };
  }

  async create(userId: string, input: CreateFeedPostDto) {
    const body = input.body?.trim() ?? '';
    if (!body && !input.activityId && !input.imageUrl) throw new BadRequestException('Write an update, add a photo or choose an activity');
    if (input.imageUrl && !this.cloudinary.isOwnPostImage(userId, input.imageUrl)) throw new BadRequestException('Upload the photo again');
    if (input.activityId) {
      const owned = (await this.dataSource.query(
        `SELECT "id" FROM "activities" WHERE "id"=$1 AND "userId"=$2 AND "verificationStatus"='VERIFIED'`,
        [input.activityId, userId],
      )) as Array<{ id: string }>;
      if (!owned.length) throw new BadRequestException('Choose one of your verified activities');
    }
    const [post] = await this.dataSource.query(
      `INSERT INTO "feed_posts" ("userId","body","activityId","imageUrl") VALUES ($1,$2,$3,$4)
       RETURNING "id","createdAt"`, [userId, body, input.activityId ?? null, input.imageUrl ?? null],
    );
    await this.notify(
      `INSERT INTO "notifications" ("userId","type","title","body","link")
       SELECT fol."followerId",'FOLLOWING_POST',p."displayName" || ' posted a Rant','See their latest update on Jump.','/feed/' || $2
       FROM "follows" fol JOIN "profiles" p ON p."userId"=$1
       WHERE fol."followingId"=$1`, [userId, post.id],
    );
    if (body) await this.notifyMentions(userId, post.id, body, 'a Rant');
    return post;
  }

  async remove(userId: string, id: string) {
    const removed = await this.dataSource.query(
      `DELETE FROM "feed_posts" WHERE "id"=$1 AND "userId"=$2 RETURNING "id"`, [id, userId],
    );
    if (!removed.length) throw new NotFoundException('Post not found');
    return { deleted: true };
  }
}
