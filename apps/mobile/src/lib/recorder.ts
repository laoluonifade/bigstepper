/**
 * The phone's activity recorder: the web's lib/recorder.tsx, rebuilt as a store outside React so the
 * background location task can record, buffer and upload while the screen is locked or another app is open.
 *
 * Lifecycle: ask for location → POST /runs/start → background location updates → buffer to SQLite
 * → upload batches → pause/resume → flush → POST /runs/:id/finish (idempotent).
 *
 * Screens read it with `useRecorder()`, which has the same shape as the web hook.
 */
import type { Activity, RunSession, SampleUploadResult } from '@jump/shared/types';
import { MAX_USABLE_ACCURACY_METRES, measureTrack, stepDistanceMetres, type TrackPoint } from '@jump/shared/track';
import type { QueryClient } from '@tanstack/react-query';
import { isRunningInExpoGo } from 'expo';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import * as TaskManager from 'expo-task-manager';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { api, isApiError, post } from './api';
import { keys } from './queries';
import { acknowledge, appendSamples, clearActiveRun, clearRun, countPending, getActiveRun, pendingSamples, setActiveRun } from './run-buffer';
import { colors } from './theme';

export type RecorderPhase = 'restoring' | 'unavailable' | 'idle' | 'locating' | 'recording' | 'paused' | 'finishing' | 'blocked';
export type Connection = 'online' | 'offline';
export type ActivityKind = 'walk' | 'run' | 'cycle';

const TASK = 'jump-track';
/** Expo Go can't run background location, so there it only tracks while the app is open. */
export const FOREGROUND_ONLY = isRunningInExpoGo();
const FLUSH_INTERVAL_MS = 8_000;
const FLUSH_THRESHOLD = 20;
const WAITING_FOR_GPS = 'Waiting for GPS to lock on. Head outdoors with a clear view of the sky.';

interface State {
  phase: RecorderPhase;
  session: RunSession | null;
  uploadedMetres: number;
  localMetres: number;
  steps: number | null;
  pendingCount: number;
  connection: Connection;
  accuracy: number | null;
  lastFixAt: number | null;
  /** Usable fixes so far, [lat, lng], for drawing the route live. */
  route: Array<[number, number]>;
  position: { latitude: number; longitude: number; accuracy: number | null } | null;
  gpsError: string | null;
  error: string | null;
}

const INITIAL: State = {
  phase: 'restoring', session: null, uploadedMetres: 0, localMetres: 0, steps: null, pendingCount: 0, connection: 'online',
  accuracy: null, lastFixAt: null, route: [], position: null, gpsError: null, error: null,
};

let state: State = INITIAL;
const listeners = new Set<() => void>();

function set(changes: Partial<State>) {
  state = { ...state, ...changes };
  listeners.forEach((listener) => listener());
}

// Everything below is the run in progress, kept outside React so the background task can use it.
let userId: string | null = null;
let runId: string | null = null;
let activityType: ActivityKind = 'run';
let queryClient: QueryClient | null = null;
/** Fixes recorded on this phone for the current run, measured with the server's rule. */
let fixes: TrackPoint[] = [];
let lastFixTime = 0;
let lastFix: { latitude: number; longitude: number; accuracy: number } | null = null;
/** Steps this run: earlier segments' total plus the live count since the last start or resume. */
let stepsBefore = 0;
let stepsNow = 0;
let motionAllowed = false;
let pedometer: { remove: () => void } | null = null;
let foregroundWatch: Location.LocationSubscription | null = null;
let flushJob: Promise<boolean> | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;

const totalSteps = () => stepsBefore + stepsNow;

/* ───────────────────────── Location ───────────────────────── */

