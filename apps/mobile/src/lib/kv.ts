import type { Storage as SQLiteStorage } from 'expo-sqlite/kv-store';

type KeyValue = Pick<typeof SQLiteStorage, 'getItemSync' | 'setItemSync' | 'removeItemSync'>;

/**
 * Small saved settings (theme, sounds, push token, device id…), kept in SQLite. Loaded lazily and
 * defensively: where the native SQLite module is missing (an Android binary built without it), importing
 * it would crash the app at launch, so this falls back to memory for the session instead.
 */
const memory = new Map<string, string>();
const fallback: KeyValue = {
  getItemSync: (key) => memory.get(key) ?? null,
  setItemSync: (key, value) => { memory.set(key, typeof value === 'function' ? value(memory.get(key) ?? null) : value); },
  removeItemSync: (key) => memory.delete(key),
};

let store: KeyValue | null = null;
function load(): KeyValue {
  if (store) return store;
  try {
    store = (require('expo-sqlite/kv-store') as { Storage: typeof SQLiteStorage }).Storage;
    store.getItemSync('__probe__');
  } catch {
    store = fallback;
  }
  return store;
}

export const Storage: KeyValue = {
  getItemSync: (key) => load().getItemSync(key),
  setItemSync: (key, value) => load().setItemSync(key, value),
  removeItemSync: (key) => load().removeItemSync(key),
};
