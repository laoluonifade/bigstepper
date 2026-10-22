import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'jump_access_token';

// The API client reads the token synchronously, so keep a copy in memory and load it once at startup.
let cached: string | null = null;

export async function loadToken(): Promise<string | null> {
  cached = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  return cached;
}

export function getToken(): string | null {
  return cached;
}

export function setToken(token: string) {
  cached = token;
  void SecureStore.setItemAsync(TOKEN_KEY, token);
}

export function clearToken() {
  cached = null;
  void SecureStore.deleteItemAsync(TOKEN_KEY);
}
