/**
 * Durable GPS sample buffer. Every fix is written to IndexedDB with a sequence
 * number *before* upload, and only deleted once the API has acknowledged it.
 * Retries resend the exact same sequence numbers, which keeps uploads idempotent.
 */
export interface BufferedSample {
  runId: string;
  sequence: number;
  latitude: number;
  longitude: number;
  accuracy?: number;
  recordedAt: string;
}

const DB_NAME = 'jump-runs';
const SAMPLES = 'samples';
const META = 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const samples = db.createObjectStore(SAMPLES, { keyPath: ['runId', 'sequence'] });
      samples.createIndex('byRun', 'runId');
      db.createObjectStore(META, { keyPath: 'runId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

function done(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function result<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runRange(runId: string) {
  return IDBKeyRange.bound([runId, -Infinity], [runId, Infinity]);
}

/** Assigns the next sequence number for the run and stores the sample atomically. */
export async function appendSample(runId: string, sample: Omit<BufferedSample, 'runId' | 'sequence'>): Promise<number> {
  const db = await openDb();
  const tx = db.transaction([SAMPLES, META], 'readwrite');
  const meta = tx.objectStore(META);
  const current = (await result(meta.get(runId))) as { runId: string; lastSequence: number } | undefined;
  const sequence = (current?.lastSequence ?? 0) + 1;
  meta.put({ runId, lastSequence: sequence });
  tx.objectStore(SAMPLES).put({ ...sample, runId, sequence });
  await done(tx);
  return sequence;
}

export async function pendingSamples(runId: string, limit = 500): Promise<BufferedSample[]> {
  const db = await openDb();
  const tx = db.transaction(SAMPLES, 'readonly');
  return result(tx.objectStore(SAMPLES).getAll(runRange(runId), limit)) as Promise<BufferedSample[]>;
}

export async function countPending(runId: string): Promise<number> {
  const db = await openDb();
  return result(db.transaction(SAMPLES, 'readonly').objectStore(SAMPLES).count(runRange(runId)));
}

export async function acknowledge(runId: string, sequences: number[]) {
  const db = await openDb();
  const tx = db.transaction(SAMPLES, 'readwrite');
  const store = tx.objectStore(SAMPLES);
  for (const sequence of sequences) store.delete([runId, sequence]);
  await done(tx);
}

export async function clearRun(runId: string) {
  const db = await openDb();
  const tx = db.transaction([SAMPLES, META], 'readwrite');
  tx.objectStore(SAMPLES).delete(runRange(runId));
  tx.objectStore(META).delete(runId);
  await done(tx);
}

const ACTIVE_KEY = 'jump_active_run';

export interface ActiveRunPointer {
  runId: string;
  userId: string;
  startedAt: string;
}

export function getActiveRun(userId: string): ActiveRunPointer | null {
  try {
    const value = JSON.parse(localStorage.getItem(ACTIVE_KEY) ?? 'null') as ActiveRunPointer | null;
    return value && value.userId === userId ? value : null;
  } catch {
    return null;
  }
}

export function setActiveRun(pointer: ActiveRunPointer) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(pointer));
  window.dispatchEvent(new CustomEvent('jump:storage', { detail: ACTIVE_KEY }));
}

export function clearActiveRun() {
  localStorage.removeItem(ACTIVE_KEY);
  window.dispatchEvent(new CustomEvent('jump:storage', { detail: ACTIVE_KEY }));
}

export const ACTIVE_RUN_KEY = ACTIVE_KEY;