function onFixes(locations: Location.LocationObject[]) {
  if (!runId || state.phase !== 'recording') return;
  const fresh = locations.filter((fix) => fix.timestamp > lastFixTime).sort((a, b) => a.timestamp - b.timestamp);
  if (fresh.length === 0) return;
  const samples = [];
  const route = [...state.route];
  let gpsError: string | null = null;
  for (const fix of fresh) {
    const { latitude, longitude } = fix.coords;
    const accuracy = fix.coords.accuracy ?? 999;
    lastFixTime = fix.timestamp;
    // Same rule the server verifies with (trailing-only, as the future isn't known yet).
    fixes.push({ latitude, longitude, accuracy, recordedAt: new Date(fix.timestamp) });
    if (accuracy <= MAX_USABLE_ACCURACY_METRES) route.push([latitude, longitude]);
    else gpsError = `Weak GPS (±${Math.round(accuracy)} m). Head outdoors with open sky. Weak fixes don’t count.`;
    lastFix = { latitude, longitude, accuracy: Math.round(accuracy * 10) / 10 };
    samples.push({ ...lastFix, ...(motionAllowed ? { stepCount: totalSteps() } : {}), recordedAt: new Date(fix.timestamp).toISOString() });
  }
  appendSamples(runId, samples);
  const latest = fresh[fresh.length - 1];
  const pendingCount = countPending(runId);
  set({
    accuracy: latest.coords.accuracy ?? null,
    lastFixAt: latest.timestamp,
    position: { latitude: latest.coords.latitude, longitude: latest.coords.longitude, accuracy: latest.coords.accuracy ?? null },
    route,
    gpsError,
    localMetres: measureTrack(fixes, { trailing: true, activityType }).distanceMetres,
    pendingCount,
  });
  if (pendingCount >= FLUSH_THRESHOLD) void flush();
}

// Must be defined at module load, not in a component, so the OS can wake the app with fixes.
if (!FOREGROUND_ONLY && !TaskManager.isTaskDefined(TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
    if (!error && data) onFixes(data.locations);
  });
}

async function startLocation() {
  if (FOREGROUND_ONLY) {
    foregroundWatch ??= await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 1000 }, (fix) => onFixes([fix]));
    return;
  }
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) return;
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 3,
    timeInterval: 1000,
    activityType: activityType === 'cycle' ? Location.ActivityType.OtherNavigation : Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: activityType === 'cycle' ? 'Jump is recording your ride' : `Jump is recording your ${activityType}`,
      notificationBody: 'Distance keeps counting while your screen is off.',
      notificationColor: colors.track,
      killServiceOnDestroy: false,
    },
  });
}

async function stopLocation() {
  foregroundWatch?.remove();
  foregroundWatch = null;
  if (!FOREGROUND_ONLY && (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false))) await Location.stopLocationUpdatesAsync(TASK).catch(() => undefined);
}

function startSteps() {
  if (activityType === 'cycle' || !motionAllowed || pedometer) return;
  stepsNow = 0;
  pedometer = Pedometer.watchStepCount((result) => {
    stepsNow = result.steps;
    set({ steps: totalSteps() });
  });
}

function stopSteps() {
  pedometer?.remove();
  pedometer = null;
  stepsBefore = totalSteps();
  stepsNow = 0;
}

