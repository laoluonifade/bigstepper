import {
  isHealthDataAvailable,
  queryStatisticsForQuantity,
  queryWorkoutSamples,
  requestAuthorization,
  WorkoutActivityType,
  WorkoutRouteTypeIdentifier,
  WorkoutTypeIdentifier,
  type WorkoutProxyTyped,
} from '@kingstinct/react-native-healthkit';
import { Platform } from 'react-native';
import { post } from './api';

const LOOK_BACK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_SYNC_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ROUTE_POINTS = 5000;

const ACTIVITY: Partial<Record<WorkoutActivityType, 'walk' | 'run' | 'cycle'>> = {
  [WorkoutActivityType.walking]: 'walk',
  [WorkoutActivityType.hiking]: 'walk',
  [WorkoutActivityType.running]: 'run',
  [WorkoutActivityType.cycling]: 'cycle',
};

const METRES: Record<string, number> = { m: 1, km: 1000, mi: 1609.344, ft: 0.3048, yd: 0.9144 };

export function appleHealthAvailable() {
  if (Platform.OS !== 'ios') return false;
  try { return isHealthDataAvailable(); } catch { return false; }
}

/** Asks for read access. iOS never says whether the person allowed it, so a sync is the real test. */
export async function requestAppleHealth() {
  return requestAuthorization({
    toRead: [WorkoutTypeIdentifier, WorkoutRouteTypeIdentifier, 'HKQuantityTypeIdentifierStepCount', 'HKQuantityTypeIdentifierDistanceWalkingRunning', 'HKQuantityTypeIdentifierDistanceCycling'],
  });
}

function sample<T>(items: readonly T[], limit: number) {
  if (items.length <= limit) return [...items];
  const step = (items.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => items[Math.round(index * step)]);
}

async function upload(workout: WorkoutProxyTyped, activityType: 'walk' | 'run' | 'cycle') {
  const startedAt = new Date(workout.startDate);
  const finishedAt = new Date(workout.endDate);
  const locations = (await workout.getWorkoutRoutes()).flatMap((route) => route.locations);
  if (locations.length < 2) return false;
  const route = sample([...locations].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), MAX_ROUTE_POINTS)
    .map((point) => [point.latitude, point.longitude, Math.round((new Date(point.date).getTime() - startedAt.getTime()) / 100) / 10]);
  const distance = workout.totalDistance ? workout.totalDistance.quantity * (METRES[workout.totalDistance.unit] ?? 1) : 0;
  const steps = activityType === 'cycle' ? undefined : await queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], {
    filter: { date: { startDate: startedAt, endDate: finishedAt } },
    unit: 'count',
  }).then((stats) => (stats.sumQuantity ? Math.round(stats.sumQuantity.quantity) : undefined)).catch(() => undefined);
  const result = await post<{ imported: boolean }>('/apple-health/workouts', {
    id: workout.uuid,
    activityType,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    distanceMetres: Math.round(distance),
    ...(steps ? { steps } : {}),
    route,
  });
  return result.imported;
}

/** Sends recent walks, runs and rides from Apple Health to Jump. The server skips anything it already has. */
export async function syncAppleHealth(since: string | null, connectedAt: string) {
  const from = new Date(since ? new Date(since).getTime() - LOOK_BACK_MS : new Date(connectedAt).getTime() - FIRST_SYNC_MS);
  const workouts = await queryWorkoutSamples({ limit: 0, ascending: true, filter: { date: { startDate: from, endDate: new Date() } } });
  let imported = 0;
  for (const workout of workouts) {
    const activityType = ACTIVITY[workout.workoutActivityType];
    const metadata = workout.metadata as { HKWasUserEntered?: boolean; HKIndoorWorkout?: boolean };
    if (!activityType || metadata?.HKWasUserEntered || metadata?.HKIndoorWorkout) continue;
    if (await upload(workout, activityType)) imported += 1;
  }
  await post('/apple-health/synced');
  return imported;
}
