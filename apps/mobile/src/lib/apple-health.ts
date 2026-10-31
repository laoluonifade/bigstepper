import type * as HealthKit from '@kingstinct/react-native-healthkit';
import type { WorkoutActivityType, WorkoutProxyTyped } from '@kingstinct/react-native-healthkit';
import { Platform, TurboModuleRegistry } from 'react-native';
import { post } from './api';

const LOOK_BACK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_SYNC_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ROUTE_POINTS = 5000;
const STEP_DAYS = 35;
const STEP_RESYNC_DAYS = 3;

const ACTIVITY: Partial<Record<WorkoutActivityType, 'walk' | 'run' | 'cycle'>> = { 52: 'walk', 24: 'walk', 37: 'run', 13: 'cycle' };

let healthKit: typeof HealthKit | null | undefined;

/** HealthKit ships in the native build, so Expo Go and older builds don't have it. Load it only once it's there. */
function loadHealthKit() {
  if (healthKit !== undefined) return healthKit;
  try {
    healthKit = Platform.OS === 'ios' && TurboModuleRegistry.get('NitroModules') ? require('@kingstinct/react-native-healthkit') as typeof HealthKit : null;
  } catch {
    healthKit = null;
  }
  return healthKit;
}

function requireHealthKit() {
  const module = loadHealthKit();
  if (!module) throw new Error('Apple Health needs the latest version of Jump. Update the app and try again.');
  return module;
}

const METRES: Record<string, number> = { m: 1, km: 1000, mi: 1609.344, ft: 0.3048, yd: 0.9144 };

export function appleHealthAvailable() {
  try { return loadHealthKit()?.isHealthDataAvailable() ?? false; } catch { return false; }
}

/** Asks for read access. iOS never says whether the person allowed it, so a sync is the real test. */
export async function requestAppleHealth() {
  const { requestAuthorization, WorkoutRouteTypeIdentifier, WorkoutTypeIdentifier } = requireHealthKit();
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
  const steps = activityType === 'cycle' ? undefined : await requireHealthKit().queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], {
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

function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Each day's step total from iPhone and Apple Watch, leaving out steps someone typed in by hand. */
async function syncDailySteps(since: string | null) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - STEP_DAYS);
  if (since) {
    const resync = new Date(since);
    resync.setHours(0, 0, 0, 0);
    resync.setDate(resync.getDate() - STEP_RESYNC_DAYS);
    if (resync > start) start.setTime(resync.getTime());
  }
  const days = await requireHealthKit().queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], start, { day: 1 }, {
    filter: { date: { startDate: start, endDate: new Date() }, NOT: [{ metadata: { withMetadataKey: 'HKWasUserEntered' } }] },
    unit: 'count',
  });
  const totals = days
    .filter((day) => day.startDate && day.sumQuantity)
    .map((day) => ({ day: localDay(new Date(day.startDate!)), steps: Math.round(day.sumQuantity!.quantity) }));
  if (totals.length) await post('/apple-health/steps', { days: totals });
}

/** Sends recent walks, runs and rides from Apple Health to Jump. The server skips anything it already has. */
export async function syncAppleHealth(since: string | null, connectedAt: string) {
  const from = new Date(since ? new Date(since).getTime() - LOOK_BACK_MS : new Date(connectedAt).getTime() - FIRST_SYNC_MS);
  const workouts = await requireHealthKit().queryWorkoutSamples({ limit: 0, ascending: true, filter: { date: { startDate: from, endDate: new Date() } } });
  let imported = 0;
  for (const workout of workouts) {
    const activityType = ACTIVITY[workout.workoutActivityType];
    const metadata = workout.metadata as { HKWasUserEntered?: boolean; HKIndoorWorkout?: boolean };
    if (!activityType || metadata?.HKWasUserEntered || metadata?.HKIndoorWorkout) continue;
    if (await upload(workout, activityType)) imported += 1;
  }
  await syncDailySteps(since);
  await post('/apple-health/synced');
  return imported;
}
