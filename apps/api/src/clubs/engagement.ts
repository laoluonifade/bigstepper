import { createHash } from 'node:crypto';
import type { EntityManager } from 'typeorm';

export type ViewRequest = { ip?: string; headers: Record<string, string | string[] | undefined> };

export function anonKey(ip: string | undefined, userAgent: string | undefined) {
  if (!ip) return null;
  return createHash('sha256').update(`jump-view:${ip}:${userAgent ?? ''}`).digest('hex').slice(0, 32);
}

export async function recordView(manager: EntityManager, input: { clubId: string | null; tableId?: string | null; viewerId?: string | null; anonKey?: string | null }) {
  if (!input.clubId && !input.tableId) return;
  if (!input.viewerId && !input.anonKey) return;
  await manager.query(
    `INSERT INTO "engagement_events" ("type","clubId","tableId","viewerId","anonKey")
     SELECT 'view', $1::uuid, $2::uuid, $3::uuid, $4
     WHERE NOT EXISTS (
       SELECT 1 FROM "engagement_events" e WHERE e."type" = 'view' AND e."createdAt" > now() - interval '30 minutes'
         AND e."clubId" IS NOT DISTINCT FROM $1::uuid AND e."tableId" IS NOT DISTINCT FROM $2::uuid
         AND (($3::uuid IS NOT NULL AND e."viewerId" = $3::uuid) OR ($3::uuid IS NULL AND e."anonKey" = $4))
     )
     AND NOT EXISTS (SELECT 1 FROM "club_memberships" m WHERE m."clubId" = $1::uuid AND m."userId" = $3::uuid AND m."role" IN ('owner','admin'))`,
    [input.clubId, input.tableId ?? null, input.viewerId ?? null, input.anonKey ?? null],
  ).catch(() => undefined);
}

export const SHARE_CHANNELS = ['card', 'whatsapp', 'x', 'link', 'other'] as const;

export async function recordShare(manager: EntityManager, input: { clubId: string | null; tableId?: string | null; viewerId: string; channel: string }) {
  const channel = (SHARE_CHANNELS as readonly string[]).includes(input.channel) ? input.channel : 'other';
  await manager.query(
    `INSERT INTO "engagement_events" ("type","clubId","tableId","viewerId","channel") VALUES ('share',$1,$2,$3,$4)`,
    [input.clubId, input.tableId ?? null, input.viewerId, channel],
  ).catch(() => undefined);
}
