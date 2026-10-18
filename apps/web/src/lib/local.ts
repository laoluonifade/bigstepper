/**
 * Small, per-account browser storage for things the API has no list endpoint for yet
 * (tables you joined, clubs you created) plus purely personal preferences.
 * Everything here is a convenience cache — the API stays authoritative.
 */
import { useCallback, useEffect, useState } from 'react';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('jump:storage', { detail: key }));
}

export function useStored<T>(key: string | null, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => (key ? read(key, fallback) : fallback));

  useEffect(() => {
    if (!key) return;
    setValue(read(key, fallback));
    const sync = (event: Event) => {
      const changed = event instanceof StorageEvent ? event.key : (event as CustomEvent<string>).detail;
      if (changed === key) setValue(read(key, fallback));
    };
    window.addEventListener('storage', sync);
    window.addEventListener('jump:storage', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('jump:storage', sync);
    };
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      if (!key) return;
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(read(key, fallback)) : next;
      write(key, resolved);
    },
    [key],
  );

  return [value, update];
}

export interface SavedTable {
  id: string;
  code: string;
  title: string;
}

export interface SavedClub {
  id: string;
  name: string;
  slug: string;
}

export const storageKeys = {
  tables: (userId: string) => `jump_tables:${userId}`,
  clubs: (userId: string) => `jump_clubs:${userId}`,
  weeklyGoal: (userId: string) => `jump_goal:${userId}`,
  verifyPrompt: (userId: string) => `jump_verify_prompt:${userId}`,
};

export function rememberTable(userId: string, table: SavedTable) {
  const key = storageKeys.tables(userId);
  const existing = read<SavedTable[]>(key, []).filter((item) => item.id !== table.id);
  write(key, [table, ...existing].slice(0, 20));
}

export function forgetTable(userId: string, tableId: string) {
  const key = storageKeys.tables(userId);
  write(
    key,
    read<SavedTable[]>(key, []).filter((item) => item.id !== tableId),
  );
}

export function rememberClub(userId: string, club: SavedClub) {
  const key = storageKeys.clubs(userId);
  const existing = read<SavedClub[]>(key, []).filter((item) => item.id !== club.id);
  write(key, [club, ...existing].slice(0, 20));
}

export function setFlag(key: string, value: boolean) {
  write(key, value);
}
