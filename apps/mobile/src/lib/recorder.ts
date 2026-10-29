/**
 * The phone's activity recorder: the web's lib/recorder.tsx, rebuilt as a store outside React so the
 * background location task can record, buffer and upload while the screen is locked or another app is open.
 *
 * Lifecycle: ask for location → POST /runs/start → background location updates → buffer to SQLite
 * → upload batches → pause/resume → flush → POST /runs/:id/finish (idempotent).
 *
 * Screens read it with `useRecorder()`, which has the same shape as the web hook.
 */
import type { Activity, Profile, RunSession, SampleUploadResult } from '@jump/shared/types';
import { MAX_USABLE_ACCURACY_METRES, measureTrack, type TrackPoint } from '@jump/shared/track';
import type { QueryClient } from '@tanstack/react-query';
import { isRunningInExpoGo } from 'expo';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import * as TaskManager from 'expo-task-manager';
import { useSyncExternalStore } from 'react';
import { router } from 'expo-router';
import { AppState, Platform } from 'react-native';
import { api, isApiError, post } from './api';
import { confirm } from './dialog';
import { syncLiveActivity } from './liveActivity';
import { keys } from './queries';
import { acknowledge, appendSamples, clearActiveRun, clearRun, countPending, countRecorded, getActiveRun, pendingSamples, recordedPoints, setActiveRun } from './run-buffer';
import { drainUploads, postPoints, queueUpload } from './run-uploads';
import { Storage } from './kv';
import { colors } from './theme';
import { toast } from './toast';

/** `saved`: finished with no signal; it's on the phone and submits itself once Jump can be reached. */
export type RecorderPhase = 'restoring' | 'unavailable' | 'idle' | 'locating' | 'recording' | 'paused' | 'finishing' | 'saved' | 'blocked';
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
  // Kept on the phone, so a run can carry on after an app restart with no signal.
  if (changes.session) rememberSession(changes.session);
  listeners.forEach((listener) => listener());
  // The lock screen and Dynamic Island follow every change, even with the app in the background.
  syncLiveActivity({
    phase: state.phase,
    session: state.session,
    metres: Math.max(state.localMetres, state.uploadedMetres),
    movingSeconds: movingSeconds(state.session, Date.now()),
    unit: queryClient?.getQueryData<Profile>(keys.profile)?.preferredUnit ?? 'km',
  });
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
    fixes.push({ latitude, longitude, accuracy, recordedAt: new Date(fix.timestamp), stepCount: motionAllowed ? totalSteps() : null });
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

async function watchInApp() {
  foregroundWatch ??= await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 1000 }, (fix) => onFixes([fix]));
}

async function startLocation() {
  if (FOREGROUND_ONLY) return watchInApp();
  if (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)) return;
  // Android refuses background updates without "Allow all the time": record while Jump is open instead.
  if (Platform.OS === 'android' && (await Location.getBackgroundPermissionsAsync().catch(() => null))?.status !== 'granted') return watchInApp();
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
  }).catch(() => watchInApp());
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

/* ───────────────────────── No signal ───────────────────────── */

/**
 * With no signal mid-run, pause, resume and finish still work: they're noted here with the moment they
 * happened, the screen updates at once, and `sync()` replays them, in order and with those times, once
 * Jump can be reached again. GPS points were already safe in the run buffer.
 */
/** `start`: begun with no signal, so Jump hasn't heard of the run yet; it's told first, with the phone's ID. */
type Moment = { type: 'start' | 'pause' | 'resume' | 'finish'; at: string } & Shown;
/** What the screen showed at End: saved as the activity's distance and steps, so they never change after. */
type Shown = { metres?: number; steps?: number };
const MOMENTS_KEY = (id: string) => `jump_run_moments:${id}`;
const SESSION_KEY = (id: string) => `jump_run_session:${id}`;
const SYNC_INTERVAL_MS = 15_000;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncJob: Promise<void> | null = null;

