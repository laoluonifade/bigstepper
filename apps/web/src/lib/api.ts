import { createApiClient } from '@jump/shared/api';
import { clearToken, getToken } from './token';

export { ApiError, isApiError, normalizeErrorMessage } from '@jump/shared/api';

const client = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:9090/v1',
  getToken,
  clearToken,
});

export const API_URL = client.baseUrl;
export const { api, post, patch, onUnauthorized } = client;
