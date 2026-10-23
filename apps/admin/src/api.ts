import { createApiClient } from '@jump/shared/api';

export { ApiError, isApiError } from '@jump/shared/api';

/** The admin console keeps its own sign-in, apart from the runner app's. */
const TOKEN_KEY = 'jump_admin_token';

export function getAdminToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setAdminToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
}

const client = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:9090/v1',
  getToken: getAdminToken,
  clearToken: clearAdminToken,
});

export const { api, post, patch, onUnauthorized } = client;

/** Where the runner app lives, for "open in Jump" links. */
export const APP_ORIGIN: string = import.meta.env.VITE_APP_ORIGIN ?? (import.meta.env.PROD ? 'https://startajump.com' : 'http://localhost:5177');

export const appUrl = (path: string) => `${APP_ORIGIN}${path}`;
