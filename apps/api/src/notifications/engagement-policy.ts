import { createHash } from 'crypto';

export const CATEGORIES = ['competitions', 'clubs', 'milestones', 'recommendations', 'summaries', 'social'] as const;
export type Category = (typeof CATEGORIES)[number];
export type Channel = 'push' | 'email' | 'inapp';
export interface Preferences {
  timeZone: string | null;
  quietStart: number;
  quietEnd: number;
  categories: Partial<Record<Category, Partial<Record<Channel, boolean>>>>;
}
export interface Settings {
  deliveryEnabled: boolean;
  newTriggersEnabled: boolean;
  pushDaily: number;
  emailWeekly: number;
  rolloutPercent: number;
  holdoutPercent: number;
  triggers: Record<string, boolean>;
}
export const DEFAULT_SETTINGS: Settings = {
  deliveryEnabled: true,
  newTriggersEnabled: false,
  pushDaily: 2,
  emailWeekly: 3,
  rolloutPercent: 0,
  holdoutPercent: 10,
  triggers: { weeklyRecap: false, weeklyGoal: false, deadlines: false, proximity: false, streak: false, digest: false },
};
export const DEFAULT_PREFERENCES: Preferences = { timeZone: null, quietStart: 21, quietEnd: 8, categories: {} };
// Only operational/account/payment messages bypass optional engagement policy. Unknown types fail optional.
export const ESSENTIAL_TYPES = new Set([
  'PAYOUT_RECIPIENT_CHANGED',
  'PAYOUT_SENT',
  'PAYOUT_REJECTED',
  'PRIZE_WON',
  'PRIZE_REMINDER',
  'PRIZE_UPDATE',
  'PRIZE_FORFEITED',
  'KYC_FAILED',
  'KYC_VERIFIED',
  'KYC_APPROVED',
  'KYC_REJECTED',
  'KYC_REQUIRED',
  'KYC_UPDATE',
  'REPORT_RESOLVED',
  'CLUB_EVENT_REMINDER',
  'EVENT_CANCELLED',
  'EVENT_CHANGED',
  'CHALLENGE_REMOVED',
  'PAID_CHALLENGE_APPROVED',
  'PAID_CHALLENGE_REJECTED',
  'CREATOR_APPROVED',
  'CREATOR_REJECTED',
  'CREATOR_SUSPENDED',
  'CLUB_MODERATION',
  'DIRECT_MESSAGE',
  'CLUB_MESSAGE',
  'DUEL_INVITE',
  'DUEL_ACCEPTED',
  'DUEL_DECLINED',
  'DUEL_READY',
  'DUEL_STARTED',
  'DUEL_RESULT',
]);
export function isEssential(type: string, channel: Channel) {
  return ESSENTIAL_TYPES.has(type) && !(channel === 'email' && ['DIRECT_MESSAGE', 'CLUB_MESSAGE'].includes(type));
}
export interface Candidate {
  sourceId?: string;
  userId: string;
  type: string;
  key: string;
  link: string | null;
  createdAt: Date;
  expiresAt?: Date | null;
  newTrigger?: boolean;
  onlyChannel?: Channel | null;
}
export function category(type: string): Category {
  if (/RECAP|SUMMARY/.test(type)) return 'summaries';
  if (/NEW_COMPETITION|COMPETITION_ANNOUNCE|RECOMMEND|DIGEST/.test(type)) return 'recommendations';
  if (/CLUB/.test(type)) return 'clubs';
  if (/ACTIVITY|GOAL|MILESTONE|STREAK/.test(type)) return 'milestones';
  if (/CHALLENGE|COMPETITION|LEADERBOARD|STANDING|PODIUM|LEAGUE/.test(type)) return 'competitions';
  return 'social';
}
export function cohort(userId: string, percent: number) {
  return createHash('sha256').update(`jump-engagement-v1:${userId}`).digest().readUInt32BE(0) % 100 < percent
    ? 'holdout'
    : 'treatment';
}
export function inRollout(userId: string, percent: number) {
  return createHash('sha256').update(`jump-rollout-v1:${userId}`).digest().readUInt32BE(0) % 100 < percent;
}
export function validZone(zone: unknown): zone is string {
  try {
    if (typeof zone !== 'string' || zone.length > 100) return false;
    new Intl.DateTimeFormat('en', { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}
export function validLink(link: string | null) {
  return !!link && /^\/(?!\/)[a-zA-Z0-9][a-zA-Z0-9/_?=&%#.-]*$/.test(link) && !/%(?:0[ad]|2f|5c)/i.test(link);
}
export function localWindow(now: Date, zone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const day = `${part('year')}-${part('month')}-${part('day')}`;
  const monday = new Date(`${day}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return { day, week: monday.toISOString().slice(0, 10), hour: Number(part('hour')) };
}
export function reasonFor(
  c: Candidate,
  channel: Channel,
  p: Preferences,
  s: Settings,
  now: Date,
  legacyEmail = true,
): string | null {
  if (isEssential(c.type, channel)) return null;
  if (!s.deliveryEnabled) return 'delivery_disabled';
  if (c.newTrigger && !s.newTriggersEnabled) return 'feature_disabled';
  if (c.newTrigger && !inRollout(c.userId, s.rolloutPercent)) return 'outside_rollout';
  const trigger: Record<string, string> = {
    WEEKLY_RECAP: 'weeklyRecap',
    WEEKLY_GOAL: 'weeklyGoal',
    COMPETITION_STARTING: 'deadlines',
    COMPETITION_ENDING: 'deadlines',
    STREAK_REMINDER: 'streak',
    COMPETITION_DIGEST: 'digest',
  };
  if (trigger[c.type] && !s.triggers[trigger[c.type]]) return 'trigger_disabled';
  if (c.onlyChannel && c.onlyChannel !== channel && channel !== 'inapp') return 'other_channel';
  if (!validLink(c.link)) return 'missing_deep_link';
  const expiry = c.expiresAt?.getTime() ?? c.createdAt.getTime() + (channel === 'push' ? 30 * 60_000 : 24 * 3600_000);
  if (!Number.isFinite(expiry) || expiry <= now.getTime() || c.createdAt.getTime() > now.getTime() + 60_000)
    return 'stale';
  if (p.categories[category(c.type)]?.[channel] === false || (channel === 'email' && !legacyEmail)) return 'preference';
  // Activity uploads and score timestamps are not synchronization watermarks. No reliable source exists yet.
  if (c.type === 'LEADERBOARD_UPDATE') return 'insignificant_update';
  if (c.type === 'STANDING_BOOST' || c.type === 'COMPETITIVE_PROXIMITY') return 'unestablished_sync_freshness';
  if (!validZone(p.timeZone)) return 'missing_time_zone';
  const { hour } = localWindow(now, p.timeZone);
  if (
    p.quietStart !== p.quietEnd &&
    (p.quietStart < p.quietEnd ? hour >= p.quietStart && hour < p.quietEnd : hour >= p.quietStart || hour < p.quietEnd)
  )
    return 'quiet_hours';
  return null;
}
export function notificationCandidate(row: {
  id: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  link: string | null;
  createdAt: Date | string;
  engagementKey?: string | null;
  engagementExpiresAt?: Date | string | null;
  engagementChannel?: Channel | null;
}): Candidate {
  const createdAt = new Date(row.createdAt);
  const fingerprint = createHash('sha256')
    .update(`${row.type}:${row.link}:${row.title}:${row.body ?? ''}:${createdAt.toISOString().slice(0, 10)}`)
    .digest('hex');
  return {
    sourceId: row.id,
    userId: row.userId,
    type: row.type,
    key: row.engagementKey ?? fingerprint,
    link: row.link,
    createdAt,
    expiresAt: row.engagementExpiresAt ? new Date(row.engagementExpiresAt) : null,
    newTrigger: !!row.engagementKey,
    onlyChannel: row.engagementChannel,
  };
}
