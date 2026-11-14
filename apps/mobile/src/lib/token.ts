import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'jump_access_token';

// AFTER_FIRST_UNLOCK so iOS can still read it when it wakes Jump in the background with the phone locked.
// The default (WHEN_UNLOCKED) fails there, and the app came back to the login screen.
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

// The API client reads the token synchronously, so keep a copy in memory and load it once at startup.
let cached: string | null = null;

/** The stored token, null when there isn't one, or 'unreadable' when the keychain is locked right now. */
export async function loadToken(): Promise<string | null | 'unreadable'> {
  try {
    cached = await SecureStore.getItemAsync(TOKEN_KEY, OPTIONS);
  } catch {
    return 'unreadable';
  }
  // Moves tokens saved by older builds onto the background-readable setting.
  if (cached) void SecureStore.setItemAsync(TOKEN_KEY, cached, OPTIONS).catch(() => undefined);
  return cached;
}

export function getToken(): string | null {
  return cached;
}

export function setToken(token: string) {
  cached = token;
  void SecureStore.setItemAsync(TOKEN_KEY, token, OPTIONS);
}

export function clearToken() {
  cached = null;
  void SecureStore.deleteItemAsync(TOKEN_KEY, OPTIONS);
}
