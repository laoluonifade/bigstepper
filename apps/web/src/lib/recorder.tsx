/**
 * App-level run recorder. It lives above the router outlet so GPS keeps flowing
 * while the runner glances at a leaderboard mid-run.
 *
 * Lifecycle: ask for location → POST /runs/start → watch GPS → buffer to IndexedDB
 * → upload batches → pause/resume → flush → POST /runs/:id/finish (idempotent).
 */
import { useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, isApiError, post } from './api';
import { describeGeoError, getCurrentPosition } from './geo';
import { requestMotionPermission, startPedometer, type Pedometer } from './pedometer';
import { MAX_USABLE_ACCURACY_METRES, measureTrack, stepDistanceMetres, TrackPoint } from './track';
import { keys } from './queries';
import {
  acknowledge,
  appendSample,
  clearActiveRun,
  clearRun,
  countPending,
  getActiveRun,
  pendingSamples,
  setActiveRun,
} from './run-buffer';
import type { Activity, RunSession, SampleUploadResult, User } from './types';

export type RecorderPhase =
  | 'restoring'
  | 'unavailable'
  | 'idle'
  | 'locating'
  | 'recording'
  | 'paused'
  | 'finishing'
  | 'blocked';

export type Connection = 'online' | 'offline';

/** Fired by the bottom nav's Start button on the run page; the run screen opens its start flow. */
export const START_ACTIVITY_EVENT = 'jump:start-activity';

interface RecorderState {
  phase: RecorderPhase;
  session: RunSession | null;
  /** Best live estimate: GPS distance, or steps × stride when that's larger (indoors). */
  distanceMetres: number;
  /** Steps counted by the motion sensors this run (null when the phone can't count steps). */
  steps: number | null;
  /** True when the step estimate is what the live distance is showing. */
  distanceFromSteps: boolean;
  uploadedMetres: number;
  pendingCount: number;
  connection: Connection;
  accuracy: number | null;
  lastFixAt: number | null;
  /** Usable fixes so far, [lat, lng], for drawing the route live. */
  route: Array<[number, number]>;
  /** Latest fix, for the "you are here" dot. */
  position: { latitude: number; longitude: number; accuracy: number | null } | null;
  gpsError: string | null;
  error: string | null;
  /** `fix`: a recent position the page already has (the map's), so starting doesn't wait for a new one. */
  start: (activityType?: 'walk' | 'run' | 'cycle', fix?: GeolocationPosition | null) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  finish: () => Promise<Activity | null>;
  /** Throw the current run away: nothing is saved or submitted. */
  discard: () => Promise<boolean>;
  retryRestore: () => void;
  clearError: () => void;
}

const RecorderContext = createContext<RecorderState | null>(null);

const FLUSH_INTERVAL_MS = 8_000;
const FLUSH_THRESHOLD = 20;

