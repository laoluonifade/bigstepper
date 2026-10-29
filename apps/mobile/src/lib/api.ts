import { createApiClient } from '@jump/shared/api';
import { gzipSync, strToU8 } from 'fflate';
import { Storage } from './kv';
import { clearToken, getToken } from './token';
import { xhrFetch } from './xhr';

export { ApiError, isApiError, normalizeErrorMessage } from '@jump/shared/api';

/** A random id for this install, kept across sign-ins (the API uses it to spot shared devices). */
function getDeviceId() {
  try {
    let id = Storage.getItemSync('jump_device');
    if (!id) {
      id = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      Storage.setItemSync('jump_device', id);
    }
    return id;
  } catch {
    return null;
  }
}

const client = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://api.startajump.com/v1',
  getToken,
  clearToken,
  getDeviceId,
  uploadFetch: xhrFetch,
  gzip: (json) => {
    const bytes = gzipSync(strToU8(json), { level: 6 });
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  },
});

export const API_URL = client.baseUrl;
/** The web app, for pages the phone app links out to (legal, shared links). */
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://startajump.com';
export const { api, post, patch, onUnauthorized } = client;