function queuedMoments(id: string): Moment[] {
  try { return JSON.parse(Storage.getItemSync(MOMENTS_KEY(id)) ?? '[]') as Moment[]; } catch { return []; }
}
function setQueuedMoments(id: string, moments: Moment[]) {
  try {
    if (moments.length) Storage.setItemSync(MOMENTS_KEY(id), JSON.stringify(moments));
    else Storage.removeItemSync(MOMENTS_KEY(id));
  } catch { /* storage unavailable: best effort */ }
}
function rememberSession(session: RunSession) {
  try { Storage.setItemSync(SESSION_KEY(session.id), JSON.stringify(session)); } catch { /* fine */ }
}
function recalledSession(id: string): RunSession | null {
  try { const raw = Storage.getItemSync(SESSION_KEY(id)); return raw ? JSON.parse(raw) as RunSession : null; } catch { return null; }
}
const noSignal = (error: unknown) => isApiError(error, 0);

/** The session as it stands after moments the server hasn't heard about yet, and the phase they leave. */
function applyMoments(session: RunSession, moments: Moment[]): { session: RunSession; phase: RecorderPhase } {
  let current = session;
  let phase: RecorderPhase = session.status === 'PAUSED' ? 'paused' : 'recording';
  for (const moment of moments) {
    if (moment.type === 'pause' && current.status !== 'PAUSED') {
      current = { ...current, status: 'PAUSED', pausedAt: moment.at };
      phase = 'paused';
    } else if (moment.type === 'resume' && current.pausedAt) {
      const paused = Math.max(0, Math.floor((new Date(moment.at).getTime() - new Date(current.pausedAt).getTime()) / 1000));
      current = { ...current, status: 'RUNNING', pausedAt: null, pausedSeconds: current.pausedSeconds + paused };
      phase = 'recording';
    } else if (moment.type === 'finish') {
      current = current.pausedAt ? current : { ...current, pausedAt: moment.at };
      phase = 'saved';
    }
  }
  return { session: current, phase };
}

function queueMoment(id: string, moment: Moment) {
  const moments = [...queuedMoments(id), moment];
  setQueuedMoments(id, moments);
  if (state.session) set({ session: applyMoments(state.session, [moment]).session, connection: 'offline' });
  startSyncing();
}

function startSyncing() {
  syncTimer ??= setInterval(() => void sync(), SYNC_INTERVAL_MS);
}
function stopSyncing() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;
}

/**
 * Back in signal: upload the GPS points, then tell the server about each pause, resume and finish, in
 * order, with the moment it really happened. Quietly waits if there's still no signal.
 */
function sync(): Promise<void> {
  const id = runId;
  if (!id) { stopSyncing(); return Promise.resolve(); }
  if (queuedMoments(id).length === 0) { stopSyncing(); return Promise.resolve(); }
  if (syncJob) return syncJob;
  let starting = false;
  syncJob = (async () => {
    try {
      let moments = queuedMoments(id);
      if (moments[0]?.type === 'start') {
        starting = true;
        await post<RunSession>('/runs/start', { activityType, id, startedAt: moments[0].at });
        starting = false;
        moments = moments.slice(1);
        setQueuedMoments(id, moments);
      }
      let server = await api<RunSession>(`/runs/${id}`);
      // Points are only accepted while the server has the run going: if it last heard "paused", the
      // resume that followed goes first.
      if (server.status === 'PAUSED' && moments[0]?.type === 'resume') {
        server = await post<RunSession>(`/runs/${id}/resume`, { at: moments[0].at });
        moments = moments.slice(1);
        setQueuedMoments(id, moments);
      }
      if (server.status === 'RUNNING') await flush();
      for (const moment of moments) {
        if (moment.type === 'finish') {
          const activity = await submitFinish(id, moment.at, moment.metres === undefined ? shownNumbers() : moment);
          setQueuedMoments(id, []);
          await reset({ keepPoints: Boolean(activity) });
          if (activity) queueUpload(id);
          set({ phase: 'idle', connection: 'online' });
          if (!activity) return;
          queryClient?.setQueryData(keys.activity(activity.id), activity);
          void queryClient?.invalidateQueries({ queryKey: keys.activities });
          toast({ tone: 'ok', title: 'Back in signal', message: `Your ${activity.activityType === 'cycle' ? 'ride' : activity.activityType} is saved.`, action: { label: 'View', run: () => router.push(`/activities/${activity.id}`) } });
          return;
        }
        server = await post<RunSession>(`/runs/${id}/${moment.type}`, { at: moment.at });
        setQueuedMoments(id, queuedMoments(id).slice(1));
      }
      set({ session: server, connection: 'online' });
      stopSyncing();
      if (server.status === 'RUNNING') void flush();
    } catch (error) {
      if (offline(error)) set({ connection: 'offline' });
      else if (state.phase === 'saved' && refused(error) && !starting) {
        // Jump will never take this finish (ended elsewhere, or gone): let it go rather than retry forever.
        await reset();
        set({ phase: 'idle', connection: 'online' });
      }
    } finally {
      syncJob = null;
      if (runId === id) set({ pendingCount: countPending(id) });
    }
  })();
  return syncJob;
}

