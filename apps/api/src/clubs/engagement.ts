import { createHash } from 'node:crypto';
import type { EntityManager } from 'typeorm';

/** The bits of the HTTP request a view needs. */
export type ViewRequest = { ip?: string; headers: Record<string, string | string[] | undefined> };

/** A stable, anonymous key for a visitor who isn't signed in: never the IP itself. */
export function anonKey(ip: string | undefined, userAgent: string | undefined) {
  if (!ip) return null;
  return createHash('sha256').update(`jump-view:${ip}:${userAgent ?? ''}`).digest('hex').slice(0, 32);
}

/**
 * Counts a view of a club page or a competition (with its club), once per viewer per 30 minutes so
 * refreshes and polling don't inflate it. The club's own owner and managers looking aren't counted.
 * Never throws: a missed view must not break the page.
 */
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

/** Someone shared a club or one of its competitions (the share card, WhatsApp, X, a copied link). */
export async function recordShare(manager: EntityManager, input: { clubId: string | null; tableId?: string | null; viewerId: string; channel: string }) {
  const channel = (SHARE_CHANNELS as readonly string[]).includes(input.channel) ? input.channel : 'other';
  await manager.query(
    `INSERT INTO "engagement_events" ("type","clubId","tableId","viewerId","channel") VALUES ('share',$1,$2,$3,$4)`,
    [input.clubId, input.tableId ?? null, input.viewerId, channel],
  ).catch(() => undefined);
}
