/**
 * Durable GPS sample buffer, as the web's IndexedDB one: every fix is written to SQLite with a sequence
 * number *before* upload. An acknowledged one is marked uploaded, not deleted, and the whole run stays on
 * the phone until it's saved, so finishing can send everything again if the server turns out to be
 * missing some. Retries resend the exact same sequence numbers, which keeps uploads idempotent. Synchronous, so the background location task can write
 * a batch of fixes in one go even if the rest of the app isn't running.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { readStored, removeStored, writeStored } from './local';

export interface BufferedSample {
  runId: string;
  sequence: number;
  latitude: number;
  longitude: number;
  accuracy?: number;
  /** Steps since the run started (from the motion sensors), when available. */
  stepCount?: number;
  recordedAt: string;
}

type Row = { runId: string; sequence: number; latitude: number; longitude: number; accuracy: number | null; stepCount: number | null; recordedAt: string };

let db: SQLiteDatabase | null = null;

function open() {
  if (!db) {
    // Required here, not at the top: a binary without SQLite then fails only when recording, not at launch.
    const { openDatabaseSync } = require('expo-sqlite') as typeof import('expo-sqlite');
    db = openDatabaseSync('jump-runs.db');
    db.execSync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS samples (runId TEXT NOT NULL, sequence INTEGER NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL, accuracy REAL, stepCount INTEGER, recordedAt TEXT NOT NULL, PRIMARY KEY (runId, sequence));
      CREATE TABLE IF NOT EXISTS meta (runId TEXT PRIMARY KEY NOT NULL, lastSequence INTEGER NOT NULL);
    `);
    // Phones that recorded before points were kept until saving: their table has no uploaded column yet.
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(samples)');
    if (!columns.some((column) => column.name === 'uploaded')) db.execSync('ALTER TABLE samples ADD COLUMN uploaded INTEGER NOT NULL DEFAULT 0');
  }
  return db;
}

/** Assigns the next sequence numbers for the run and stores the samples in one transaction. */
export function appendSamples(runId: string, samples: Array<Omit<BufferedSample, 'runId' | 'sequence'>>) {
  if (samples.length === 0) return;
  const database = open();
  database.withTransactionSync(() => {
    let sequence = database.getFirstSync<{ lastSequence: number }>('SELECT lastSequence FROM meta WHERE runId = ?', runId)?.lastSequence ?? 0;
    for (const sample of samples) {
      sequence += 1;
      database.runSync('INSERT OR REPLACE INTO samples (runId, sequence, latitude, longitude, accuracy, stepCount, recordedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        runId, sequence, sample.latitude, sample.longitude, sample.accuracy ?? null, sample.stepCount ?? null, sample.recordedAt);
    }
    database.runSync('INSERT OR REPLACE INTO meta (runId, lastSequence) VALUES (?, ?)', runId, sequence);
  });
}

export function pendingSamples(runId: string, limit = 500): BufferedSample[] {
  return open().getAllSync<Row>('SELECT * FROM samples WHERE runId = ? AND uploaded = 0 ORDER BY sequence LIMIT ?', runId, limit).map((row) => ({
    runId: row.runId,
    sequence: row.sequence,
    latitude: row.latitude,
    longitude: row.longitude,
    ...(row.accuracy !== null ? { accuracy: row.accuracy } : {}),
    ...(row.stepCount !== null ? { stepCount: row.stepCount } : {}),
    recordedAt: row.recordedAt,
  }));
}

/** Every point recorded for the run, in order, as the distance measure takes them. */
export function recordedPoints(runId: string) {
  return open().getAllSync<Row>('SELECT * FROM samples WHERE runId = ? ORDER BY sequence', runId).map((row) => ({
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy ?? 999,
    recordedAt: new Date(row.recordedAt),
    stepCount: row.stepCount,
  }));
}

export function countPending(runId: string): number {
  return open().getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM samples WHERE runId = ? AND uploaded = 0', runId)?.count ?? 0;
}

/** Every point recorded for the run, uploaded or not: what the server should have by the time it's finished. */
export function countRecorded(runId: string): number {
  return open().getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM samples WHERE runId = ?', runId)?.count ?? 0;
}

/** The server is missing points: queue every one recorded for the run to be sent again. */
export function resendAll(runId: string) {
  open().runSync('UPDATE samples SET uploaded = 0 WHERE runId = ?', runId);
}

export function acknowledge(runId: string, sequences: number[]) {
  const database = open();
  database.withTransactionSync(() => {
    for (const sequence of sequences) database.runSync('UPDATE samples SET uploaded = 1 WHERE runId = ? AND sequence = ?', runId, sequence);
  });
}

export function clearRun(runId: string) {
  const database = open();
  database.withTransactionSync(() => {
    database.runSync('DELETE FROM samples WHERE runId = ?', runId);
    database.runSync('DELETE FROM meta WHERE runId = ?', runId);
  });
}

const ACTIVE_KEY = 'jump_active_run';

export interface ActiveRunPointer {
  runId: string;
  userId: string;
  startedAt: string;
  activityType: 'walk' | 'run' | 'cycle';
}

export function getActiveRun(userId?: string): ActiveRunPointer | null {
  const value = readStored<ActiveRunPointer | null>(ACTIVE_KEY, null);
  return value && (!userId || value.userId === userId) ? value : null;
}

export function setActiveRun(pointer: ActiveRunPointer) {
  writeStored(ACTIVE_KEY, pointer);
}

export function clearActiveRun() {
  removeStored(ACTIVE_KEY);
}