/* ───────────────────────── Upload ───────────────────────── */

/** Upload everything buffered for the run. Resolves `true` when nothing is left. */
function flush(): Promise<boolean> {
  const id = runId;
  if (!id) return Promise.resolve(true);
  if (queuedMoments(id)[0]?.type === 'start') return Promise.resolve(false);
  if (flushJob) return flushJob;
  flushJob = (async () => {
    try {
      for (;;) {
        const batch = pendingSamples(id, 500);
        if (batch.length === 0) break;
        const result = await postPoints<SampleUploadResult>(id, batch);
        acknowledge(id, batch.map((sample) => sample.sequence));
        set({ uploadedMetres: result.distanceMetres });
      }
      set({ connection: 'online' });
      return true;
    } catch (error) {
      if (isApiError(error, 0)) set({ connection: 'offline' });
      else if (isApiError(error, 400)) {
        // The server only accepts samples while RUNNING — resync our view of the session.
        // With moments from a no-signal stretch still to replay, the phone's view stands: sync sorts it.
        if (queuedMoments(id).length) void sync();
        else {
          const fresh = await api<RunSession>(`/runs/${id}`).catch(() => null);
          if (fresh) set({ session: fresh });
        }
      } else if (__DEV__) console.warn('GPS upload failed; it will be tried again:', error instanceof Error ? error.message : error);
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
  if (next === 'active') void sync();
});

/* ───────────────────────── Lifecycle ───────────────────────── */

/**
 * Take on a run, new or picked back up after a restart. The distance is measured again from every point
 * on the phone, so the number on screen covers the whole run, not just what came after reopening.
 */
function adopt(run: RunSession) {
  runId = run.id;
  activityType = run.activityType;
  fixes = recordedPoints(run.id);
  lastFixTime = fixes.length ? fixes[fixes.length - 1].recordedAt.getTime() : 0;
  stepsBefore = Math.max(run.stepCount ?? 0, ...fixes.map((fix) => fix.stepCount ?? 0));
  stepsNow = 0;
  const localMetres = fixes.length ? measureTrack(fixes, { trailing: true, activityType }).distanceMetres : run.distanceMetres;
  const route = fixes.filter((fix) => (fix.accuracy ?? 999) <= MAX_USABLE_ACCURACY_METRES).map((fix) => [fix.latitude, fix.longitude] as [number, number]);
  set({ session: run, uploadedMetres: run.distanceMetres, localMetres, route });
}

function shownNumbers(): Shown {
  return {
    metres: Math.round(Math.max(state.localMetres, state.uploadedMetres)),
    ...(motionAllowed && activityType !== 'cycle' ? { steps: totalSteps() } : {}),
  };
}

/** Back to no run. With `keepPoints`, the run's GPS points stay on the phone for the background upload. */
async function reset({ keepPoints = false } = {}) {
  await stopWatching();
  const id = runId;
  runId = null;
  fixes = [];
  lastFixTime = 0;
  lastFix = null;
  stepsBefore = 0;
  stepsNow = 0;
  clearActiveRun();
  stopSyncing();
  if (id) {
    if (!keepPoints) clearRun(id);
    setQueuedMoments(id, []);
    try { Storage.removeItemSync(SESSION_KEY(id)); } catch { /* fine */ }
  }
  set({ session: null, uploadedMetres: 0, localMetres: 0, steps: null, pendingCount: 0, accuracy: null, lastFixAt: null, route: [], position: null });
}

/** Called once a runner is signed in: picks up a run that was in progress when the app last closed. */
export async function restoreRecorder(forUser: string, client: QueryClient, force = false) {
  queryClient = client;
  if (!force && userId === forUser && state.phase !== 'restoring' && state.phase !== 'unavailable') return;
  userId = forUser;
  void drainUploads();
  const pointer = getActiveRun(forUser);
  set({ phase: 'restoring', error: null });
  const unsent = pointer && queuedMoments(pointer.runId)[0]?.type === 'start' ? recalledSession(pointer.runId) : null;
  if (unsent) {
    await carryOnFromPhone(unsent);
    void sync();
    return;
  }
  try {
    const activeRun = await api<RunSession | null>('/runs/active');
    const run = activeRun ?? (pointer ? await api<RunSession>(`/runs/${pointer.runId}`) : null);
    if (!run) {
      set({ phase: 'idle', error: null });
      return;
    }
    setActiveRun({ runId: run.id, userId: forUser, startedAt: run.startedAt, activityType: run.activityType });
    adopt(run);
    set({ pendingCount: countPending(run.id) });
    motionAllowed = run.activityType !== 'cycle' && (await Pedometer.getPermissionsAsync().then((permission) => permission.granted).catch(() => false));
    if (motionAllowed) set({ steps: totalSteps() });
    // Moments from a stretch with no signal that the server hasn't heard yet: the phone's view wins.
    const moments = queuedMoments(run.id);
    if (moments.length && ['RUNNING', 'PAUSED'].includes(run.status)) {
      const local = applyMoments(run, moments);
      set({ session: local.session, phase: local.phase });
      if (local.phase === 'recording') await startWatching();
      startSyncing();
      void sync();
      return;
    }
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
    // No signal on reopening mid-run: carry on from what the phone remembers instead of stopping.
    const remembered = pointer ? recalledSession(pointer.runId) : null;
    if (noSignal(error) && remembered) {
      await carryOnFromPhone(remembered);
      return;
    }
    if (isApiError(error, 404)) {
      if (pointer) clearRun(pointer.runId);
      await reset();
      set({ phase: 'idle' });
    } else {
      set({ phase: 'unavailable', error: error instanceof Error ? error.message : 'Couldn’t restore your run.' });
    }
  }
}

/** Pick a run back up from what the phone remembers, when Jump can't be asked (or doesn't know it yet). */
async function carryOnFromPhone(remembered: RunSession) {
  adopt(remembered);
  const local = applyMoments(remembered, queuedMoments(remembered.id));
  motionAllowed = remembered.activityType !== 'cycle' && (await Pedometer.getPermissionsAsync().then((permission) => permission.granted).catch(() => false));
  set({ session: local.session, phase: local.phase, connection: 'offline', pendingCount: countPending(remembered.id), ...(motionAllowed ? { steps: totalSteps() } : {}) });
  if (local.phase === 'recording') await startWatching();
  startSyncing();
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

/**
 * Google Play requires a clear explanation in the app before Android's "Allow all the time" prompt, so
 * Android asks first in our own words. Saying no still records, just only while Jump is open.
 */
async function requestBackground() {
  const current = await Location.getBackgroundPermissionsAsync();
  if (current.status === 'granted' || Platform.OS !== 'android') return Location.requestBackgroundPermissionsAsync();
  const ok = await confirm({
    title: 'Keep recording with the screen off',
    message: 'Jump collects your location to record your walk, run or ride (its route and distance) even when the app is closed or not in use, for example with your phone locked in your pocket. Location is only collected while an activity you started is recording, and stops when you finish.\n\nOn the next screen, choose “Allow all the time”.',
    confirmLabel: 'Continue',
    cancelLabel: 'Not now',
  });
  return ok ? Location.requestBackgroundPermissionsAsync() : current;
}

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
  const background = FOREGROUND_ONLY ? null : await requestBackground();
  const motion = kind === 'cycle' ? false : await requestMotion();
  // Starting needs permission, not a precise fix: weak fixes are filtered out when measuring.
  const first = await Location.getLastKnownPositionAsync({ maxAge: 30_000 }).catch(() => null);
  const id = newRunId();
  const startedAt = new Date().toISOString();
  const begin = async (run: RunSession) => {
    setActiveRun({ runId: run.id, userId: run.userId, startedAt: run.startedAt, activityType: kind });
    adopt(run);
    fixes = [];
    lastFixTime = 0;
    stepsBefore = 0;
    motionAllowed = motion;
    set({ phase: 'recording', steps: kind === 'cycle' ? null : motion ? 0 : null, localMetres: 0, route: [], gpsError: first ? null : WAITING_FOR_GPS });
    if (first) onFixes([first]);
    await startWatching();
  };
  try {
    await begin(await post<RunSession>('/runs/start', { activityType: kind, id, startedAt }));
  } catch (error) {
    if (noSignal(error)) {
      // No signal at the start line: record anyway. Jump is told about the run, with this ID, when it can be reached.
      setQueuedMoments(id, [{ type: 'start', at: startedAt }]);
      await begin({ id, userId, status: 'RUNNING', startedAt, finishedAt: null, distanceMetres: 0, activityType: kind, stepCount: 0, pausedAt: null, pausedSeconds: 0, createdAt: startedAt });
      set({ connection: 'offline' });
      startSyncing();
    } else if (isApiError(error, 409)) {
      const currentUserId = userId;
      const currentQueryClient = queryClient;
      if (currentUserId && currentQueryClient) {
        set({ phase: 'restoring' });
        await restoreRecorder(currentUserId, currentQueryClient, true);
      } else {
        set({ phase: 'blocked' });
      }
    } else {
      set({ phase: 'idle', error: error instanceof Error ? error.message : 'Couldn’t start your activity.' });
    }
    return null;
  }
  return background && background.status !== 'granted' ? 'background-denied' : null;
}

async function pause() {
  const id = runId;
  if (!id) return;
  set({ error: null, phase: 'paused' });
  const at = new Date().toISOString();
  checkpointSteps();
  await stopWatching();
  // Only straight to the server when nothing's waiting to be replayed first (order matters).
  if (queuedMoments(id).length === 0) {
    await flush();
    try {
      set({ session: await post<RunSession>(`/runs/${id}/pause`, { at }) });
      return;
    } catch (error) {
      if (!noSignal(error)) {
        set({ error: error instanceof Error ? error.message : 'Couldn’t pause.', phase: 'recording' });
        await startWatching();
        return;
      }
    }
  }
  // No signal: paused on the phone; the server hears (with this time) when it's back.
  queueMoment(id, { type: 'pause', at });
}

async function resume() {
  const id = runId;
  if (!id) return;
  set({ error: null });
  const at = new Date().toISOString();
  if (queuedMoments(id).length === 0) {
    try {
      set({ session: await post<RunSession>(`/runs/${id}/resume`, { at }), phase: 'recording' });
      await startWatching();
      void flush();
      return;
    } catch (error) {
      if (!noSignal(error)) {
        set({ error: error instanceof Error ? error.message : 'Couldn’t resume.' });
        return;
      }
    }
  }
  // No signal: carry on recording; points wait on the phone and the resume is replayed later.
  queueMoment(id, { type: 'resume', at });
  set({ phase: 'recording' });
  await startWatching();
}

/**
 * End never waits for GPS uploads. The run is finished with one small request carrying the phone's point
 * count and distance, and the points still on the phone follow in the background (run-uploads). With no
 * signal, or no answer in time, it's finished on the phone and submitted by `sync()` later.
 */
async function finish(): Promise<Activity | null> {
  const id = runId;
  if (!id) return null;
  const shown = shownNumbers();
  set({ error: null, phase: 'finishing' });
  checkpointSteps();
  await stopWatching();
  const at = new Date().toISOString();
  // With earlier offline moments still to replay, this one joins the queue behind them.
  if (queuedMoments(id).length > 0) return finishOffline(id, at, shown);
  try {
    const activity = await submitFinish(id, at, shown);
    await reset({ keepPoints: Boolean(activity) });
    set({ phase: 'idle' });
    if (!activity) return null;
    queueUpload(id);
    queryClient?.setQueryData(keys.activity(activity.id), activity);
    void queryClient?.invalidateQueries({ queryKey: keys.activities });
    return activity;
  } catch (error) {
    if (!refused(error)) return finishOffline(id, at, shown);
    // Jump says this run can't be finished (ended on another device, or already gone): let it go here.
    await reset();
    set({ phase: 'idle' });
    return null;
  }
}

const FINISH_TIMEOUT_MS = 12_000;

/** A run's ID is made on the phone, so a run can start with no signal and keep the same ID everywhere. */
function newRunId(): string {
  const native = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  if (native) return native.call((globalThis as { crypto?: object }).crypto);
  const hex = (count: number) => Array.from({ length: count }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}
const offline = (error: unknown) => noSignal(error) || (error as { name?: string } | null)?.name === 'AbortError';
/** A definite no from Jump about this run, as opposed to signal, sign-in or server trouble worth retrying. */
const refused = (error: unknown) => isApiError(error) && error.status >= 400 && error.status < 500 && ![401, 408, 429].includes(error.status);

/**
 * Tell Jump the run is over: when, how many points this phone recorded and how far it measured. Jump
 * accepts it straight away and checks the run once the points have arrived. Null when GPS measured
 * nothing at all: there's no activity, and the run is simply gone.
 */
async function submitFinish(id: string, at: string, shown: Shown): Promise<Activity | null> {
  const body = { at, sampleCount: countRecorded(id), deferred: true, ...(shown.metres !== undefined ? { distanceMetres: shown.metres } : {}), ...(shown.steps !== undefined ? { steps: shown.steps } : {}) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FINISH_TIMEOUT_MS);
  const send = (payload: object) => api<Activity>(`/runs/${id}/finish`, { method: 'POST', body: payload, signal: controller.signal });
  try {
    // An older server either asks for missing points (409) or doesn't know the newer fields (400):
    // finishing with just the time still ends the run, so it's never dropped over a version mismatch.
    return await send(body).catch((error: unknown) => (isApiError(error, 409) || isApiError(error, 400) ? send({ at }) : Promise.reject(error)));
  } catch (error) {
    if (isApiError(error, 422)) {
      toast({ tone: 'info', title: 'Nothing to save', message: 'GPS didn’t measure any distance, so there’s no activity to keep.' });
      return null;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Finished with no signal: saved on the phone, submitted by `sync()` when Jump can be reached. */
function finishOffline(id: string, at: string, shown: Shown): null {
  queueMoment(id, { type: 'finish', at, ...shown });
  set({ phase: 'saved' });
  return null;
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
  /** Try submitting what was saved with no signal now, instead of waiting for the next attempt. */
  syncNow: () => void sync(),
  retryRestore: () => {
    if (userId && queryClient) void restoreRecorder(userId, queryClient, true);
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
  // Distance is GPS alone, as the server counts it: steps are shown as steps, never turned into distance,
  // because a shaken phone counts steps too.
  return {
    ...current,
    distanceMetres: Math.max(current.uploadedMetres, current.localMetres),
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
