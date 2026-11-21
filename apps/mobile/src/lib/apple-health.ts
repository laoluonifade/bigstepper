import type * as HealthKit from '@kingstinct/react-native-healthkit';
import type { WorkoutActivityType, WorkoutProxyTyped } from '@kingstinct/react-native-healthkit';
import { Platform, TurboModuleRegistry } from 'react-native';
import type { AppleHealthStatus } from '@jump/shared/types';
import { api, post } from './api';

const LOOK_BACK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_SYNC_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ROUTE_POINTS = 5000;
const STEP_DAYS = 35;
const HOUR_DAYS = 3;

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
  const total = workout.totalDistance ? workout.totalDistance.quantity * (METRES[workout.totalDistance.unit] ?? 1) : 0;
  const distance = total > 0 ? total : await workout.getStatistic(activityType === 'cycle' ? 'HKQuantityTypeIdentifierDistanceCycling' : 'HKQuantityTypeIdentifierDistanceWalkingRunning', 'm')
    .then((stats) => stats?.sumQuantity?.quantity ?? 0).catch(() => 0);
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

/** The last five weeks of daily steps and walking distance from iPhone and Apple Watch (the server skips days that didn't change), leaving out anything typed in by hand. Competitions only count what came after connecting. */
async function sumSince(measure: 'steps' | 'metres', from: Date, to: Date) {
  const filter = { date: { startDate: from, endDate: to }, NOT: [{ metadata: { withMetadataKey: 'HKWasUserEntered' } }] };
  const stats = await (measure === 'steps'
    ? requireHealthKit().queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], { filter, unit: 'count' })
    : requireHealthKit().queryStatisticsForQuantity('HKQuantityTypeIdentifierDistanceWalkingRunning', ['cumulativeSum'], { filter, unit: 'm' })).catch(() => null);
  return Math.round(stats?.sumQuantity?.quantity ?? 0);
}

async function syncDailySteps(connectedAt: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - STEP_DAYS);
  const options = { filter: { date: { startDate: start, endDate: new Date() }, NOT: [{ metadata: { withMetadataKey: 'HKWasUserEntered' } }] } };
  const healthKit = requireHealthKit();
  const [steps, distance] = await Promise.all([
    healthKit.queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], start, { day: 1 }, { ...options, unit: 'count' }),
    healthKit.queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierDistanceWalkingRunning', ['cumulativeSum'], start, { day: 1 }, { ...options, unit: 'm' }).catch(() => []),
  ]);
  const metres = new Map(distance.filter((day) => day.startDate && day.sumQuantity).map((day) => [localDay(new Date(day.startDate!)), Math.round(day.sumQuantity!.quantity)]));
  const connected = new Date(connectedAt);
  const totals = await Promise.all(steps
    .filter((day) => day.startDate && day.sumQuantity)
    .map(async (day) => {
      const dayStart = new Date(day.startDate!);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const date = localDay(dayStart);
      const full = { steps: Math.round(day.sumQuantity!.quantity), metres: metres.get(date) };
      const counted = dayEnd <= connected ? { steps: 0, metres: 0 }
        : dayStart >= connected ? { steps: full.steps, metres: full.metres ?? 0 }
          : { steps: await sumSince('steps', connected, dayEnd), metres: await sumSince('metres', connected, dayEnd) };
      return { day: date, steps: full.steps, ...(full.metres != null ? { distanceMetres: full.metres } : {}), countedSteps: counted.steps, countedMetres: counted.metres };
    }));
  if (totals.length) await post('/apple-health/steps', { days: totals, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
}

/**
 * The last three days of steps, hour by hour, for competitions that only count part of the day (6 PM to
 * midnight, 5 to 9 AM). Hours before connecting don't count, and typed-in steps are left out as for days.
 */
async function syncHourlySteps(connectedAt: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - HOUR_DAYS);
  const options = { filter: { date: { startDate: start, endDate: new Date() }, NOT: [{ metadata: { withMetadataKey: 'HKWasUserEntered' } }] }, unit: 'count' as const };
  const hours = await requireHealthKit().queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], start, { hour: 1 }, options);
  const connected = new Date(connectedAt).getTime();
  const rows = hours
    .filter((hour) => hour.startDate && hour.sumQuantity && hour.sumQuantity.quantity >= 1)
    .map((hour) => {
      const steps = Math.round(hour.sumQuantity!.quantity);
      const at = new Date(hour.startDate!);
      return { hour: at.toISOString(), steps, countedSteps: at.getTime() >= connected ? steps : 0 };
    });
  if (rows.length) await post('/apple-health/hours', { hours: rows });
}

/**
 * Sends steps from Apple Health to Jump, then recent walks, runs and rides (the server skips anything it
 * already has). Steps go first and each workout on its own, so one workout Jump can't read never holds up
 * the steps that competitions count. Throws the first problem afterwards, so the app can say so.
 */
export async function syncAppleHealth(since: string | null, connectedAt: string) {
  const problems: unknown[] = [];
  const attempt = (work: Promise<unknown>) => work.catch((error: unknown) => { problems.push(error); });
  await attempt(syncDailySteps(connectedAt));
  await attempt(syncHourlySteps(connectedAt));
  const stepsSynced = problems.length === 0;
  const from = new Date(since ? new Date(since).getTime() - LOOK_BACK_MS : new Date(connectedAt).getTime() - FIRST_SYNC_MS);
  let imported = 0;
  const workouts = await requireHealthKit().queryWorkoutSamples({ limit: 0, ascending: true, filter: { date: { startDate: from, endDate: new Date() } } })
    .catch((error: unknown) => { problems.push(error); return []; });
  for (const workout of workouts) {
    const activityType = ACTIVITY[workout.workoutActivityType];
    const metadata = workout.metadata as { HKWasUserEntered?: boolean; HKIndoorWorkout?: boolean };
    if (!activityType || metadata?.HKWasUserEntered || metadata?.HKIndoorWorkout) continue;
    await attempt(upload(workout, activityType).then((done) => { if (done) imported += 1; }));
  }
  if (stepsSynced) await post('/apple-health/synced');
  if (problems.length) throw problems[0];
  return imported;
}

const BACKGROUND_GAP_MS = 10 * 60 * 1000;
let lastBackgroundSync = 0;
let listening: Array<{ remove: () => void }> = [];

async function syncNow() {
  if (Date.now() - lastBackgroundSync < BACKGROUND_GAP_MS) return;
  lastBackgroundSync = Date.now();
  const status = await api<AppleHealthStatus>('/apple-health');
  if (status.connected) await syncAppleHealth(status.lastSyncedAt, status.connectedAt);
}

/**
 * Asks iOS to wake Jump when Apple Health gets new steps or a new workout, even with Jump closed, and
 * syncs then (at most every 10 minutes). iOS decides the timing: usually within the hour for steps.
 */
export async function startBackgroundSync() {
  const healthKit = loadHealthKit();
  if (!healthKit || listening.length) return;
  try {
    await healthKit.configureBackgroundTypes(['HKQuantityTypeIdentifierStepCount', healthKit.WorkoutTypeIdentifier], healthKit.UpdateFrequency.hourly);
    listening = (['HKQuantityTypeIdentifierStepCount', healthKit.WorkoutTypeIdentifier] as const).map((type) =>
      healthKit.subscribeToChanges(type, () => { void syncNow().catch(() => undefined); }));
  } catch {
    listening = [];
  }
}

/** Stops the background wake-ups, after disconnecting. */
export async function stopBackgroundSync() {
  for (const subscription of listening) subscription.remove();
  listening = [];
  await loadHealthKit()?.clearBackgroundTypes().catch(() => false);
}
