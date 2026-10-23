export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}

const FALLBACK_MESSAGES: Record<number, string> = {
  0: 'Can’t reach Jump. Check your connection and try again.',
  400: 'Some of those details aren’t valid.',
  401: 'Your session has ended. Please log in again.',
  403: 'You don’t have access to that.',
  404: 'We couldn’t find that.',
  409: 'That action conflicts with the current state. Refresh and try again.',
  503: 'This feature is switched off right now.',
};

/** Nest returns `message` as a string or an array of strings. Collapse it to one readable sentence. */
export function normalizeErrorMessage(payload: unknown, status: number): string {
  const fallback = FALLBACK_MESSAGES[status] ?? 'Something went wrong. Please try again.';
  if (!payload || typeof payload !== 'object') return fallback;
  const raw = (payload as { message?: unknown }).message;
  const parts = (Array.isArray(raw) ? raw : [raw]).filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0,
  );
  if (parts.length === 0) return fallback;
  const unique = [...new Set(parts.map((part) => part.trim()))];
  const sentence = unique.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('. ');
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

interface ClientConfig {
  baseUrl: string;
  /** Must be synchronous; platforms with async storage keep the token cached in memory. */
  getToken: () => string | null;
  clearToken: () => void;
  /** A stable id for this install, sent so the API can spot several accounts on one device. */
  getDeviceId?: () => string | null;
}

/** One fetch wrapper for web and mobile, so both handle errors and expired sessions the same way. */
export function createApiClient(config: ClientConfig) {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  let unauthorizedHandler: (() => void) | null = null;

  async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = config.getToken();
    const deviceId = config.getDeviceId?.();
    const form = typeof FormData !== 'undefined' && options.body instanceof FormData ? options.body : null;
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: options.method ?? 'GET',
        signal: options.signal,
        headers: {
          Accept: 'application/json',
          ...(options.body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(token && deviceId ? { 'X-Device-Id': deviceId } : {}),
        },
        body: form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      });
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') throw error;
      throw new ApiError(0, FALLBACK_MESSAGES[0]);
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      if (response.status === 401 && token) {
        config.clearToken();
        unauthorizedHandler?.();
      }
      throw new ApiError(response.status, normalizeErrorMessage(payload, response.status));
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    baseUrl,
    api,
    post: <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body }),
    patch: <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body }),
    /** Registered once by the auth module so any 401 clears the session centrally. */
    onUnauthorized(handler: () => void) {
      unauthorizedHandler = handler;
    },
  };
}
