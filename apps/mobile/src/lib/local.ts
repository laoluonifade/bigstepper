/**
 * Small, per-account storage on the phone for things the API has no endpoint for, plus personal
 * preferences: the same contract as the web's lib/local.ts, kept in SQLite instead of localStorage.
 * Everything here is a convenience cache; the API stays authoritative.
 */
import { useCallback, useEffect, useState } from 'react';
import { Storage } from './kv';

const listeners = new Set<(key: string) => void>();

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = Storage.getItemSync(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored<T>(key: string, value: T) {
  try {
    Storage.setItemSync(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the value just isn't remembered.
  }
  listeners.forEach((listener) => listener(key));
}

export function removeStored(key: string) {
  try {
    Storage.removeItemSync(key);
  } catch {
    // Nothing to remove.
  }
  listeners.forEach((listener) => listener(key));
}

export function useStored<T>(key: string | null, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => (key ? readStored(key, fallback) : fallback));

  useEffect(() => {
    if (!key) return;
    setValue(readStored(key, fallback));
    const sync = (changed: string) => {
      if (changed === key) setValue(readStored(key, fallback));
    };
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
    // The fallback is a default, not an input: a fresh literal each render mustn't re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      if (!key) return;
      writeStored(key, typeof next === 'function' ? (next as (prev: T) => T)(readStored(key, fallback)) : next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return [value, update];
}

export const storageKeys = {
  activityKind: (userId: string) => `jump_kind:${userId}`,
  verifyPrompt: (userId: string) => `jump_verify_prompt:${userId}`,
};
