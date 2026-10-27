import { measureTrack, TrackPoint } from '../running/track';

export type DuelActivity = 'run' | 'walk' | 'cycle' | 'any';

export interface SessionTrack {
  activityType: 'walk' | 'run' | 'cycle';
  points: TrackPoint[];
}

export interface Progress {
  metres: number;
  reachedAt: Date | null;
}

export function progressFor(sessions: SessionTrack[], targetMetres: number, from: Date, until: Date): Progress {
  const steps: Array<[number, number]> = [];
  let metres = 0;
  for (const session of sessions) {
    const inside = session.points.filter((point) => point.recordedAt >= from && point.recordedAt <= until);
    if (inside.length < 2) continue;
    const measured = measureTrack(inside, { activityType: session.activityType });
    metres += measured.distanceMetres;
    let previous = 0;
    for (const [at, total] of measured.profile) {
      if (total > previous) steps.push([at, total - previous]);
      previous = total;
    }
  }
  steps.sort((a, b) => a[0] - b[0]);
  let running = 0;
  let reachedAt: Date | null = null;
  for (const [at, gained] of steps) {
    running += gained;
    if (running >= targetMetres) { reachedAt = new Date(at); break; }
  }
  return { metres: Math.round(metres), reachedAt };
}

export function winnerOf(a: { userId: string } & Progress, b: { userId: string } & Progress): string | null {
  if (a.reachedAt && b.reachedAt) {
    const diff = a.reachedAt.getTime() - b.reachedAt.getTime();
    return diff === 0 ? null : diff < 0 ? a.userId : b.userId;
  }
  if (a.reachedAt) return a.userId;
  if (b.reachedAt) return b.userId;
  if (a.metres === b.metres) return null;
  return a.metres > b.metres ? a.userId : b.userId;
}

export function matches(activity: DuelActivity, type: 'walk' | 'run' | 'cycle') {
  return activity === 'any' || activity === type;
}
