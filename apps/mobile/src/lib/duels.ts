import { formatDistance } from '@jump/shared/format';
import type { AvatarStyle, Unit } from '@jump/shared/types';

export type DuelActivity = 'run' | 'walk' | 'cycle' | 'any';
export type DuelPerson = { userId: string; username: string; displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle; verified?: boolean };
export type Duel = {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'LIVE' | 'FINISHED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
  activity: DuelActivity; targetMetres: number; minutes: number;
  challengerId: string; opponentId: string; challenger: DuelPerson; opponent: DuelPerson;
  acceptedAt: string | null; challengerReadyAt: string | null; opponentReadyAt: string | null;
  startsAt: string | null; endsAt: string | null; expiresAt: string; settledAt: string | null;
  challengerMetres: number | null; opponentMetres: number | null; challengerReachedAt: string | null; opponentReachedAt: string | null;
  winnerId: string | null;
};
/** One duel with its live distances (while it runs) and the server's clock, to correct the phone's. */
export type DuelView = Duel & {
  live: { challengerMetres: number; opponentMetres: number; challengerReachedAt: string | null; opponentReachedAt: string | null } | null;
  now: string;
};
export type DuelPhase = 'pending' | 'accepted' | 'countdown' | 'live' | 'settling' | 'finished' | 'declined' | 'cancelled' | 'expired';

/** How long a tap on "I'm ready" holds while the other person gets ready too (the API's rule). */
export const READY_MINUTES = 10;

export const DUEL_VERB: Record<DuelActivity, string> = { run: 'Run', walk: 'Walk', cycle: 'Ride', any: 'Move' };

export const duelKey = (id: string) => ['duel', id] as const;

/** "Run 5 km in 30 min" */
export function duelLine(duel: Pick<Duel, 'activity' | 'targetMetres' | 'minutes'>, unit: Unit) {
  return `${DUEL_VERB[duel.activity]} ${formatDistance(duel.targetMetres, unit)} in ${duel.minutes} min`;
}

export function duelPhase(duel: Pick<Duel, 'status' | 'startsAt' | 'endsAt'>, now = Date.now()): DuelPhase {
  switch (duel.status) {
    case 'PENDING': return 'pending';
    case 'ACCEPTED': return 'accepted';
    case 'FINISHED': return 'finished';
    case 'DECLINED': return 'declined';
    case 'CANCELLED': return 'cancelled';
    case 'EXPIRED': return 'expired';
    default:
      if (duel.startsAt && now < new Date(duel.startsAt).getTime()) return 'countdown';
      if (duel.endsAt && now < new Date(duel.endsAt).getTime()) return 'live';
      return 'settling';
  }
}

export function isReady(at: string | null, now = Date.now()) {
  return at !== null && now - new Date(at).getTime() < READY_MINUTES * 60_000;
}

/** The viewer's side and the other side, or null for someone watching. */
export function sides(duel: Duel, viewerId: string) {
  if (duel.challengerId === viewerId) return { me: duel.challenger, them: duel.opponent, mineReady: duel.challengerReadyAt, theirsReady: duel.opponentReadyAt, challenger: true };
  if (duel.opponentId === viewerId) return { me: duel.opponent, them: duel.challenger, mineReady: duel.opponentReadyAt, theirsReady: duel.challengerReadyAt, challenger: false };
  return null;
}

/** Distances to show: live while it runs, the settled result after. */
export function standing(duel: DuelView | Duel) {
  const live = 'live' in duel ? duel.live : null;
  return {
    challenger: { metres: live?.challengerMetres ?? duel.challengerMetres ?? 0, reachedAt: live?.challengerReachedAt ?? duel.challengerReachedAt },
    opponent: { metres: live?.opponentMetres ?? duel.opponentMetres ?? 0, reachedAt: live?.opponentReachedAt ?? duel.opponentReachedAt },
  };
}
