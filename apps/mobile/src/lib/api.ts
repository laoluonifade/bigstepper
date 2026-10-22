import { createApiClient } from '@jump/shared/api';
import { clearToken, getToken } from './token';

export { ApiError, isApiError } from '@jump/shared/api';

const client = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://api.startajump.com/v1',
  getToken,
  clearToken,
});

export const { api, post, patch, onUnauthorized } = client;
