/**
 * Finished runs whose GPS points are still on the phone. Ending a run never waits for them: the run is
 * finished on the server first, and the points follow quietly from here, in order, picking up from the
 * last batch Jump confirmed. Nothing about this shows while recording; the activity page notes it.
 *
 * Retries back off (with a little randomness so phones don't all retry at once) and start over whenever
 * the app comes back to the front. A batch Jump refuses outright (the run is already checked, or gone)
 * is dropped instead of retried forever.
 */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { api, isApiError } from './api';
import { Storage } from './kv';
import { acknowledge, clearRun, countPending, pendingSamples, type BufferedSample } from './run-buffer';

const KEY = 'jump_run_uploads';
const BATCH = 500;
const TIMEOUT_MS = 20_000;
const FIRST_RETRY_MS = 5_000;
const LONGEST_RETRY_MS = 10 * 60_000;

const GZIP_OFF_KEY = 'jump_gzip_off';

const listeners = new Set<() => void>();
let gzipWorks = (() => { try { return Storage.getItemSync(GZIP_OFF_KEY) !== '1'; } catch { return true; } })();

const wire = (batch: BufferedSample[]) => batch.map(({ sequence, latitude, longitude, accuracy, stepCount, recordedAt }) => ({
  sequence, latitude, longitude, ...(accuracy !== undefined ? { accuracy } : {}), ...(stepCount !== undefined ? { stepCount } : {}), recordedAt,
}));

/**
 * Send a batch of points, gzipped. Should a compressed upload fail where the same batch goes through
 * plain, this phone stops compressing for good, so a platform that can't send compressed bodies never gets stuck.
 */
export async function postPoints<T>(runId: string, batch: BufferedSample[], signal?: AbortSignal): Promise<T> {
  const request = (compress: boolean) => api<T>(`/runs/${runId}/samples`, { method: 'POST', body: { samples: wire(batch) }, signal, compress });
  if (!gzipWorks) return request(false);
  try {
    return await request(true);
  } catch (error) {
    if ((error as { name?: string } | null)?.name === 'AbortError' || !(isApiError(error, 0) || isApiError(error, 400) || isApiError(error, 415))) throw error;
    const result = await request(false);
    gzipWorks = false;
    try { Storage.setItemSync(GZIP_OFF_KEY, '1'); } catch { /* compression stays off for this session anyway */ }
    return result;
  }
}
let draining: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;

function read(): string[] {
  try { return JSON.parse(Storage.getItemSync(KEY) ?? '[]') as string[]; } catch { return []; }
}

function write(ids: string[]) {
  try { Storage.setItemSync(KEY, JSON.stringify(ids)); } catch { /* storage unavailable: the points stay in the buffer */ }
  snapshot = ids;
  listeners.forEach((listener) => listener());
}

let snapshot = read();

/** Hand a finished run's remaining points over to be sent in the background. */
export function queueUpload(runId: string) {
  if (!snapshot.includes(runId)) write([...snapshot, runId]);
  void drainUploads();
}

function done(runId: string) {
  clearRun(runId);
  write(snapshot.filter((id) => id !== runId));
}

/** Network trouble and server hiccups are worth another go; anything else Jump won't ever accept. */
const retryable = (error: unknown) =>
  (error as { name?: string } | null)?.name === 'AbortError' || isApiError(error, 0) || isApiError(error, 429) || isApiError(error, 408)
  || (isApiError(error) && error.status >= 500);

async function send(runId: string) {
  for (;;) {
    const batch = pendingSamples(runId, BATCH);
    if (!batch.length) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      await postPoints(runId, batch, controller.signal);
    } finally {
      clearTimeout(timer);
    }
    acknowledge(runId, batch.map((sample) => sample.sequence));
  }
}

function retryLater() {
  if (retryTimer || !snapshot.length) return;
  failures += 1;
  const wait = Math.min(LONGEST_RETRY_MS, FIRST_RETRY_MS * 2 ** (failures - 1));
  retryTimer = setTimeout(() => { retryTimer = null; void drainUploads(); }, wait * (0.75 + Math.random() * 0.5));
}

/** Send whatever is waiting, one run after another. Safe to call any time; only one pass runs at once. */
export function drainUploads(): Promise<void> {
  if (draining) return draining;
  draining = (async () => {
    for (const runId of [...snapshot]) {
      try {
        await send(runId);
        if (countPending(runId) === 0) done(runId);
      } catch (error) {
        if (retryable(error)) { retryLater(); return; }
        if (__DEV__) console.warn(`Dropping GPS upload for run ${runId}:`, error instanceof Error ? error.message : error);
        done(runId);
      }
    }
    failures = 0;
  })().finally(() => { draining = null; });
  return draining;
}

AppState.addEventListener('change', (next) => {
  if (next !== 'active' || !snapshot.length) return;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  failures = 0;
  void drainUploads();
});

/** Whether this run's points are still on their way up from this phone. */
export function useStillUploading(runId: string | null | undefined) {
  const ids = useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => snapshot);
  return Boolean(runId && ids.includes(runId));
}
