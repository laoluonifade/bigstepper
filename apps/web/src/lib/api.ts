import { createApiClient } from '@jump/shared/api';
import { clearToken, getToken } from './token';

export { ApiError, isApiError, normalizeErrorMessage } from '@jump/shared/api';

/** A random id for this browser, kept across sign-ins. */
function getDeviceId() {
  try {
    let id = localStorage.getItem('jump_device');
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, '');
      localStorage.setItem('jump_device', id);
    }
    return id;
  } catch {
    return null;
  }
}

const client = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:9090/v1',
  getToken,
  clearToken,
  getDeviceId,
});

export const API_URL = client.baseUrl;
export const { api, post, patch, onUnauthorized } = client;