async function requestMotion() {
  try {
    if (!(await Pedometer.isAvailableAsync())) return false;
    return (await Pedometer.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

function startUploading() {
  flushTimer ??= setInterval(() => void flush(), FLUSH_INTERVAL_MS);
}

function stopUploading() {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
}

async function startWatching() {
  startSteps();
  startUploading();
  await startLocation();
}

async function stopWatching() {
  stopUploading();
  stopSteps();
  await stopLocation();
}

/** Record the latest step total now, so steps taken since the last GPS fix aren't lost on pause/finish. */
function checkpointSteps() {
  if (!runId || !lastFix || !motionAllowed) return;
  appendSamples(runId, [{ ...lastFix, stepCount: totalSteps(), recordedAt: new Date().toISOString() }]);
}

/* ───────────────────────── Upload ───────────────────────── */

/** Upload everything buffered for the run. Resolves `true` when nothing is left. */
function flush(): Promise<boolean> {
  const id = runId;
  if (!id) return Promise.resolve(true);
  if (flushJob) return flushJob;
  flushJob = (async () => {
    try {
      for (;;) {
        const batch = pendingSamples(id, 500);
        if (batch.length === 0) break;
        const result = await post<SampleUploadResult>(`/runs/${id}/samples`, {
          samples: batch.map(({ sequence, latitude, longitude, accuracy, stepCount, recordedAt }) => ({
            sequence, latitude, longitude, ...(accuracy !== undefined ? { accuracy } : {}), ...(stepCount !== undefined ? { stepCount } : {}), recordedAt,
          })),
        });
        acknowledge(id, batch.map((sample) => sample.sequence));
        set({ uploadedMetres: result.distanceMetres });
      }
      set({ connection: 'online' });
      return true;
    } catch (error) {
      if (isApiError(error, 0)) set({ connection: 'offline' });
      else if (isApiError(error, 400)) {
        // The server only accepts samples while RUNNING — resync our view of the session.
        const fresh = await api<RunSession>(`/runs/${id}`).catch(() => null);
        if (fresh) set({ session: fresh });
      } else if (error instanceof Error) set({ error: error.message });
      return false;
    } finally {
      flushJob = null;
      if (runId === id) set({ pendingCount: countPending(id) });
    }
  })();
  return flushJob;
}

// Coming back to the app is a good moment to send whatever the background task buffered.
AppState.addEventListener('change', (next) => {
  if (next === 'active' && state.phase === 'recording') void flush();
});

/* ───────────────────────── Lifecycle ───────────────────────── */

function adopt(run: RunSession) {
  runId = run.id;
  activityType = run.activityType;
  stepsBefore = run.stepCount ?? 0; // carry on from the server's total after a restart
  stepsNow = 0;
  set({ session: run, uploadedMetres: run.distanceMetres, localMetres: run.distanceMetres });
}

async function reset() {
  await stopWatching();
  const id = runId;
  runId = null;
  fixes = [];
  lastFixTime = 0;
  lastFix = null;
  stepsBefore = 0;
  stepsNow = 0;
  clearActiveRun();
  if (id) clearRun(id);
  set({ session: null, uploadedMetres: 0, localMetres: 0, steps: null, pendingCount: 0, accuracy: null, lastFixAt: null, route: [], position: null });
}

/** Called once a runner is signed in: picks up a run that was in progress when the app last closed. */
export async function restoreRecorder(forUser: string, client: QueryClient) {
  queryClient = client;
  if (userId === forUser && state.phase !== 'restoring' && state.phase !== 'unavailable') return;
  userId = forUser;
  const pointer = getActiveRun(forUser);
  if (!pointer) {
    set({ phase: 'idle', error: null });
    return;
  }
  set({ phase: 'restoring', error: null });
  try {
    const run = await api<RunSession>(`/runs/${pointer.runId}`);
    adopt(run);
    set({ pendingCount: countPending(run.id) });
    motionAllowed = run.activityType !== 'cycle' && (await Pedometer.getPermissionsAsync().then((permission) => permission.granted).catch(() => false));
    if (motionAllowed) set({ steps: totalSteps() });
    if (run.status === 'RUNNING') {
      set({ phase: 'recording' });
      await startWatching();
      void flush();
    } else if (run.status === 'PAUSED') {
      set({ phase: 'paused' });
    } else {
      // Finished elsewhere (or finish succeeded just before the app closed).
      await reset();
      set({ phase: 'idle' });
    }
  } catch (error) {
    if (isApiError(error, 404)) {
      await reset();
      set({ phase: 'idle' });
    } else {
      set({ phase: 'unavailable', error: error instanceof Error ? error.message : 'Couldn’t restore your run.' });
    }
  }
}

/** Signed out: stop listening, but leave a run in progress buffered for when they sign back in. */
export async function detachRecorder() {
  await stopWatching();
  userId = null;
  runId = null;
  state = INITIAL;
  listeners.forEach((listener) => listener());
}

export type StartProblem = 'foreground-denied' | 'background-denied' | null;

async function start(kind: ActivityKind = 'run'): Promise<StartProblem> {
  if (!userId) return null;
  set({ error: null, gpsError: null, phase: 'locating' });
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    set({ phase: 'idle', gpsError: 'Jump needs your location to measure distance. Allow it in Settings.' });
    return 'foreground-denied';
  }
  // Background permission can only be asked for after foreground is granted. Without it, recording still
  // works while Jump is open.
  const background = FOREGROUND_ONLY ? null : await Location.requestBackgroundPermissionsAsync();
  const motion = kind === 'cycle' ? false : await requestMotion();
  // Starting needs permission, not a precise fix: weak fixes are filtered out when measuring.
  const first = await Location.getLastKnownPositionAsync({ maxAge: 30_000 }).catch(() => null);
  try {
    const run = await post<RunSession>('/runs/start', { activityType: kind });
    setActiveRun({ runId: run.id, userId, startedAt: run.startedAt, activityType: kind });
    adopt(run);
    fixes = [];
    lastFixTime = 0;
    stepsBefore = 0;
    motionAllowed = motion;
    set({ phase: 'recording', steps: kind === 'cycle' ? null : motion ? 0 : null, localMetres: 0, route: [], gpsError: first ? null : WAITING_FOR_GPS });
    if (first) onFixes([first]);
    await startWatching();
  } catch (error) {
    if (isApiError(error, 409)) set({ phase: 'blocked' });
    else set({ phase: 'idle', error: error instanceof Error ? error.message : 'Couldn’t start your activity.' });
    return null;
  }
  return background && background.status !== 'granted' ? 'background-denied' : null;
}

async function pause() {
  const id = runId;
  if (!id) return;
  set({ error: null, phase: 'paused' });
  checkpointSteps();
  await stopWatching();
  await flush();
  try {
    set({ session: await post<RunSession>(`/runs/${id}/pause`) });
  } catch (error) {
    set({ error: error instanceof Error ? error.message : 'Couldn’t pause.', phase: 'recording' });
    await startWatching();
  }
}

async function resume() {
  const id = runId;
  if (!id) return;
  set({ error: null });
  try {
    set({ session: await post<RunSession>(`/runs/${id}/resume`), phase: 'recording' });
    await startWatching();
    void flush();
  } catch (error) {
    set({ error: error instanceof Error ? error.message : 'Couldn’t resume.' });
  }
}

async function finish(): Promise<Activity | null> {
  const id = runId;
  if (!id) return null;
  set({ error: null, phase: 'finishing' });
  checkpointSteps();
  await stopWatching();
  let status = state.session?.status;
  try {
    if (countPending(id) > 0) {
      // Samples are only accepted while RUNNING, so briefly resume a paused run to upload the tail.
      if (status === 'PAUSED') {
        const resumed = await post<RunSession>(`/runs/${id}/resume`);
        set({ session: resumed });
        status = resumed.status;
      }
      if (!(await flush())) {
        const left = countPending(id);
        throw new Error(`${left} GPS ${left === 1 ? 'point is' : 'points are'} still waiting to upload. Check your connection and press finish again.`);
      }
    }
    const activity = await post<Activity>(`/runs/${id}/finish`);
    await reset();
    set({ phase: 'idle' });
    queryClient?.setQueryData(keys.activity(activity.id), activity);
    void queryClient?.invalidateQueries({ queryKey: keys.activities });
    return activity;
  } catch (error) {
    const backTo = status === 'PAUSED' ? 'paused' : 'recording';
    set({ error: error instanceof Error ? error.message : 'Couldn’t finish your activity.', phase: backTo });
    if (backTo === 'recording') await startWatching();
    return null;
  }
}

/** Throw the current run away: nothing is saved or submitted. */
async function discard(): Promise<boolean> {
  const id = runId;
  if (!id) return false;
  const previous = state.phase;
  set({ error: null, phase: 'finishing' });
  await stopWatching();
  try {
    await post(`/runs/${id}/discard`);
    await reset();
    set({ phase: 'idle' });
    return true;
  } catch (error) {
    // Already gone on the server (discarded on another device): clear it here too.
    if (isApiError(error, 404)) {
      await reset();
      set({ phase: 'idle' });
      return true;
    }
    const backTo = previous === 'paused' ? 'paused' : 'recording';
    set({ error: error instanceof Error ? error.message : 'Couldn’t discard your activity.', phase: backTo });
    if (backTo === 'recording') await startWatching();
    return false;
  }
}

const actions = {
  start,
  pause,
  resume,
  finish,
  discard,
  retryRestore: () => {
    if (userId && queryClient) void restoreRecorder(userId, queryClient);
  },
  clearError: () => set({ error: null }),
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useRecorder() {
  const current = useSyncExternalStore(subscribe, () => state);
  // Indoors GPS sees nothing; steps × stride is the honest estimate there.
  const stepMetres = current.steps ? stepDistanceMetres(current.steps, current.session?.activityType ?? 'walk') : 0;
  const measured = Math.max(current.uploadedMetres, current.localMetres);
  return {
    ...current,
    distanceMetres: Math.max(measured, stepMetres),
    distanceFromSteps: stepMetres > measured,
    ...actions,
  };
}

/** Moving time in seconds, derived from the server's pause bookkeeping. */
export function movingSeconds(session: RunSession | null, now: number) {
  if (!session) return 0;
  const started = new Date(session.startedAt).getTime();
  const pausedNow = session.pausedAt ? Math.max(0, now - new Date(session.pausedAt).getTime()) : 0;
  return Math.max(0, Math.floor((now - started - pausedNow) / 1000) - session.pausedSeconds);
}
