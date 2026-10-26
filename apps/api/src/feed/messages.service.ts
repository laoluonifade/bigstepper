import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CloudinaryService } from '../profiles/cloudinary.service';
import { DataSource } from 'typeorm';

export interface SendExtras {
  replyToId?: string;
  activityId?: string;
  audioUrl?: string;
  audioSeconds?: number;
}

function preview(text: string, voiceNote: boolean, activity: boolean) {
  if (text) return text.length > 140 ? `${text.slice(0, 139).trimEnd()}…` : text;
  if (voiceNote) return '🎤 Voice note';
  return activity ? 'Shared an activity' : 'Sent you a message';
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);
  constructor(private readonly dataSource: DataSource, private readonly cloudinary: CloudinaryService) {}

  private async notify(sql: string, params: unknown[]) {
    try { await this.dataSource.query(sql, params); }
    catch (error) { this.logger.error('Could not create message notification', error instanceof Error ? error.stack : String(error)); }
  }

  private async recipient(username: string) {
    const [runner] = await this.dataSource.query(
      `SELECT "userId","username","displayName","avatarUrl","verifiedAt" IS NOT NULL AS "verified",
              CASE WHEN "gender"='male' THEN 'masculine' WHEN "gender"='female' THEN 'feminine' ELSE 'neutral' END "avatarStyle"
       FROM "profiles" WHERE lower("username")=lower($1)`,
      [username],
    ) as Array<{ userId: string; username: string; displayName: string; avatarUrl: string | null; avatarStyle: string; verified: boolean }>;
    if (!runner) throw new NotFoundException('Runner not found');
    return runner;
  }

  async inbox(userId: string) {
    const [direct, clubs] = await Promise.all([this.directInbox(userId), this.clubInbox(userId)]);
    return [...direct.map((row: Record<string, unknown>) => ({ type: 'direct', ...row })), ...clubs]
      .sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime())
      .slice(0, 60);
  }

  private async clubInbox(userId: string) {
    return this.dataSource.query(
      `SELECT 'club' AS "type", c."slug" AS "clubSlug", c."name" AS "clubName", c."logoUrl", c."accentColor", c."verifiedAt" IS NOT NULL AS "verified",
              (SELECT count(*) FROM "club_memberships" cm WHERE cm."clubId" = c."id")::integer AS "memberCount",
              last."body", last."createdAt", last."kind", COALESCE(p."displayName", u."displayName", 'Someone') AS "senderName", last."senderId",
              (SELECT count(*) FROM "direct_messages" x WHERE x."clubId" = c."id" AND x."senderId" <> $1
                 AND x."createdAt" > COALESCE(r."readAt", m."joinedAt"))::integer AS "unreadCount"
       FROM "club_memberships" m
       JOIN "clubs" c ON c."id" = m."clubId"
       LEFT JOIN "club_chat_reads" r ON r."clubId" = c."id" AND r."userId" = $1
       JOIN LATERAL (
         SELECT d."body", d."createdAt", d."senderId",
                CASE WHEN d."audioUrl" IS NOT NULL THEN 'voice' WHEN d."activityId" IS NOT NULL THEN 'activity' ELSE 'text' END AS "kind"
         FROM "direct_messages" d WHERE d."clubId" = c."id" ORDER BY d."createdAt" DESC, d."id" DESC LIMIT 1
       ) last ON true
       JOIN "users" u ON u."id" = last."senderId" LEFT JOIN "profiles" p ON p."userId" = last."senderId"
       WHERE m."userId" = $1`,
      [userId],
    ) as Promise<Array<Record<string, unknown>>>;
  }

  private async directInbox(userId: string) {
    return this.dataSource.query(
      `WITH latest AS (
         SELECT DISTINCT ON (peer) peer,"body","createdAt","senderId","kind","readAt"
         FROM (
           SELECT CASE WHEN "senderId"=$1 THEN "recipientId" ELSE "senderId" END peer,
                  "body","createdAt","senderId","id","readAt",
                  CASE WHEN "audioUrl" IS NOT NULL THEN 'voice' WHEN "activityId" IS NOT NULL THEN 'activity' ELSE 'text' END "kind"
           FROM "direct_messages" WHERE ("senderId"=$1 OR "recipientId"=$1) AND "clubId" IS NULL
         ) m ORDER BY peer,"createdAt" DESC,"id" DESC
       )
       , unread AS (
         SELECT "senderId",COUNT(*)::integer "count" FROM "direct_messages"
         WHERE "recipientId"=$1 AND "readAt" IS NULL GROUP BY "senderId"
       )
       SELECT l."body",l."kind",l."createdAt",l."senderId",l."readAt",p."username",p."displayName",p."avatarUrl",
              CASE WHEN p."gender"='male' THEN 'masculine' WHEN p."gender"='female' THEN 'feminine' ELSE 'neutral' END "avatarStyle", p."verifiedAt" IS NOT NULL AS "verified",
              COALESCE(u."count",0) "unreadCount"
       FROM latest l JOIN "profiles" p ON p."userId"=l.peer
       LEFT JOIN unread u ON u."senderId"=l.peer
       ORDER BY l."createdAt" DESC LIMIT 50`, [userId],
    );
  }

  async unreadCount(userId: string) {
    const [row] = await this.dataSource.query(
      `SELECT (SELECT COUNT(*) FROM "direct_messages" WHERE "recipientId"=$1 AND "readAt" IS NULL)
            + (SELECT COUNT(*) FROM "club_memberships" m
               JOIN "direct_messages" d ON d."clubId" = m."clubId" AND d."senderId" <> $1
               LEFT JOIN "club_chat_reads" r ON r."clubId" = m."clubId" AND r."userId" = $1
               WHERE m."userId" = $1 AND d."createdAt" > COALESCE(r."readAt", m."joinedAt")) AS "count"`,
      [userId],
    ) as Array<{ count: string | number }>;
    return { count: Number(row.count) };
  }

  async markRead(userId: string, username: string) {
    const runner = await this.recipient(username);
    if (runner.userId === userId) throw new BadRequestException('You cannot message yourself');
    await this.dataSource.query(
      `UPDATE "direct_messages" SET "readAt"=now()
       WHERE "senderId"=$1 AND "recipientId"=$2 AND "readAt" IS NULL`,
      [runner.userId, userId],
    );
    await this.dataSource.query(
      `UPDATE "notifications" SET "readAt"=now()
       WHERE "userId"=$1 AND "readAt" IS NULL AND "type" IN ('DIRECT_MESSAGE','MESSAGE_REACTION')
         AND "link" = '/messages/' || (SELECT "username" FROM "profiles" WHERE "userId"=$2)`,
      [userId, runner.userId],
    );
    return { read: true };
  }

  async conversation(userId: string, username: string) {
    const runner = await this.recipient(username);
    if (runner.userId === userId) throw new BadRequestException('You cannot message yourself');
    const messages = await this.thread(
      `(m."senderId"=$1 AND m."recipientId"=$2) OR (m."senderId"=$2 AND m."recipientId"=$1)`, [userId, runner.userId],
    );
    return { runner, canMessage: true, messages };
  }

  private async thread(where: string, params: unknown[]) {
    const messages = await this.dataSource.query(
      `SELECT m."id",m."senderId",m."recipientId",m."clubId",m."body",m."createdAt",m."editedAt",m."readAt",m."audioUrl",m."audioSeconds",
              i."id" "invitationId",i."status" "invitationStatus",t."id" "tableId",t."code" "tableCode",
              t."title" "tableTitle",t."type" "tableType",t."status" "tableStatus",
              t."guaranteedPrizeKobo",t."entryFeeKobo",m."replyToId",reply."body" "replyToBody",
              reply."senderId" "replyToSenderId",
              CASE WHEN a."id" IS NULL THEN NULL ELSE json_build_object(
                'id', a."id", 'activityType', a."activityType", 'startedAt', a."startedAt", 'verificationStatus', a."verificationStatus",
                'distanceMetres', CASE WHEN a."verificationStatus"='VERIFIED' THEN GREATEST(a."validatedDistanceMetres", a."stepDistanceMetres") ELSE a."recordedDistanceMetres" END,
                'movingSeconds', a."movingSeconds", 'steps', a."validatedSteps") END "activity"
       FROM "direct_messages" m
       LEFT JOIN "activities" a ON a."id"=m."activityId"
       LEFT JOIN "challenge_invitations" i ON i."id"=m."invitationId"
       LEFT JOIN "competition_tables" t ON t."id"=i."tableId"
       LEFT JOIN "direct_messages" reply ON reply."id"=m."replyToId"
       WHERE ${where}
       ORDER BY m."createdAt" DESC,m."id" DESC LIMIT 100`, params,
    ) as Array<Record<string, unknown> & { id: string; senderId: string }>;
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
    return messages.reverse().map((message) => ({ ...message, reactions: byMessage.get(message.id) ?? [] }));
  }

  private async memberClub(userId: string, clubRef: string) {
    const ref = clubRef.trim().toLowerCase();
    const [club] = await this.dataSource.query(
      `SELECT c."id", c."slug", c."name", c."logoUrl", c."accentColor", c."verifiedAt" IS NOT NULL AS "verified", c."chatLocked", m."role" AS "myRole",
              (SELECT count(*) FROM "club_memberships" x WHERE x."clubId" = c."id")::integer AS "memberCount"
       FROM "clubs" c JOIN "club_memberships" m ON m."clubId" = c."id" AND m."userId" = $2
       WHERE c."slug" = $1 OR c."id"::text = $1`,
      [ref, userId],
    ) as Array<{ id: string; slug: string; name: string; logoUrl: string | null; accentColor: string; verified: boolean; chatLocked: boolean; myRole: 'owner' | 'admin' | 'member'; memberCount: number }>;
    if (!club) throw new ForbiddenException('Join this club to see its chat');
    return club;
  }

  async clubConversation(userId: string, clubRef: string) {
    const club = await this.memberClub(userId, clubRef);
    const messages = await this.thread(`m."clubId"=$1`, [club.id]);
    const people = await this.dataSource.query(
      `SELECT p."userId", p."username", COALESCE(p."displayName", u."displayName", 'Runner') AS "displayName", p."avatarUrl",
              CASE WHEN p."gender"='male' THEN 'masculine' WHEN p."gender"='female' THEN 'feminine' ELSE 'neutral' END "avatarStyle",
              p."verifiedAt" IS NOT NULL AS "verified"
       FROM "users" u LEFT JOIN "profiles" p ON p."userId" = u."id"
       WHERE u."id" = ANY($1::uuid[])`,
      [[...new Set([userId, ...messages.map((message) => message.senderId)])]],
    );
    const faces = await this.dataSource.query(
      `SELECT COALESCE(p."displayName", u."displayName", 'Runner') AS "displayName", p."avatarUrl",
              CASE WHEN p."gender"='male' THEN 'masculine' WHEN p."gender"='female' THEN 'feminine' ELSE 'neutral' END "avatarStyle"
       FROM "club_memberships" m JOIN "users" u ON u."id" = m."userId" LEFT JOIN "profiles" p ON p."userId" = m."userId"
       WHERE m."clubId" = $1 ORDER BY (p."avatarUrl" IS NULL), m."joinedAt" LIMIT 5`,
      [club.id],
    );
    const canMessage = !club.chatLocked || club.myRole !== 'member';
    return { club: { ...club, faces }, people, canMessage, messages };
  }

  async markClubRead(userId: string, clubRef: string) {
    const club = await this.memberClub(userId, clubRef);
    await this.dataSource.query(
      `INSERT INTO "club_chat_reads" ("clubId","userId","readAt") VALUES ($1,$2,now())
       ON CONFLICT ("clubId","userId") DO UPDATE SET "readAt"=now()`,
      [club.id, userId],
    );
    return { read: true };
  }

  async sendToClub(userId: string, clubRef: string, body: string, extras: SendExtras = {}) {
    const club = await this.memberClub(userId, clubRef);
    if (club.chatLocked && club.myRole === 'member') throw new ForbiddenException('Only the owner and managers can send messages here right now');
    const { replyToId, activityId, audioUrl, audioSeconds } = extras;
    const trimmed = body.trim();
    await this.checkExtras(userId, trimmed, extras);
    if (replyToId) {
      const reply = await this.dataSource.query(`SELECT 1 FROM "direct_messages" WHERE "id"=$1 AND "clubId"=$2`, [replyToId, club.id]) as unknown[];
      if (!reply.length) throw new BadRequestException('Choose a message from this chat to reply to');
    }
    const [message] = await this.dataSource.query(
      `INSERT INTO "direct_messages" ("senderId","clubId","body","replyToId","activityId","audioUrl","audioSeconds") VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING "id","senderId","recipientId","clubId","body","replyToId","activityId","audioUrl","audioSeconds","createdAt"`,
      [userId, club.id, trimmed, replyToId ?? null, activityId ?? null, audioUrl ?? null, audioUrl ? audioSeconds ?? null : null],
    );
    await this.dataSource.query(
      `INSERT INTO "club_chat_reads" ("clubId","userId","readAt") VALUES ($1,$2,now()) ON CONFLICT ("clubId","userId") DO UPDATE SET "readAt"=now()`,
      [club.id, userId],
    );
    return message;
  }

  private async checkExtras(userId: string, trimmed: string, { activityId, audioUrl }: SendExtras) {
    if (!trimmed && !activityId && !audioUrl) throw new BadRequestException('Write a message');
    if (audioUrl && !this.cloudinary.isOwnVoiceNote(userId, audioUrl)) throw new BadRequestException('Record the voice note again');
    if (activityId) {
      const owned = await this.dataSource.query(
        `SELECT 1 FROM "activities" WHERE "id"=$1 AND "userId"=$2 AND "verificationStatus"<>'REJECTED'`, [activityId, userId],
      ) as unknown[];
      if (!owned.length) throw new BadRequestException('Choose one of your activities to share');
    }
  }

  async uploadVoiceNote(userId: string, file: { buffer: Buffer; mimetype: string; size: number } | undefined) {
    if (!file) throw new BadRequestException('Record a voice note');
    if (!/^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a|wav)\b/.test(file.mimetype)) throw new BadRequestException('That recording format isn’t supported');
    return { url: await this.cloudinary.uploadVoiceNote(userId, file) };
  }

  async send(userId: string, username: string, body: string, extras: SendExtras = {}) {
    const { replyToId, activityId, audioUrl, audioSeconds } = extras;
    const trimmed = body.trim();
    await this.checkExtras(userId, trimmed, extras);
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
      `INSERT INTO "direct_messages" ("senderId","recipientId","body","replyToId","activityId","audioUrl","audioSeconds") VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING "id","senderId","recipientId","body","replyToId","activityId","audioUrl","audioSeconds","createdAt"`,
      [userId, runner.userId, trimmed, replyToId ?? null, activityId ?? null, audioUrl ?? null, audioUrl ? audioSeconds ?? null : null],
    );
    await this.notify(
      `INSERT INTO "notifications" ("userId","type","title","body","link")
       SELECT $2,'DIRECT_MESSAGE',p."displayName",$3,'/messages/' || p."username"
       FROM "profiles" p WHERE p."userId"=$1`, [userId, runner.userId, preview(trimmed, Boolean(audioUrl), Boolean(activityId))],
    );
    return message;
  }

  async edit(userId: string, messageId: string, body: string) {
    const trimmed = body.trim();
    if (!trimmed) throw new BadRequestException('Write a message');
    const [message] = await this.dataSource.query(
      `UPDATE "direct_messages" SET "body"=$3,"editedAt"=now()
       WHERE "id"=$1 AND "senderId"=$2 AND "invitationId" IS NULL
       RETURNING "id","body","editedAt"`,
      [messageId, userId, trimmed],
    ) as Array<{ id: string; body: string; editedAt: string }>;
    if (!message) throw new NotFoundException('Message not found or cannot be edited');
    return message;
  }

  async react(userId: string, messageId: string, reaction: string | null) {
    const allowed = await this.dataSource.query(
      `SELECT 1 FROM "direct_messages" m WHERE m."id"=$1 AND (m."senderId"=$2 OR m."recipientId"=$2
         OR EXISTS (SELECT 1 FROM "club_memberships" c WHERE c."clubId"=m."clubId" AND c."userId"=$2))`,
      [messageId, userId],
    ) as unknown[];
    if (!allowed.length) throw new NotFoundException('Message not found');
    if (reaction) {
      const changed = await this.dataSource.query(
        `INSERT INTO "direct_message_reactions" ("messageId","userId","reaction") VALUES ($1,$2,$3)
         ON CONFLICT ("messageId","userId") DO UPDATE SET "reaction"=EXCLUDED."reaction"
         WHERE "direct_message_reactions"."reaction" IS DISTINCT FROM EXCLUDED."reaction"
         RETURNING "messageId"`,
        [messageId, userId, reaction],
      ) as Array<{ messageId: string }>;
      if (changed.length) await this.notify(
        `INSERT INTO "notifications" ("userId","type","title","body","link")
         SELECT CASE WHEN m."senderId"=$2 THEN m."recipientId" ELSE m."senderId" END,
                'MESSAGE_REACTION',p."displayName" || ' reacted to your message','Open Messages to see the reaction.','/messages/' || p."username"
         FROM "direct_messages" m JOIN "profiles" p ON p."userId"=$2 WHERE m."id"=$1 AND m."clubId" IS NULL
         UNION ALL
         SELECT m."senderId",'MESSAGE_REACTION',p."displayName" || ' reacted to your message in ' || c."name",'Open the club chat to see it.','/clubs/' || c."slug" || '/chat'
         FROM "direct_messages" m JOIN "clubs" c ON c."id"=m."clubId" JOIN "profiles" p ON p."userId"=$2
         WHERE m."id"=$1 AND m."senderId"<>$2`,
        [messageId, userId],
      );
    } else {
      await this.dataSource.query(`DELETE FROM "direct_message_reactions" WHERE "messageId"=$1 AND "userId"=$2`, [messageId, userId]);
    }
    return { reaction };
  }
}
