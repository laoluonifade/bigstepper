import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateFeedPostDto } from './create-feed-post.dto';

@Injectable()
export class FeedService {
  constructor(private readonly dataSource: DataSource) {}

  async list(viewerId: string, scope = 'following', page = '0') {
    if (scope !== 'following' && scope !== 'explore') throw new BadRequestException('Invalid feed scope');
    if (!/^(0|[1-9]\d{0,3})$/.test(page)) throw new BadRequestException('Invalid feed page');
    return this.dataSource.query(
      `SELECT f."id", f."body", f."createdAt", f."userId", f."activityId",
              p."username", p."displayName", p."avatarUrl", p."activityVisibility",
              a."activityType", a."startedAt", a."validatedSteps",
              GREATEST(a."validatedDistanceMetres", a."stepDistanceMetres") "distanceMetres",
              a."movingSeconds",
              (SELECT COUNT(*)::integer FROM "feed_post_reactions" reactions WHERE reactions."postId"=f."id") "reactionCount",
              (SELECT reactions."reaction" FROM "feed_post_reactions" reactions WHERE reactions."postId"=f."id" AND reactions."userId"=$1) "myReaction",
              (SELECT COUNT(*)::integer FROM "feed_comments" comments WHERE comments."postId"=f."id") "commentCount"
       FROM "feed_posts" f
       JOIN "profiles" p ON p."userId"=f."userId"
       LEFT JOIN "activities" a ON a."id"=f."activityId" AND a."verificationStatus"='VERIFIED'
       WHERE (f."userId"=$1 OR p."activityVisibility"='public' OR
              (p."activityVisibility"='followers' AND EXISTS (
                SELECT 1 FROM "follows" follow WHERE follow."followerId"=$1 AND follow."followingId"=f."userId"
              )))
         AND ($2='explore' OR f."userId"=$1 OR EXISTS (
           SELECT 1 FROM "follows" follow WHERE follow."followerId"=$1 AND follow."followingId"=f."userId"
         ))
         AND ($2='following' OR p."activityVisibility"='public')
         AND (f."activityId" IS NULL OR a."id" IS NOT NULL)
       ORDER BY f."createdAt" DESC, f."id" DESC LIMIT 20 OFFSET $3`,
      [viewerId, scope, Number(page) * 20],
    );
  }

  async post(viewerId: string, postId: string) {
    const [post] = await this.dataSource.query(
      `SELECT f."id",f."body",f."createdAt",f."userId",f."activityId",
              p."username",p."displayName",p."avatarUrl",p."activityVisibility",
              a."activityType",a."startedAt",a."validatedSteps",
              GREATEST(a."validatedDistanceMetres",a."stepDistanceMetres") "distanceMetres",a."movingSeconds",
              (SELECT COUNT(*)::integer FROM "feed_post_reactions" r WHERE r."postId"=f."id") "reactionCount",
              (SELECT r."reaction" FROM "feed_post_reactions" r WHERE r."postId"=f."id" AND r."userId"=$1) "myReaction",
              (SELECT COUNT(*)::integer FROM "feed_comments" c WHERE c."postId"=f."id") "commentCount"
       FROM "feed_posts" f JOIN "profiles" p ON p."userId"=f."userId"
       LEFT JOIN "activities" a ON a."id"=f."activityId" AND a."verificationStatus"='VERIFIED'
       WHERE f."id"=$2 AND (f."activityId" IS NULL OR a."id" IS NOT NULL)
         AND (f."userId"=$1 OR p."activityVisibility"='public' OR
           (p."activityVisibility"='followers' AND EXISTS (
             SELECT 1 FROM "follows" fol WHERE fol."followerId"=$1 AND fol."followingId"=f."userId")))`,
      [viewerId, postId],
    ) as Array<Record<string, unknown>>;
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  private async assertVisible(viewerId: string, postId: string) {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM "feed_posts" f JOIN "profiles" p ON p."userId"=f."userId"
       LEFT JOIN "activities" a ON a."id"=f."activityId" AND a."verificationStatus"='VERIFIED'
       WHERE f."id"=$1 AND (f."activityId" IS NULL OR a."id" IS NOT NULL)
         AND (f."userId"=$2 OR p."activityVisibility"='public' OR
           (p."activityVisibility"='followers' AND EXISTS (
             SELECT 1 FROM "follows" fol WHERE fol."followerId"=$2 AND fol."followingId"=f."userId")))`,
      [postId, viewerId],
    ) as unknown[];
    if (!rows.length) throw new NotFoundException('Post not found');
  }

  async react(viewerId: string, postId: string, reaction: string) {
    await this.assertVisible(viewerId, postId);
    await this.dataSource.query(
      `INSERT INTO "feed_post_reactions" ("postId","userId","reaction") VALUES ($1,$2,$3)
       ON CONFLICT ("postId","userId") DO UPDATE SET "reaction"=EXCLUDED."reaction"`,
      [postId, viewerId, reaction],
    );
    return { reaction };
  }

  async unreact(viewerId: string, postId: string) {
    await this.assertVisible(viewerId, postId);
    await this.dataSource.query(`DELETE FROM "feed_post_reactions" WHERE "postId"=$1 AND "userId"=$2`, [postId, viewerId]);
    return { reaction: null };
  }

  async comments(viewerId: string, postId: string) {
    await this.assertVisible(viewerId, postId);
    return this.dataSource.query(
      `SELECT c."id",c."postId",c."userId",c."body",c."createdAt",p."username",p."displayName",p."avatarUrl"
       FROM (SELECT * FROM "feed_comments" WHERE "postId"=$1 ORDER BY "createdAt" DESC,"id" DESC LIMIT 100) c
       JOIN "profiles" p ON p."userId"=c."userId"
       ORDER BY c."createdAt" ASC,c."id" ASC`, [postId],
    );
  }

  async comment(viewerId: string, postId: string, body: string) {
    const trimmed = body.trim();
    if (!trimmed) throw new BadRequestException('Write a comment');
    await this.assertVisible(viewerId, postId);
    const [row] = await this.dataSource.query(
      `INSERT INTO "feed_comments" ("postId","userId","body") VALUES ($1,$2,$3) RETURNING "id","postId","userId","body","createdAt"`,
      [postId, viewerId, trimmed],
    );
    return row;
  }

  async removeComment(viewerId: string, commentId: string) {
    const rows = await this.dataSource.query(`DELETE FROM "feed_comments" WHERE "id"=$1 AND "userId"=$2 RETURNING "id"`, [commentId, viewerId]) as unknown[];
    if (!rows.length) throw new NotFoundException('Comment not found');
    return { deleted: true };
  }

  async create(userId: string, input: CreateFeedPostDto) {
    const body = input.body?.trim() ?? '';
    if (!body && !input.activityId) throw new BadRequestException('Write an update or choose an activity');
    if (input.activityId) {
      const owned = (await this.dataSource.query(
        `SELECT "id" FROM "activities" WHERE "id"=$1 AND "userId"=$2 AND "verificationStatus"='VERIFIED'`,
        [input.activityId, userId],
      )) as Array<{ id: string }>;
      if (!owned.length) throw new BadRequestException('Choose one of your verified activities');
    }
    const [post] = await this.dataSource.query(
      `INSERT INTO "feed_posts" ("userId","body","activityId") VALUES ($1,$2,$3)
       RETURNING "id","createdAt"`, [userId, body, input.activityId ?? null],
    );
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
