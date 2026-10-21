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
              a."movingSeconds"
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