export function RecorderProvider({ user, children }: { user: User; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<RecorderPhase>('restoring');
  const [session, setSession] = useState<RunSession | null>(null);
  const [uploadedMetres, setUploadedMetres] = useState(0);
  const [localMetres, setLocalMetres] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [connection, setConnection] = useState<Connection>('online');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);
  const [route, setRoute] = useState<Array<[number, number]>>([]);
  const [position, setPosition] = useState<RecorderState['position']>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);

  const runIdRef = useRef<string | null>(null);
  const activityTypeRef = useRef<'walk' | 'run' | 'cycle'>('run');
  const phaseRef = useRef<RecorderPhase>('restoring');
  const watchRef = useRef<number | null>(null);
  /** Backup watch without high accuracy, for when GPS is slow to lock (or the device has no GPS chip). */
  const coarseWatchRef = useRef<number | null>(null);
  const coarseTimerRef = useRef<number | null>(null);
  const preciseFixRef = useRef(false);
  /** Fixes recorded on this device for the current run, measured with the server's rule. */
  const fixesRef = useRef<TrackPoint[]>([]);
  const lastFixTimeRef = useRef(0);
  const lastFixRef = useRef<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  /** Steps this run, carried on every GPS fix so the server can verify them. Starts from the server's total on restore. */
  const stepsRef = useRef(0);
  const pedometerRef = useRef<Pedometer | null>(null);
  const motionAllowedRef = useRef(false);
  const [steps, setSteps] = useState<number | null>(null);
  const flushRef = useRef<Promise<boolean> | null>(null);

  phaseRef.current = phase;

  const refreshPending = useCallback(async () => {
    if (!runIdRef.current) return 0;
    const count = await countPending(runIdRef.current);
    setPendingCount(count);
    return count;
  }, []);

  /** Upload everything buffered for the run. Resolves `true` when nothing is left. */
  const flush = useCallback((): Promise<boolean> => {
    const runId = runIdRef.current;
    if (!runId) return Promise.resolve(true);
    if (flushRef.current) return flushRef.current;
    const job = (async () => {
      try {
        for (;;) {
          const batch = await pendingSamples(runId, 500);
          if (batch.length === 0) break;
          const result = await post<SampleUploadResult>(`/runs/${runId}/samples`, {
            samples: batch.map(({ sequence, latitude, longitude, accuracy: acc, stepCount, recordedAt }) => ({
              sequence,
              latitude,
              longitude,
              ...(acc !== undefined ? { accuracy: acc } : {}),
              ...(stepCount !== undefined ? { stepCount } : {}),
              recordedAt,
            })),
          });
          await acknowledge(runId, batch.map((sample) => sample.sequence));
          setUploadedMetres(result.distanceMetres);
        }
        setConnection('online');
        return true;
      } catch (err) {
        if (isApiError(err, 0)) setConnection('offline');
        else if (isApiError(err, 400)) {
          // The server only accepts samples while RUNNING — resync our view of the session.
          const fresh = await api<RunSession>(`/runs/${runId}`).catch(() => null);
          if (fresh) setSession(fresh);
        } else if (err instanceof Error) setError(err.message);
        return false;
      } finally {
        flushRef.current = null;
        await refreshPending();
      }
    })();
    flushRef.current = job;
    return job;
  }, [refreshPending]);

  const stopCoarseWatch = useCallback(() => {
    if (coarseTimerRef.current !== null) window.clearTimeout(coarseTimerRef.current);
    coarseTimerRef.current = null;
    if (coarseWatchRef.current !== null) navigator.geolocation.clearWatch(coarseWatchRef.current);
    coarseWatchRef.current = null;
  }, []);

  const stopWatch = useCallback(() => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    stopCoarseWatch();
    pedometerRef.current?.stop();
    pedometerRef.current = null;
  }, [stopCoarseWatch]);

  /** Record the latest step total now, so steps taken since the last GPS fix aren't lost on pause/finish. */
  const checkpointSteps = useCallback(async () => {
    const runId = runIdRef.current;
    const fix = lastFixRef.current;
    if (!runId || !fix || !motionAllowedRef.current) return;
    await appendSample(runId, { ...fix, stepCount: stepsRef.current, recordedAt: new Date().toISOString() });
  }, []);

  const recordFix = useCallback(
    async (position: GeolocationPosition) => {
      const runId = runIdRef.current;
      if (!runId || phaseRef.current !== 'recording') return;
      const { latitude, longitude, accuracy: acc } = position.coords;
      setAccuracy(acc);
      setLastFixAt(position.timestamp);
      setGpsError(null);
      setPosition({ latitude, longitude, accuracy: acc });

      if (position.timestamp <= lastFixTimeRef.current) return;
      lastFixTimeRef.current = position.timestamp;
      // Same rule the server verifies with (trailing-only, as the future isn't known yet).
      fixesRef.current.push({ latitude, longitude, accuracy: acc, recordedAt: new Date(position.timestamp) });
      if (acc <= MAX_USABLE_ACCURACY_METRES) setRoute((current) => [...current, [latitude, longitude]]);
      setLocalMetres(measureTrack(fixesRef.current, { trailing: true, activityType: activityTypeRef.current }).distanceMetres);
      if (acc > MAX_USABLE_ACCURACY_METRES) setGpsError(`Weak GPS (±${Math.round(acc)} m). Head outdoors with open sky. Weak fixes don’t count.`);

      lastFixRef.current = { latitude, longitude, accuracy: Math.round(acc * 10) / 10 };
      await appendSample(runId, {
        latitude,
        longitude,
        accuracy: Math.round(acc * 10) / 10,
        ...(motionAllowedRef.current ? { stepCount: stepsRef.current } : {}),
        recordedAt: new Date(position.timestamp).toISOString(),
      });
      const count = await refreshPending();
      if (count >= FLUSH_THRESHOLD) void flush();
    },
    [flush, refreshPending],
  );

  const startWatch = useCallback(() => {
    if (activityTypeRef.current !== 'cycle' && motionAllowedRef.current && !pedometerRef.current) {
      pedometerRef.current = startPedometer((added) => {
        stepsRef.current += added;
        setSteps(stepsRef.current);
      });
    }
    if (watchRef.current !== null || !('geolocation' in navigator)) return;
    preciseFixRef.current = false;
    // No timeout: a slow first lock just means waiting, not an error. Accurate fixes retire the backup watch.
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        if (position.coords.accuracy <= MAX_USABLE_ACCURACY_METRES) {
          preciseFixRef.current = true;
          stopCoarseWatch();
        }
        void recordFix(position);
      },
      (geoError) => setGpsError(geoError.code === 1 ? describeGeoError(geoError) : 'Waiting for GPS to lock on. Keep Jump open with a clear view of the sky.'),
      { enableHighAccuracy: true, maximumAge: 1_000 },
    );
    // If high-accuracy GPS hasn't answered in 12 s, also listen to network location so the map moves.
    coarseTimerRef.current = window.setTimeout(() => {
      coarseTimerRef.current = null;
      if (preciseFixRef.current || coarseWatchRef.current !== null) return;
      coarseWatchRef.current = navigator.geolocation.watchPosition(
        (position) => void recordFix(position),
        () => undefined,
        { enableHighAccuracy: false, maximumAge: 5_000 },
      );
    }, 12_000);
  }, [recordFix, stopCoarseWatch]);

  const adopt = useCallback((run: RunSession) => {
    runIdRef.current = run.id;
    activityTypeRef.current = run.activityType;
    setSession(run);
    setUploadedMetres(run.distanceMetres);
    setLocalMetres(run.distanceMetres);
    stepsRef.current = run.stepCount ?? 0; // carry on from the server's total after a refresh
  }, []);

  const reset = useCallback(async () => {
    stopWatch();
    const runId = runIdRef.current;
    runIdRef.current = null;
    fixesRef.current = [];
    lastFixTimeRef.current = 0;
    lastFixRef.current = null;
    stepsRef.current = 0;
    setSteps(null);
    clearActiveRun();
    if (runId) await clearRun(runId).catch(() => undefined);
    setSession(null);
    setUploadedMetres(0);
    setLocalMetres(0);
    setPendingCount(0);
    setAccuracy(null);
    setLastFixAt(null);
    setRoute([]);
    setPosition(null);
  }, [stopWatch]);

  // Restore a run that was in progress before a refresh or crash.
  useEffect(() => {
    let cancelled = false;
    const pointer = getActiveRun(user.id);
    setPhase('restoring');
    api<RunSession | null>('/runs/active')
      .then((activeRun) => activeRun ?? (pointer ? api<RunSession>(`/runs/${pointer.runId}`) : null))
      .then(async (run) => {
        if (cancelled) return;
        if (!run) {
          setPhase('idle');
          return;
        }
        setActiveRun({ runId: run.id, userId: user.id, startedAt: run.startedAt });
        adopt(run);
        // Android allows motion without asking; iOS needs a tap, so steps resume only where allowed.
        motionAllowedRef.current = await requestMotionPermission();
        if (motionAllowedRef.current) setSteps(stepsRef.current);
        if (run.status === 'RUNNING') {
          setPhase('recording');
          startWatch();
          void flush();
        } else if (run.status === 'PAUSED') {
          setPhase('paused');
          await refreshPending();
        } else {
          // Finished elsewhere (or finish succeeded just before a crash).
          await reset();
          setPhase('idle');
        }
      })
      .catch(async (err) => {
        if (cancelled) return;
        if (isApiError(err, 404)) {
          if (pointer) await clearRun(pointer.runId);
          await reset();
          setPhase('idle');
        } else {
          setError(err instanceof Error ? err.message : 'Couldn’t restore your run.');
          setPhase('unavailable');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [adopt, flush, refreshPending, reset, restoreAttempt, startWatch, user.id]);

  // Periodic upload while there is anything to send.
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = window.setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [flush, phase]);

  // Keep the screen awake while recording; browsers suspend GPS in the background.
  useEffect(() => {
    if (phase !== 'recording' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        lock = null;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [phase]);

  useEffect(() => stopWatch, [stopWatch]);

  const start = useCallback(async (activityType: 'walk' | 'run' | 'cycle' = 'run', fix: GeolocationPosition | null = null) => {
    // Must be the first thing a tap does: iOS only shows the motion prompt straight from the gesture.
    const motion = activityType === 'cycle' ? Promise.resolve(false) : requestMotionPermission();
    setError(null);
    setGpsError(null);
    setPhase('locating');
    // Starting needs location permission, not a precise fix: weak fixes are filtered out when measuring,
    // and waiting for a sharp one indoors could take forever. Use what the map already has, else a quick
    // coarse check. Only a refusal (or no geolocation at all) stops the start.
    let first: GeolocationPosition | null = fix && Date.now() - fix.timestamp < 30_000 ? fix : null;
    if (!first) {
      try {
        first = await getCurrentPosition(8_000, { enableHighAccuracy: false, maximumAge: 60_000 });
      } catch (geoError) {
        const code = (geoError as GeolocationPositionError | undefined)?.code;
        if (code === 1 || (geoError instanceof Error && geoError.message === 'unsupported')) {
          setGpsError(describeGeoError(geoError));
          setPhase('idle');
          return;
        }
        first = null; // No fix yet: start anyway, the watch picks up GPS when it arrives.
      }
    }
    try {
      const run = await post<RunSession>('/runs/start', { activityType });
      setActiveRun({ runId: run.id, userId: user.id, startedAt: run.startedAt });
      adopt(run);
      fixesRef.current = [];
      lastFixTimeRef.current = 0;
      stepsRef.current = 0;
      motionAllowedRef.current = await motion;
      setSteps(activityType === 'cycle' ? null : motionAllowedRef.current ? 0 : null);
      setLocalMetres(0);
      phaseRef.current = 'recording';
      setPhase('recording');
      if (first) await recordFix(first);
      else setGpsError('Waiting for GPS to lock on. Keep Jump open with a clear view of the sky.');
      startWatch();
    } catch (err) {
      if (isApiError(err, 409)) {
        setPhase('restoring');
        setRestoreAttempt((attempt) => attempt + 1);
      } else {
        setError(err instanceof Error ? err.message : 'Couldn’t start your run.');
        setPhase('idle');
      }
    }
  }, [adopt, recordFix, startWatch, user.id]);

  const pause = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId) return;
    setError(null);
    stopWatch();
    phaseRef.current = 'paused';
    setPhase('paused');
    await checkpointSteps();
    await flush();
    try {
      setSession(await post<RunSession>(`/runs/${runId}/pause`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t pause.');
      phaseRef.current = 'recording';
      setPhase('recording');
      startWatch();
    }
  }, [checkpointSteps, flush, startWatch, stopWatch]);

  const resume = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId) return;
    setError(null);
    try {
      setSession(await post<RunSession>(`/runs/${runId}/resume`));
      phaseRef.current = 'recording';
      setPhase('recording');
      startWatch();
      void flush();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t resume.');
    }
  }, [flush, startWatch]);

  const finish = useCallback(async (): Promise<Activity | null> => {
    const runId = runIdRef.current;
    if (!runId) return null;
    setError(null);
    stopWatch();
    phaseRef.current = 'finishing';
    setPhase('finishing');
    await checkpointSteps();

    let status = session?.status;
    try {
      if ((await countPending(runId)) > 0) {
        // Samples are only accepted while RUNNING, so briefly resume a paused run to upload the tail.
        if (status === 'PAUSED') {
          const resumed = await post<RunSession>(`/runs/${runId}/resume`);
          setSession(resumed);
          status = resumed.status;
        }
        if (!(await flush())) {
          const left = await countPending(runId);
          throw new Error(
            `${left} GPS ${left === 1 ? 'point is' : 'points are'} still waiting to upload. Check your connection and press finish again.`,
          );
        }
      }
      const activity = await post<Activity>(`/runs/${runId}/finish`);
      await reset();
      setPhase('idle');
      queryClient.setQueryData(keys.activity(activity.id), activity);
      void queryClient.invalidateQueries({ queryKey: keys.activities });
      return activity;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t finish your run.');
      const backTo = status === 'PAUSED' ? 'paused' : 'recording';
      phaseRef.current = backTo;
      setPhase(backTo);
      if (backTo === 'recording') startWatch();
      return null;
    }
  }, [checkpointSteps, flush, queryClient, reset, session?.status, startWatch, stopWatch]);

  const discard = useCallback(async (): Promise<boolean> => {
    const runId = runIdRef.current;
    if (!runId) return false;
    setError(null);
    const previous = phaseRef.current;
    stopWatch();
    phaseRef.current = 'finishing';
    setPhase('finishing');
    try {
      await post(`/runs/${runId}/discard`);
      await reset();
      setPhase('idle');
      return true;
    } catch (err) {
      // Already gone on the server (e.g. discarded on another device): clear it here too.
      if (isApiError(err, 404)) {
        await reset();
        setPhase('idle');
        return true;
      }
      setError(err instanceof Error ? err.message : 'Couldn’t discard your run.');
      const backTo = previous === 'paused' ? 'paused' : 'recording';
      phaseRef.current = backTo;
      setPhase(backTo);
      if (backTo === 'recording') startWatch();
      return false;
    }
  }, [reset, startWatch, stopWatch]);

  // Indoors GPS sees nothing; steps × stride is the honest estimate there.
  const stepMetres = steps ? stepDistanceMetres(steps, session?.activityType ?? 'walk') : 0;

  const value = useMemo<RecorderState>(
    () => ({
      phase,
      session,
      distanceMetres: Math.max(uploadedMetres, localMetres, stepMetres),
      steps,
      distanceFromSteps: stepMetres > Math.max(uploadedMetres, localMetres),
      uploadedMetres,
      pendingCount,
      connection,
      accuracy,
      lastFixAt,
      route,
      position,
      gpsError,
      error,
      start,
      pause,
      resume,
      finish,
      discard,
      retryRestore: () => setRestoreAttempt((n) => n + 1),
      clearError: () => setError(null),
    }),
    [accuracy, connection, discard, error, finish, gpsError, stepMetres, steps, lastFixAt, localMetres, pause, pendingCount, phase, position, resume, route, session, start, uploadedMetres],
  );

  return <RecorderContext.Provider value={value}>{children}</RecorderContext.Provider>;
}

export function useRecorder() {
  const value = useContext(RecorderContext);
  if (!value) throw new Error('useRecorder must be used inside RecorderProvider');
  return value;
}

/** Moving time in seconds, derived from the server's pause bookkeeping. */
export function movingSeconds(session: RunSession | null, now: number) {
  if (!session) return 0;
  const started = new Date(session.startedAt).getTime();
  const pausedNow = session.pausedAt ? Math.max(0, now - new Date(session.pausedAt).getTime()) : 0;
  return Math.max(0, Math.floor((now - started - pausedNow) / 1000) - session.pausedSeconds);
}
