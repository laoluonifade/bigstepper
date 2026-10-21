import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class MessagesService {
  constructor(private readonly dataSource: DataSource) {}

  private async recipient(username: string) {
    const [runner] = await this.dataSource.query(
      `SELECT "userId","username","displayName","avatarUrl" FROM "profiles" WHERE lower("username")=lower($1)`,
      [username],
    ) as Array<{ userId: string; username: string; displayName: string; avatarUrl: string | null }>;
    if (!runner) throw new NotFoundException('Runner not found');
    return runner;
  }

  async inbox(userId: string) {
    return this.dataSource.query(
      `WITH latest AS (
         SELECT DISTINCT ON (peer) peer,"body","createdAt","senderId"
         FROM (
           SELECT CASE WHEN "senderId"=$1 THEN "recipientId" ELSE "senderId" END peer,
                  "body","createdAt","senderId","id"
           FROM "direct_messages" WHERE "senderId"=$1 OR "recipientId"=$1
         ) m ORDER BY peer,"createdAt" DESC,"id" DESC
       )
       , unread AS (
         SELECT "senderId",COUNT(*)::integer "count" FROM "direct_messages"
         WHERE "recipientId"=$1 AND "readAt" IS NULL GROUP BY "senderId"
       )
       SELECT l."body",l."createdAt",l."senderId",p."username",p."displayName",p."avatarUrl",
              COALESCE(u."count",0) "unreadCount"
       FROM latest l JOIN "profiles" p ON p."userId"=l.peer
       LEFT JOIN unread u ON u."senderId"=l.peer
       ORDER BY l."createdAt" DESC LIMIT 50`, [userId],
    );
  }

  async unreadCount(userId: string) {
    const [row] = await this.dataSource.query(
      `SELECT COUNT(*)::integer "count" FROM "direct_messages" WHERE "recipientId"=$1 AND "readAt" IS NULL`,
      [userId],
    ) as Array<{ count: number }>;
    return { count: row.count };
  }

  async markRead(userId: string, username: string) {
    const runner = await this.recipient(username);
    if (runner.userId === userId) throw new BadRequestException('You cannot message yourself');
    await this.dataSource.query(
      `UPDATE "direct_messages" SET "readAt"=now()
       WHERE "senderId"=$1 AND "recipientId"=$2 AND "readAt" IS NULL`,
      [runner.userId, userId],
    );
    return { read: true };
  }

  async conversation(userId: string, username: string) {
    const runner = await this.recipient(username);
    if (runner.userId === userId) throw new BadRequestException('You cannot message yourself');
    const messages = await this.dataSource.query(
      `SELECT m."id",m."senderId",m."recipientId",m."body",m."createdAt",
              i."id" "invitationId",i."status" "invitationStatus",t."id" "tableId",t."code" "tableCode",
              t."title" "tableTitle",t."type" "tableType",t."status" "tableStatus",
              t."guaranteedPrizeKobo",t."entryFeeKobo",m."replyToId",reply."body" "replyToBody",
              reply."senderId" "replyToSenderId"
       FROM "direct_messages" m
       LEFT JOIN "challenge_invitations" i ON i."id"=m."invitationId"
       LEFT JOIN "competition_tables" t ON t."id"=i."tableId"
       LEFT JOIN "direct_messages" reply ON reply."id"=m."replyToId"
       WHERE (m."senderId"=$1 AND m."recipientId"=$2) OR (m."senderId"=$2 AND m."recipientId"=$1)
       ORDER BY m."createdAt" DESC,m."id" DESC LIMIT 100`, [userId, runner.userId],
    ) as Array<Record<string, unknown> & { id: string }>;
    const reactions = messages.length ? await this.dataSource.query(
      `SELECT "messageId","userId","reaction" FROM "direct_message_reactions" WHERE "messageId"=ANY($1::uuid[])`,
      [messages.map((message) => message.id)],
    ) as Array<{ messageId: string; userId: string; reaction: string }> : [];
    const byMessage = new Map<string, Array<{ userId: string; reaction: string }>>();
    for (const reaction of reactions) {
      const bucket = byMessage.get(reaction.messageId) ?? [];
      bucket.push({ userId: reaction.userId, reaction: reaction.reaction });
      byMessage.set(reaction.messageId, bucket);
    }
    return { runner, canMessage: true, messages: messages.reverse().map((message) => ({ ...message, reactions: byMessage.get(message.id) ?? [] })) };
  }

  async send(userId: string, username: string, body: string, replyToId?: string) {
    const trimmed = body.trim();
    if (!trimmed) throw new BadRequestException('Write a message');
    const runner = await this.recipient(username);
    if (runner.userId === userId) throw new BadRequestException('You cannot message yourself');
    if (replyToId) {
      const reply = await this.dataSource.query(
        `SELECT 1 FROM "direct_messages" WHERE "id"=$1 AND (("senderId"=$2 AND "recipientId"=$3) OR ("senderId"=$3 AND "recipientId"=$2))`,
        [replyToId, userId, runner.userId],
      ) as unknown[];
      if (!reply.length) throw new BadRequestException('Choose a message from this conversation to reply to');
    }
    const [message] = await this.dataSource.query(
      `INSERT INTO "direct_messages" ("senderId","recipientId","body","replyToId") VALUES ($1,$2,$3,$4)
       RETURNING "id","senderId","recipientId","body","replyToId","createdAt"`, [userId, runner.userId, trimmed, replyToId ?? null],
    );
    return message;
  }

  async react(userId: string, messageId: string, reaction: string | null) {
    const allowed = await this.dataSource.query(
      `SELECT 1 FROM "direct_messages" WHERE "id"=$1 AND ("senderId"=$2 OR "recipientId"=$2)`,
      [messageId, userId],
    ) as unknown[];
    if (!allowed.length) throw new NotFoundException('Message not found');
    if (reaction) {
      await this.dataSource.query(
        `INSERT INTO "direct_message_reactions" ("messageId","userId","reaction") VALUES ($1,$2,$3)
         ON CONFLICT ("messageId","userId") DO UPDATE SET "reaction"=EXCLUDED."reaction"`,
        [messageId, userId, reaction],
      );
    } else {
      await this.dataSource.query(`DELETE FROM "direct_message_reactions" WHERE "messageId"=$1 AND "userId"=$2`, [messageId, userId]);
    }
    return { reaction };
  }
}
