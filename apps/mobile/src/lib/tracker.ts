import type { TrackPoint } from '@jump/shared/track';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

const TASK = 'jump-track';
/** Expo Go can't run background location on iOS, so there it only tracks while the app is open. */
export const FOREGROUND_ONLY = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
let foregroundWatch: Location.LocationSubscription | null = null;

export type TrackerState = { status: 'idle' | 'tracking'; points: TrackPoint[]; startedAt: Date | null };

let state: TrackerState = { status: 'idle', points: [], startedAt: null };
const listeners = new Set<(state: TrackerState) => void>();

function emit(next: TrackerState) {
  state = next;
  listeners.forEach((listener) => listener(state));
}

function record(fixes: Location.LocationObject[]) {
  const fresh = fixes.map((fix) => ({
    latitude: fix.coords.latitude,
    longitude: fix.coords.longitude,
    accuracy: fix.coords.accuracy,
    recordedAt: new Date(fix.timestamp),
  }));
  emit({ ...state, points: [...state.points, ...fresh] });
}

// Must be defined at module load, not in a component, so the OS can wake the app with fixes.
if (!FOREGROUND_ONLY) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
    if (!error && data) record(data.locations);
  });
}

export function subscribe(listener: (state: TrackerState) => void) {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export type StartResult = 'started' | 'foreground-denied' | 'background-denied';

export async function startTracking(activityType: 'walk' | 'run' | 'cycle'): Promise<StartResult> {
  // Background permission can only be requested after foreground is granted.
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return 'foreground-denied';
  if (FOREGROUND_ONLY) {
    emit({ status: 'tracking', points: [], startedAt: new Date() });
    foregroundWatch = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 1000 },
      (fix) => record([fix]),
    );
    return 'started';
  }
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') return 'background-denied';

  emit({ status: 'tracking', points: [], startedAt: new Date() });
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 3,
    timeInterval: 1000,
    activityType: activityType === 'cycle' ? Location.ActivityType.OtherNavigation : Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Jump is tracking your activity',
      notificationBody: 'Distance keeps counting while your screen is off.',
      notificationColor: '#FF4D12',
    },
  });
  return 'started';
}

export async function stopTracking(): Promise<TrackerState> {
  foregroundWatch?.remove();
  foregroundWatch = null;
  if (!FOREGROUND_ONLY && (await Location.hasStartedLocationUpdatesAsync(TASK))) await Location.stopLocationUpdatesAsync(TASK);
  const finished = state;
  emit({ ...state, status: 'idle' });
  return finished;
}
